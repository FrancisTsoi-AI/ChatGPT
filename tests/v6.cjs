/* Round 6: Home Base as ONE file, like WordPress. Builds real sites in a scratch folder and drives them in a browser:
 *   - a new site from nothing but dist/homebase-setup.php (database, passphrase, private folder, 24 gadgets);
 *   - the Gadgets & updates page: built-in catalog (add back a deleted gadget), Home Base updates from a dropped file
 *     (.zip and .php), stale files removed, data / settings / your own gadgets kept, bad packages refused;
 *   - the installer cannot be used to take over a site, and it expires;
 *   - old sites (versions 1, 2 and 4 from git history) updated by uploading the one file.
 * Needs: python3 tools/build-zip.py first; the mysql CLI with admin rights over the socket (it creates the databases
 * homebase_v6 and homebase_v6_old for the app's DB user from private/.env); free ports 8086-8088 (it starts its own
 * PHP servers). The repo's own server on BASE (default :8080) is used once, to prove a source checkout refuses updates.
 *   PLAYWRIGHT_PATH=... CHROME=... node tests/v6.cjs */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { zip } = require('./lib/zip.cjs');

const REPO = path.join(__dirname, '..');
const DIST = path.join(REPO, 'dist');
const SCRATCH = process.env.V6_DIR || path.join(os.tmpdir(), 'homebase-v6');
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const DEV_PASS = process.env.PASS || 'test-passphrase-123';
const PASS = 'v6-passphrase-long';
const MYSQL = process.env.MYSQL_ADMIN || 'mysql';
let failures = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failures++; };
const section = (t) => console.log('\n# ' + t);
const sha = (f) => require('crypto').createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const sql = (q) => execFileSync(MYSQL, ['-N', '-e', q]).toString().trim();
const py = (args) => execFileSync('python3', ['-I', ...args]).toString();
const env = Object.fromEntries(fs.readFileSync(path.join(REPO, 'private', '.env'), 'utf8').split('\n')
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const [k, ...v] = l.split('='); return [k, v.join('=').trim().replace(/^(['"])(.*)\1$/, '$2')]; }));
const DB = { host: 'localhost', user: env.DB_USER, pass: env.DB_PASS };
const freshDb = (name) => sql(`DROP DATABASE IF EXISTS ${name}; CREATE DATABASE ${name} CHARACTER SET utf8mb4; GRANT ALL ON ${name}.* TO '${DB.user}'@'localhost'`);

const servers = [];
async function serve(port, root, extraEnv) {
  const p = spawn('php', ['-S', '127.0.0.1:' + port, '-t', root, '-d', 'upload_max_filesize=25M', '-d', 'post_max_size=26M'],
    { env: Object.assign({}, process.env, extraEnv || {}), stdio: 'ignore' });
  servers.push(p);
  for (let i = 0; i < 50; i++) {
    const up = await new Promise((r) => http.get('http://127.0.0.1:' + port + '/__ping', (res) => { res.resume(); r(true); }).on('error', () => r(false)));
    if (up) return p;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server on ' + port + ' did not start');
}
const stop = (p) => { try { p.kill(); } catch (e) { /* gone */ } };

(async () => {
  for (const f of ['homebase-setup.php', 'homebase.zip']) {
    if (!fs.existsSync(path.join(DIST, f))) { console.error('Run python3 tools/build-zip.py first'); process.exit(2); }
  }
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const errors = [];
  const newPage = async () => {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 }, timezoneId: 'Asia/Singapore' })).newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/status of (40[0-9]|410|413|500)|ERR_FAILED/.test(m.text())) errors.push('console: ' + m.text()); });
    return page;
  };
  const signIn = async (page, base, pass) => { await page.goto(base + '/'); await page.fill('#pass', pass); await page.click('button[type=submit]'); await page.waitForSelector('.tile', { timeout: 15000 }); };
  const ready = (page) => page.waitForFunction(() => window.HB && HB.store && HB.store.data && HB.board && HB.board.el, null, { timeout: 15000 });
  const reloaded = async (page, fn) => { await Promise.all([page.waitForEvent('load', { timeout: 20000 }), fn()]); await ready(page); await page.waitForTimeout(300); };
  const openGadgets = async (page) => { await page.click('#btn-menu'); await page.locator('.menu-item', { has: page.locator('.menu-label', { hasText: /^Gadgets & updates…$/ }) }).click(); await page.waitForSelector('.ga-version'); };
  const post = (page, route, body) => page.evaluate(async ([route, body]) => {
    const r = await fetch('api.php?r=' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': HB.api.csrf() }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, [route, body]);
  const up = (page, buf, name) => page.evaluate(async ([b64, name]) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fd = new FormData(); fd.append('file', new Blob([bin]), name);
    const r = await fetch('api.php?r=gadgets/upload', { method: 'POST', headers: { 'X-CSRF-Token': HB.api.csrf() }, body: fd });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, [buf.toString('base64'), name]);

  // ===================================================================================== one-file install
  section('a new site from ONE file');
  const site = path.join(SCRATCH, 'site');
  const www = path.join(site, 'www');
  const priv = path.join(site, 'homebase-private');
  fs.mkdirSync(www, { recursive: true });
  fs.copyFileSync(path.join(DIST, 'homebase-setup.php'), path.join(www, 'homebase-setup.php'));
  freshDb('homebase_v6');
  await serve(8086, www);
  const S = 'http://127.0.0.1:8086';
  const page = await newPage();
  await page.goto(S + '/homebase-setup.php');
  ok(/Install Home Base 5\.\d+\.\d+/.test(await page.textContent('h1')) && (await page.locator('.bad').count()) === 0, 'opening the uploaded file shows a host check (all green) and a short form');
  ok((await page.textContent('main')).includes(priv), 'it says where the private folder will go: next to the web folder, outside it');
  const fill = async (dbPass, p1, p2) => {
    await page.fill('#db_host', 'localhost'); await page.fill('#db_name', 'homebase_v6'); await page.fill('#db_user', DB.user);
    await page.fill('#db_pass', dbPass); await page.fill('#p1', p1); await page.fill('#p2', p2);
    await page.click('button[type=submit]');
  };
  await fill('not-the-password', PASS, PASS);
  ok(/Could not connect to the database/.test(await page.textContent('.err')) && !fs.existsSync(priv), 'a wrong database password is caught before anything is written');
  await page.evaluate(() => document.querySelectorAll('[minlength]').forEach((e) => e.removeAttribute('minlength'))); // test the server's own check
  await fill(DB.pass, 'short', 'short');
  ok(/at least 10 characters/.test(await page.textContent('.err')), 'a short passphrase is refused');
  await fill(DB.pass, PASS, PASS);
  await page.waitForSelector('h1:has-text("Home Base is installed")', { timeout: 30000 });
  ok(/24 gadgets added/.test(await page.textContent('main')), 'installed, with every built-in gadget');
  const envText = fs.readFileSync(path.join(priv, '.env'), 'utf8');
  ok(/^DB_NAME='homebase_v6'$/m.test(envText) && /^HB_PASSPHRASE_HASH='\$2y\$/m.test(envText) && (fs.statSync(path.join(priv, '.env')).mode & 0o777) === 0o600,
    'it wrote the settings file itself (passphrase only as a hash, readable by you only)');
  ok(fs.readdirSync(path.join(priv, 'gadgets')).filter((d) => !d.startsWith('.')).length === 24 && fs.readdirSync(path.join(priv, 'catalog')).length === 24
    && fs.existsSync(path.join(priv, 'core.json')) && !fs.existsSync(path.join(www, 'gadgets')), 'gadgets live in the private folder, with the catalog of built-in ones');
  ok(!fs.existsSync(path.join(www, 'homebase-setup.php')), 'the installer deleted itself');
  ok(sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'homebase_v6'") === '9', 'and created the 9 tables');
  await page.click('a:has-text("Open Home Base")');
  await page.fill('#pass', PASS); await page.click('button[type=submit]');
  await page.waitForSelector('.tile'); await ready(page);
  const app = await page.evaluate(() => ({ types: HB.gadgets.types().length, tabs: [...document.querySelectorAll('.tab')].map((t) => t.textContent).join() }));
  ok(app.types === 24 && /Work/.test(app.tabs), 'signing in shows a working Home Base (24 gadgets, the starter scenarios)');
  ok((await page.evaluate(async () => (await fetch('homebase-setup.php')).status)) === 404, 'the installer is gone from the site');

  // ===================================================================================== catalog
  section('built-in gadgets: one click, no file');
  await post(page, 'gadgets/delete', { type: 'stats', trash_tiles: false });
  await page.reload(); await ready(page);
  await openGadgets(page);
  ok(/5\.2\.0/.test(await page.textContent('.ga-version')) && await page.locator('.ga-avail .ga-row[data-type="stats"]').count() === 1, 'a deleted built-in gadget is offered under "Built-in gadgets you can add"');
  await reloaded(page, () => page.locator('.ga-avail .ga-row[data-type="stats"] button', { hasText: 'Add' }).click());
  ok(await page.evaluate(() => HB.gadgets.has('stats')) && fs.existsSync(path.join(priv, 'gadgets', 'stats', 'manifest.json')), 'one click adds it back from the catalog');
  // something of yours that updates must keep: a gadget you added, a thought, the settings file
  const mine = zip({ 'mine/manifest.json': JSON.stringify({ type: 'mine', version: '1.0.0', label: 'Mine', icon: '⭐', group: 'Everyday', size: { w: 3, h: 2 } }),
    'mine/gadget.js': "HB.gadgets.define('mine', class extends HB.Gadget { render(b) { b.textContent = 'mine'; } });" });
  const um = await up(page, mine, 'mine.zip');
  const im = await post(page, 'gadgets/install', { token: um.json.token, passphrase: PASS });
  await page.evaluate(async () => { const t = HB.store.tilesOf(HB.app.scenarioId).find((x) => x.type === 'thoughts'); await HB.store.create('thoughts', { tile_id: t.id, text: 'kept through updates' }); });
  await page.waitForFunction(() => HB.store.status === 'saved' && !HB.store.ops.length);
  const envSha = sha(path.join(priv, '.env'));
  ok(im.status === 200, 'a gadget of your own is installed (to check updates keep it)');

  // ===================================================================================== updates
  section('update Home Base by dropping one file');
  const p501 = path.join(SCRATCH, 'homebase-5.2.1.zip');
  py([path.join(REPO, 'tests', 'lib', 'make-package.py'), path.join(DIST, 'homebase.zip'), p501, '--version', '5.2.1',
    '--append', 'web/css/app.css=\n/* v6-marker-501 */\n', '--put', 'web/v6-only.txt=temporary', '--gadget', 'clock=1.0.1']);
  await page.reload(); await ready(page);
  await openGadgets(page);
  await page.setInputFiles('.ga-drop input[type=file]', p501);
  await page.waitForSelector('.ga-confirm');
  const pv = await page.textContent('.ga-confirm');
  ok(/Home Base 5\.2\.1/.test(pv) && /You have 5\.2\.0/.test(pv) && /Clock 1\.0\.0 → 1\.0\.1/.test(pv) && /kept/.test(pv), 'the dialog says 5.2.0 → 5.2.1, which gadgets update, and that your things are kept');
  await page.fill('.ga-pass', 'wrong-passphrase');
  await page.click('.modal .btn.primary:has-text("Update Home Base")');
  await page.waitForSelector('.ga-confirm .form-err:not([hidden])');
  ok(/Wrong passphrase/.test(await page.textContent('.ga-confirm .form-err')) && JSON.parse(fs.readFileSync(path.join(priv, 'core.json'))).version === '5.2.0', 'nothing happens without your passphrase');
  fs.readdirSync(path.join(priv, 'storage', 'ratelimit')).forEach((f) => fs.unlinkSync(path.join(priv, 'storage', 'ratelimit', f)));
  await page.fill('.ga-pass', PASS);
  await reloaded(page, () => page.click('.modal .btn.primary:has-text("Update Home Base")'));
  const css = await page.evaluate(async () => (await fetch(document.querySelector('link[href^="assets.php?b=css"]').href)).text());
  const clockV = JSON.parse(fs.readFileSync(path.join(priv, 'gadgets', 'clock', 'manifest.json'))).version;
  ok(JSON.parse(fs.readFileSync(path.join(priv, 'core.json'))).version === '5.2.1' && css.includes('v6-marker-501') && fs.existsSync(path.join(www, 'v6-only.txt')) && clockV === '1.0.1',
    'Home Base is updated in place: new program files are live and the built-in Clock gadget is updated');
  const kept = await page.evaluate(() => ({ thought: HB.store.data.thoughts.some((t) => t.text === 'kept through updates'), mine: HB.gadgets.has('mine'), stats: HB.gadgets.has('stats') }));
  ok(kept.thought && kept.mine && kept.stats && sha(path.join(priv, '.env')) === envSha, 'your data, your settings file and the gadgets you added are untouched');
  await openGadgets(page);
  ok(/5\.2\.1/.test(await page.textContent('.ga-version')), 'the Gadgets & updates page shows the new version');
  await page.keyboard.press('Escape');

  const p502 = path.join(SCRATCH, 'homebase-setup-5.2.2.php');
  py([path.join(REPO, 'tests', 'lib', 'make-package.py'), path.join(DIST, 'homebase.zip'), p502, '--version', '5.2.2', '--setup', path.join(DIST, 'homebase-setup.php')]);
  const u2 = await up(page, fs.readFileSync(p502), 'homebase-setup.php');
  ok(u2.status === 200 && u2.json.preview.kind === 'core' && u2.json.preview.version === '5.2.2', 'the same homebase-setup.php file is accepted for updates too');
  const i2 = await post(page, 'gadgets/install', { token: u2.json.token, passphrase: PASS });
  ok(i2.status === 200 && i2.json.report.removed >= 1 && !fs.existsSync(path.join(www, 'v6-only.txt')), 'files the new version no longer has are removed');
  const older = await up(page, fs.readFileSync(path.join(DIST, 'homebase-setup.php')), 'homebase-setup.php');
  ok(older.status === 200 && older.json.preview.notes.some((n) => /OLDER/.test(n)), 'dropping an older Home Base warns first');

  const bad = [
    ['a ../ path', ['--raw', 'web/../evil.php=<?php echo 1;']],
    ['a .env file', ['--put', 'private/.env=DB_PASS=x']],
    ['a gadget folder inside', ['--put', 'private/gadgets/x/gadget.js=1']],
    ['missing program files', ['--drop', 'web/index.php']],
    ['a fake homebase.json', ['--put', 'homebase.json={"name":"Other","version":"1.0"}']],
  ];
  for (const [what, args] of bad) {
    const f = path.join(SCRATCH, 'bad.zip');
    py([path.join(REPO, 'tests', 'lib', 'make-package.py'), path.join(DIST, 'homebase.zip'), f, ...args]);
    const r = await up(page, fs.readFileSync(f), 'homebase.zip');
    ok(r.status === 400, 'refused: ' + what + ' (' + ((r.json || {}).error || r.status) + ')');
  }
  ok(JSON.parse(fs.readFileSync(path.join(priv, 'core.json'))).version === '5.2.2' && !fs.existsSync(path.join(site, 'evil.php')), 'and nothing was changed by them');

  const dev = await newPage();
  await signIn(dev, BASE, DEV_PASS);
  const devUp = await up(dev, fs.readFileSync(path.join(DIST, 'homebase.zip')), 'homebase.zip');
  ok(devUp.status === 409 && /source checkout/.test(devUp.json.error), 'a development checkout refuses web updates (it is updated with git)');
  await dev.context().close();

  // ===================================================================================== installer safety
  section('the installer cannot take over a site, and it expires');
  fs.copyFileSync(path.join(DIST, 'homebase-setup.php'), path.join(www, 'homebase-setup.php'));
  const intruder = await newPage();
  await intruder.goto(S + '/homebase-setup.php');
  ok((await intruder.textContent('h1')) === '🏠 Update Home Base', 'on an installed site it only offers an update, which needs the passphrase');
  const takeover = await (await fetch(S + '/homebase-setup.php', { method: 'POST', body: new URLSearchParams({ do: 'install', db_host: 'evil.example', db_name: 'x', db_user: 'x', db_pass: 'x', p1: 'attacker-pass-1', p2: 'attacker-pass-1' }) })).text();
  ok(/Update Home Base/.test(takeover) && sha(path.join(priv, '.env')) === envSha, 'posting a fresh install to it does nothing');
  await intruder.fill('#p', 'guess-guess-guess'); await intruder.click('button[type=submit]');
  ok(/Wrong passphrase \(4 tries left\)/.test(await intruder.textContent('.err')), 'guessing the passphrase is limited like signing in');
  fs.unlinkSync(path.join(www, 'homebase-setup.php'));
  fs.readdirSync(path.join(priv, 'storage', 'ratelimit')).forEach((f) => fs.unlinkSync(path.join(priv, 'storage', 'ratelimit', f)));
  const late = path.join(SCRATCH, 'late');
  fs.mkdirSync(late);
  fs.copyFileSync(path.join(DIST, 'homebase-setup.php'), path.join(late, 'homebase-setup.php'));
  await serve(8088, late, { HB_INSTALLER_WINDOW: '1' });
  await new Promise((r) => setTimeout(r, 2200));
  const expR = await intruder.goto('http://127.0.0.1:8088/homebase-setup.php');
  const exp = { s: expR.status(), t: await intruder.content() };
  ok(exp.s === 410 && /expired/.test(exp.t) && !fs.existsSync(path.join(late, 'homebase-setup.php')), 'an installer left lying around expires (2 hours) and deletes itself');
  await intruder.context().close();

  // ===================================================================================== old sites
  for (const [label, commit, layout] of [['version 1', 'd28c679', 'js/tiles'], ['version 2', 'c01948c', 'js/tiles'], ['version 4', '2bd100a', 'gadgets']]) {
    section('update an old site (' + label + ') by uploading the one file');
    const dir = path.join(SCRATCH, 'old-' + commit);
    const oldZip = path.join(SCRATCH, 'old-' + commit + '.zip');
    fs.writeFileSync(oldZip, execFileSync('git', ['show', commit + ':dist/homebase-task.francistsoi.com.zip'], { cwd: REPO, maxBuffer: 64 << 20 }));
    py(['-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', oldZip, dir]);
    const owww = path.join(dir, 'www'), opriv = path.join(dir, 'homebase-private');
    fs.renameSync(path.join(dir, 'homebase-upload', 'web'), owww);
    fs.renameSync(path.join(dir, 'homebase-upload', 'homebase-private'), opriv);
    freshDb('homebase_v6_old');
    execFileSync(MYSQL, ['homebase_v6_old'], { input: fs.readFileSync(path.join(dir, 'homebase-upload', 'schema.sql')) });
    const hash = execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', PASS]).toString();
    fs.writeFileSync(path.join(opriv, '.env'), `DB_HOST=localhost\nDB_PORT=3306\nDB_NAME=homebase_v6_old\nDB_USER='${DB.user}'\nDB_PASS='${DB.pass}'\nHB_PASSPHRASE_HASH='${hash}'\n`);
    sql(`INSERT INTO homebase_v6_old.scenarios (name, position) VALUES ('Old days', 0); INSERT INTO homebase_v6_old.tiles (scenario_id, type, x, y, width, height, title) VALUES (LAST_INSERT_ID(), 'thoughts', 0, 0, 4, 4, 'Old notes'); INSERT INTO homebase_v6_old.thoughts (tile_id, text) VALUES (LAST_INSERT_ID(), 'from the old version')`);
    const hadLegacy = fs.existsSync(path.join(owww, layout));
    fs.copyFileSync(path.join(DIST, 'homebase-setup.php'), path.join(owww, 'homebase-setup.php'));
    const srv = await serve(8087, owww);
    const op = await newPage();
    await op.goto('http://127.0.0.1:8087/homebase-setup.php');
    ok(/Update Home Base/.test(await op.textContent('h1')) && /\(an earlier version\)/.test(await op.textContent('main')), 'the one file recognises the old installation and offers to update it');
    await op.fill('#p', PASS); await op.click('button[type=submit]');
    await op.waitForSelector('h1:has-text("Home Base is updated")', { timeout: 30000 });
    const rep = await op.textContent('main');
    const gone = !fs.existsSync(path.join(owww, 'js', 'tiles')) && !fs.existsSync(path.join(owww, 'gadgets'))
      && !fs.readdirSync(path.join(opriv, 'gadgets')).some((f) => f.endsWith('.php'));
    ok(hadLegacy && /24 gadgets added/.test(rep) && gone && !fs.existsSync(path.join(owww, 'homebase-setup.php')),
      'updated: every gadget is in place, the old ' + layout + ' files are cleaned up, and the installer removed itself');
    await signIn(op, 'http://127.0.0.1:8087', PASS);
    await op.locator('.tab', { hasText: 'Old days' }).click();
    await op.waitForSelector('.thought-text, .thought');
    ok(/from the old version/.test(await op.textContent('#board')) && (await op.evaluate(() => HB.gadgets.types().length)) === 24, 'your old scenarios and notes are all there, on the new version');
    await op.context().close();
    stop(srv);
    await new Promise((r) => setTimeout(r, 300));
  }

  ok(errors.length === 0, 'no browser errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await browser.close();
  servers.forEach(stop);
  sql('DROP DATABASE IF EXISTS homebase_v6; DROP DATABASE IF EXISTS homebase_v6_old');
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); servers.forEach(stop); process.exit(2); });
