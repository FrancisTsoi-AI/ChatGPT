/* Browser + API test for round 5: gadgets as plug-ins (the Gadgets page).
 * Install / update from a .zip, refuse bad zips, keep a broken gadget from hurting the others, switch off / on,
 * share-visitor limits, download, delete (keeping or trashing tiles), and reinstall from a downloaded zip.
 *
 * It installs and deletes gadgets, so it needs a server that uses a SCRATCH gadgets folder:
 *   GADGETS_DIR=/tmp/hb-gadgets   (the test refills it from private/gadgets)
 *   (cd public && HB_GADGETS_DIR=/tmp/hb-gadgets php -S 127.0.0.1:8084 -d upload_max_filesize=25M -d post_max_size=26M) &
 *   GADGETS_DIR=/tmp/hb-gadgets BASE=http://127.0.0.1:8084 STORAGE=private/storage node tests/v5.cjs
 * Needs a fresh, seeded database (truncate the tables first). */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { zip, names } = require('./lib/zip.cjs');

const BASE = process.env.BASE || 'http://127.0.0.1:8084';
const PASS = process.env.PASS || 'test-passphrase-123';
const GDIR = process.env.GADGETS_DIR;
const STORAGE = process.env.STORAGE || 'private/storage';
const REPO = path.join(__dirname, '..');
if (!GDIR || path.resolve(GDIR) === path.join(REPO, 'private', 'gadgets')) {
  console.error('Set GADGETS_DIR to a scratch folder (and start the server with HB_GADGETS_DIR pointing to it). See the top of this file.');
  process.exit(2);
}
let failures = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failures++; };
const section = (t) => console.log('\n# ' + t);
const clearLimits = () => fs.readdirSync(path.join(STORAGE, 'ratelimit')).forEach((f) => { if (f.endsWith('.json')) fs.unlinkSync(path.join(STORAGE, 'ratelimit', f)); });
const offFile = path.join(STORAGE, 'gadgets.json');
const installed = () => fs.readdirSync(GDIR).filter((f) => !f.startsWith('.')).sort();
const SHIPPED = fs.readdirSync(path.join(REPO, 'private', 'gadgets')).filter((d) => fs.existsSync(path.join(REPO, 'private', 'gadgets', d, 'manifest.json'))).length;
/** A fingerprint of a folder tree (names, sizes, times), to prove the shipped gadgets are never touched. */
const treeSig = (dir) => fs.readdirSync(dir, { recursive: true }).sort().map((f) => { const s = fs.statSync(path.join(dir, f)); return f + ':' + s.size + ':' + s.mtimeMs; }).join('|');

// ---- test gadgets -------------------------------------------------------------------------------
const manifest = (o) => JSON.stringify(Object.assign({ type: 'hello', version: '1.0.0', label: 'Hello', icon: '👋', hint: 'A test gadget', author: 'Tests',
  group: 'Everyday', order: 5, size: { w: 3, h: 3 }, entryKinds: ['hello'], shareActions: ['ping'] }, o || {}));
const helloJs = (word) => `(function () {
  const HB = window.HB, h = HB.h;
  HB.gadgets.define('hello', class extends HB.Gadget {
    render(body) {
      const out = h('span', { class: 'hello-pong' });
      body.append(h('div', { class: 'hello-box', text: '${word}' }), h('img', { class: 'hello-logo', src: this.asset('assets/logo.svg'), alt: '' }), out);
      this.call('ping').then((r) => { out.textContent = r.pong ? 'pong' : '?'; }).catch((e) => { out.textContent = 'error ' + e.status; });
    }
  });
})();`;
const helloPhp = `<?php
declare(strict_types=1);
return [
    'ping' => fn(array $c): array => ['pong' => true, 'visitor' => $c['share'] !== null],
    'secret' => fn(array $c): array => ['secret' => 42],
];`;
const hello = (version, word) => zip({
  [`hello-${version}/manifest.json`]: manifest({ version }),
  [`hello-${version}/gadget.js`]: helloJs(word),
  [`hello-${version}/gadget.css`]: '.hello-box { color: rgb(1, 2, 3); }',
  [`hello-${version}/server.php`]: helloPhp,
  [`hello-${version}/assets/logo.svg`]: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
  [`hello-${version}/README.md`]: '# Hello\nA test gadget.',
});
const basic = (type, files) => zip(Object.assign({ 'manifest.json': manifest({ type, label: type, entryKinds: [], shareActions: [] }), 'gadget.js': '/* nothing */' }, files || {}));

(async () => {
  const shipped = treeSig(path.join(REPO, 'private', 'gadgets'));
  // a fresh copy of the shipped gadgets in the scratch folder
  fs.rmSync(GDIR, { recursive: true, force: true });
  fs.cpSync(path.join(REPO, 'private', 'gadgets'), GDIR, { recursive: true });
  if (fs.existsSync(offFile)) fs.unlinkSync(offFile);
  clearLimits();

  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'Asia/Singapore', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  let expectBroken = false;
  page.on('pageerror', (e) => { if (!(expectBroken && /Unexpected token|Unexpected end/.test(e.message))) errors.push('pageerror: ' + e.message); });
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/status of (40[0-9]|410|413|500)|grumpy|ERR_FAILED/.test(t)) errors.push('console: ' + t + ' @ ' + (m.location() || {}).url);
  });
  const T = (id) => page.locator(`.tile[data-tile="${id}"]`);
  const settle = () => page.waitForFunction(() => HB.store.status === 'saved' && !HB.store.ops.length, null, { timeout: 8000 });
  const ready = () => page.waitForFunction(() => window.HB && HB.store && HB.store.data && HB.board && HB.board.el, null, { timeout: 15000 });
  const reloaded = async (fn) => { await Promise.all([page.waitForEvent('load', { timeout: 15000 }), fn()]); await ready(); await page.waitForTimeout(300); };
  const post = (route, body) => page.evaluate(async ([route, body]) => {
    const r = await fetch('api.php?r=' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': HB.api.csrf() }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, [route, body]);
  const get = (url) => page.evaluate(async (url) => { const r = await fetch(url); return { status: r.status, json: await r.json().catch(() => null) }; }, url);
  const up = (buf, name) => page.evaluate(async ([b64, name]) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fd = new FormData(); fd.append('file', new Blob([bin], { type: 'application/zip' }), name);
    const r = await fetch('api.php?r=gadgets/upload', { method: 'POST', headers: { 'X-CSRF-Token': HB.api.csrf() }, body: fd });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, [buf.toString('base64'), name || 'gadget.zip']);
  const installZip = async (buf) => { const u = await up(buf); return u.status === 200 ? post('gadgets/install', { token: u.json.token, passphrase: PASS }) : u; };
  const openGadgets = async () => { await page.click('#btn-menu'); await page.locator('.menu-item', { has: page.locator('.menu-label', { hasText: /^Gadgets…$/ }) }).click(); await page.waitForSelector('.ga-row'); };
  const row = (type) => page.locator(`.ga-row[data-type="${type}"]`);

  await page.goto(BASE + '/'); await page.fill('#pass', PASS); await page.click('button[type=submit]'); await page.waitForSelector('.tile');
  await ready();

  // make sure the server really uses the scratch folder before deleting anything
  fs.mkdirSync(path.join(GDIR, 'probe'));
  fs.writeFileSync(path.join(GDIR, 'probe', 'manifest.json'), manifest({ type: 'probe', entryKinds: [] }));
  fs.writeFileSync(path.join(GDIR, 'probe', 'gadget.js'), '');
  const probe = await get('api.php?r=gadgets');
  fs.rmSync(path.join(GDIR, 'probe'), { recursive: true });
  if (!probe.json.gadgets.some((g) => g.type === 'probe')) {
    console.error('The server at ' + BASE + ' does not use GADGETS_DIR (' + GDIR + '). Start it with HB_GADGETS_DIR. Stopping.');
    process.exit(2);
  }

  // ===================================================================================== packages
  section('every gadget is one package');
  const pk = await page.evaluate(() => ({ scripts: [...document.querySelectorAll('script[data-gadget]')].map((s) => s.src), types: HB.gadgets.types().length }));
  ok(pk.scripts.length === SHIPPED && pk.scripts.every((s) => /assets\.php\?g=[a-z]+&f=gadget\.js&v=[0-9a-f]{12}/.test(s)) && pk.types === SHIPPED, 'all ' + SHIPPED + ' gadgets load, each from its own folder as its own script');
  const leak = await page.evaluate(async () => Promise.all(['server.php', 'README.md', '../../.env', 'manifest.json', '.htaccess'].map(async (f) => (await fetch('assets.php?g=embed&f=' + encodeURIComponent(f))).status)));
  ok(leak[0] === 404 && leak[1] === 404 && leak[2] === 404 && leak[3] === 200 && leak[4] === 404, 'a gadget folder never hands out its PHP, notes, dot files or anything outside it ' + JSON.stringify(leak));
  const list0 = await get('api.php?r=gadgets');
  ok(list0.json.gadgets.length === SHIPPED && list0.json.writable && list0.json.zip && list0.json.install, 'the Gadgets page lists all ' + SHIPPED + ' installed gadgets; installing is possible here');
  ok(!JSON.stringify((await page.evaluate(async () => (await fetch(document.querySelector('script[src^="assets.php?b=core"]').src)).text()))).includes(GDIR), 'server paths never reach the browser');

  // ===================================================================================== install via the page
  section('install a gadget by dropping its .zip on the Gadgets page');
  await openGadgets();
  await page.setInputFiles('.ga-drop input[type=file]', { name: 'hello-1.0.0.zip', mimeType: 'application/zip', buffer: hello('1.0.0', 'Hello v1') });
  await page.waitForSelector('.ga-confirm');
  const conf = await page.locator('.ga-confirm').textContent();
  ok(/Hello/.test(conf) && /Version 1\.0\.0/.test(conf) && /by Tests/.test(conf) && /server code/.test(conf) && /trust/.test(conf), 'before anything is live it shows what it is, who made it, and that it has server code');
  ok(!installed().includes('hello') && fs.readdirSync(GDIR).some((f) => f.startsWith('.stage-')), 'it is only staged so far (hidden folder), not installed');
  await page.fill('.ga-pass', 'wrong-pass');
  await page.click('.modal .btn.primary:has-text("Install")');
  await page.waitForSelector('.ga-confirm .form-err:not([hidden])');
  ok(/Wrong passphrase \(4 tries left\)/.test(await page.textContent('.ga-confirm .form-err')) && !installed().includes('hello'), 'a wrong passphrase is refused (and counts toward the sign-in limit)');
  clearLimits();
  await page.fill('.ga-pass', PASS);
  await reloaded(() => page.click('.modal .btn.primary:has-text("Install")'));
  ok(installed().includes('hello') && !fs.readdirSync(GDIR).some((f) => f.startsWith('.stage-')), 'with the passphrase it is installed (one folder), and the page reloads with it');
  await page.evaluate(async () => { const r = await HB.store.create('scenarios', { name: 'Plugins' }); HB.app.showScenario(r.id); });
  await page.waitForTimeout(250);
  await page.click('#btn-add');
  ok(await page.locator('.menu-item', { hasText: 'Hello' }).count() === 1, '+ Tile now offers it');
  await page.locator('.menu-item', { hasText: 'Hello' }).click();
  await page.waitForSelector('.hello-box');
  const hid = await page.evaluate(() => Number(document.querySelector('.hello-box').closest('.tile').dataset.tile));
  await page.waitForFunction(() => document.querySelector('.hello-pong').textContent === 'pong');
  const hs = await T(hid).evaluate((t) => ({ color: getComputedStyle(t.querySelector('.hello-box')).color, img: t.querySelector('.hello-logo').naturalWidth }));
  ok(hs.color === 'rgb(1, 2, 3)' && hs.img === 10, 'its script, styles, pictures (this.asset) and server action (this.call) all work');
  await page.evaluate((id) => HB.store.create('entries', { tile_id: id, kind: 'hello', a: 'kept across updates' }), hid);
  await settle();

  // ===================================================================================== bad zips
  section('a bad or dangerous zip is refused, and nothing is written');
  const before = installed();
  const mf = manifest({ type: 'evil', entryKinds: [] });
  const cases = [
    ['not a zip at all', Buffer.from('just text'), /not a valid \.zip/],
    ['a ../ path', zip({ 'manifest.json': mf, 'gadget.js': '', '../evil.php': '<?php echo 1;' }), /Not allowed in a gadget/],
    ['an absolute path', zip({ 'manifest.json': mf, 'gadget.js': '', '/tmp/evil.txt': 'x' }), /Not allowed in a gadget/],
    ['a backslash path', zip({ 'manifest.json': mf, 'gadget.js': '', 'a\\..\\evil.txt': 'x' }), /Not allowed in a gadget/],
    ['a hidden .htaccess', zip({ 'manifest.json': mf, 'gadget.js': '', '.htaccess': 'Allow from all' }), /Not allowed in a gadget/],
    ['a symbolic link', zip([{ name: 'manifest.json', data: mf }, { name: 'gadget.js', data: '' }, { name: 'link.txt', data: '/etc/passwd', unixMode: 0o120777 }]), /links are not allowed/],
    ['a shell script', zip({ 'manifest.json': mf, 'gadget.js': '', 'run.sh': 'rm -rf /' }), /this type of file/],
    ['a .phar archive', zip({ 'manifest.json': mf, 'gadget.js': '', 'x.phar': 'x' }), /this type of file/],
    ['no manifest.json', zip({ 'gadget.js': '' }), /manifest\.json is missing/],
    ['no gadget.js', zip({ 'manifest.json': mf }), /gadget\.js is missing/],
    ['a bad type name', basic('Bad-Type'), /"type" must be/],
    ['PHP with a syntax error', basic('evil', { 'server.php': '<?php\nreturn [\n' }), /PHP error on line/],
    ['a data kind of another gadget', zip({ 'manifest.json': manifest({ type: 'evil', entryKinds: ['card'] }), 'gadget.js': '' }), /already belongs to the "flashcards"/],
    ['a 12 MB file (zip bomb)', basic('evil', { 'big.txt': Buffer.alloc(12 * 1048576) }), /larger than 10 MB/],
    ['45 MB unpacked', zip([{ name: 'manifest.json', data: mf }, { name: 'gadget.js', data: '' }, ...[1, 2, 3, 4, 5].map((i) => ({ name: 'f' + i + '.txt', data: Buffer.alloc(9 * 1048576), deflate: true }))]), /larger than 40 MB/],
    ['a newer Home Base needed', zip({ 'manifest.json': manifest({ type: 'evil', entryKinds: [], requires: '99.0' }), 'gadget.js': '' }), /needs Home Base 99\.0/],
  ];
  cases[13][1] = zip([{ name: 'manifest.json', data: mf }, { name: 'gadget.js', data: '' }, { name: 'big.txt', data: Buffer.alloc(12 * 1048576), deflate: true }]);
  for (const [what, buf, re] of cases) {
    const r = await up(buf);
    ok(r.status === 400 && re.test((r.json || {}).error || ''), 'refused: ' + what + ' (' + r.status + ' ' + ((r.json || {}).error || '').slice(0, 70) + ')');
  }
  ok(JSON.stringify(installed()) === JSON.stringify(before) && !fs.readdirSync(GDIR).some((f) => f.startsWith('.')), 'after all of that the gadgets folder is exactly as before (no staging leftovers)');
  const exp = await post('gadgets/install', { token: 'a'.repeat(24), passphrase: PASS });
  const csrf = await page.evaluate(async () => (await fetch('api.php?r=gadgets/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
  ok(exp.status === 410 && csrf === 403, 'an unknown upload token or a missing CSRF token is refused');
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(BASE + '/');
  const anonUp = await anon.evaluate(async () => { const fd = new FormData(); fd.append('file', new Blob(['x']), 'x.zip'); return (await fetch('api.php?r=gadgets/upload', { method: 'POST', body: fd })).status; });
  const anonList = await anon.evaluate(async () => (await fetch('api.php?r=gadgets')).status);
  ok([401, 403].includes(anonUp) && anonList === 401, 'without signing in nothing about gadgets is reachable (' + anonUp + ', ' + anonList + ')');
  await anon.context().close();

  // ===================================================================================== update
  section('update: drop a newer version');
  const u2 = await up(hello('1.1.0', 'Hello v1.1'));
  ok(u2.status === 200 && u2.json.preview.current && u2.json.preview.current.version === '1.0.0' && u2.json.preview.version === '1.1.0', 'the preview says it updates 1.0.0 → 1.1.0');
  const i2 = await post('gadgets/install', { token: u2.json.token, passphrase: PASS });
  ok(i2.status === 200 && i2.json.updated, 'the new version replaces the old one in one step');
  await page.reload(); await ready(); await page.waitForSelector('.hello-box');
  ok((await page.textContent('.hello-box')) === 'Hello v1.1' && (await page.evaluate((id) => HB.store.entriesOf(id, 'hello').length, hid)) === 1, 'tiles show the new version and keep their content');
  const down = await up(hello('1.0.0', 'old'));
  ok(down.status === 200 && down.json.preview.notes.some((n) => /OLDER/.test(n)), 'dropping an older version warns before you install it');

  // ===================================================================================== isolation
  section('one broken gadget does not affect the others');
  ok((await installZip(zip({ 'manifest.json': manifest({ type: 'broken', label: 'Broken', entryKinds: [], shareActions: [] }),
    'gadget.js': "HB.gadgets.define('broken', class extends {", 'gadget.css': '.broken-x { color: red;' }))).status === 200, 'a gadget with a JavaScript syntax error and unclosed CSS installs (the server cannot know)');
  ok((await installZip(zip({ 'manifest.json': manifest({ type: 'grumpy', label: 'Grumpy', entryKinds: [], shareActions: [] }),
    'gadget.js': "HB.gadgets.define('grumpy', class extends HB.Gadget { sig() { throw new Error('grumpy sig'); } render() { throw new Error('grumpy render'); } menu() { throw new Error('grumpy menu'); } });",
    'server.php': "<?php\nreturn ['boom' => function (array $c): array { return grumpy_missing_function(); }];" }))).status === 200, 'so does one whose code throws everywhere');
  expectBroken = true;
  await page.reload(); await ready(); await page.waitForSelector('.hello-box');
  const iso = await page.evaluate(() => ({ failed: HB.gadgets.failed(), color: getComputedStyle(document.querySelector('.hello-box')).color }));
  ok(iso.failed.join() === 'broken' && iso.color === 'rgb(1, 2, 3)', 'the app still starts; only "broken" fails to load, and the other styles are untouched');
  const gid = await page.evaluate(async () => (await HB.board.addTile('grumpy')).id);
  const bid = await page.evaluate(async (sid) => (await HB.store.create('tiles', { scenario_id: sid, type: 'broken', x: 0, y: 30, width: 3, height: 3, title: 'Broken' })).id, await page.evaluate(() => HB.app.scenarioId));
  await page.waitForSelector(`.tile[data-tile="${bid}"] .gadget-missing`);
  ok(/failed to draw/.test(await T(gid).textContent()) && /did not load/.test(await T(bid).textContent()) && (await page.textContent('.hello-box')) === 'Hello v1.1', 'their tiles say what is wrong; the tiles around them keep working');
  await T(gid).locator('.tile-head button[aria-label="Tile menu"]').click();
  ok(await page.locator('.menu-item', { hasText: 'Delete tile' }).count() === 1, 'a gadget whose menu throws still has a usable tile menu');
  await page.keyboard.press('Escape');
  const boom = await get('api.php?r=g/grumpy/boom'), ping = await get('api.php?r=g/hello/ping');
  ok(boom.status === 500 && ping.status === 200, 'a PHP error in one gadget\'s server code stays in that request');
  await openGadgets();
  ok(/did not load/.test(await row('broken').textContent()) && /server code/.test(await row('hello').textContent()), 'the Gadgets page marks the broken one');
  await page.keyboard.press('Escape');

  // ===================================================================================== switch off / on
  section('switch a gadget off and on');
  await openGadgets();
  await reloaded(() => row('hello').locator('button', { hasText: 'Switch off' }).click());
  const offState = await page.evaluate(async (id) => ({ has: HB.gadgets.has('hello'), msg: document.querySelector(`.tile[data-tile="${id}"] .gadget-missing`) ? document.querySelector(`.tile[data-tile="${id}"]`).textContent : '',
    js: (await fetch('assets.php?g=hello&f=gadget.js')).status, act: (await fetch('api.php?r=g/hello/ping')).status, rows: HB.store.entriesOf(id, 'hello').length }), hid);
  ok(!offState.has && /switched off or not installed/.test(offState.msg) && offState.js === 404 && offState.act === 404, 'switched off: no code is loaded or served, its server actions stop, and its tile says so');
  ok(offState.rows === 1 && installed().includes('hello'), 'its content and its folder stay');
  await page.click('#btn-add');
  ok(await page.locator('.menu-item', { hasText: 'Hello' }).count() === 0, '+ Tile no longer offers it');
  await page.keyboard.press('Escape');
  await openGadgets();
  ok(/switched off/.test(await row('hello').textContent()), 'the Gadgets page shows it as switched off');
  await reloaded(() => row('hello').locator('button', { hasText: 'Switch on' }).click());
  await page.waitForSelector('.hello-box');
  ok(true, 'switched on again, the tile is back as it was');

  // ===================================================================================== share visitors
  section('share visitors only reach the actions a gadget allows');
  const sh = await post('shares/save', { scenario_id: await page.evaluate(() => HB.app.scenarioId), slug: 'plugin-test', password: 'visitor-123', expires_at: null, include_files: false });
  const vis = await (await browser.newContext()).newPage();
  await vis.goto(BASE + '/share.php?s=plugin-test'); await vis.fill('#pass', 'visitor-123'); await vis.click('button[type=submit]');
  await vis.waitForSelector('.hello-box');
  const vr = await vis.evaluate(async () => ({ ping: await (await fetch('api.php?r=g/hello/ping&share=plugin-test')).json(), secret: (await fetch('api.php?r=g/hello/secret&share=plugin-test')).status,
    title: (await fetch('api.php?r=g/reading/title&share=plugin-test&url=https://example.com')).status, list: (await fetch('api.php?r=gadgets&share=plugin-test')).status,
    pong: document.querySelector('.hello-pong').textContent }));
  ok(sh.status === 200 && vr.ping.visitor === true && vr.pong === 'pong', 'an action listed in "shareActions" works for a visitor (and knows it is one)');
  ok(vr.secret === 403 && vr.title === 403 && vr.list === 403, 'any other action, and the Gadgets page, are refused');
  await vis.context().close();
  await post('shares/delete', { id: sh.json.share.id });

  // ===================================================================================== download
  section('download a gadget as a .zip');
  const dl = await page.evaluate(async () => { const r = await fetch('api.php?r=gadgets/export&type=writer'); return { cd: r.headers.get('content-disposition'), b64: btoa(String.fromCharCode(...new Uint8Array(await r.arrayBuffer()))) }; });
  const wnames = names(Buffer.from(dl.b64, 'base64'));
  ok(/writer-1\.0\.0\.zip/.test(dl.cd) && ['writer/manifest.json', 'writer/gadget.js', 'writer/gadget.css', 'writer/server.php', 'writer/README.md'].every((n) => wnames.includes(n)), 'the zip holds the whole folder (code, styles, server part, notes): ready to back up, change, or install elsewhere');
  const clockZip = await page.evaluate(async () => { const r = await fetch('api.php?r=gadgets/export&type=clock'); return btoa(String.fromCharCode(...new Uint8Array(await r.arrayBuffer()))); });

  // ===================================================================================== delete
  section('delete gadgets');
  await page.keyboard.press('1'); await page.waitForTimeout(300);
  const clockTile = await page.evaluate(() => HB.store.tilesOf(HB.app.scenarioId).find((t) => t.type === 'clock').id);
  await openGadgets();
  await row('clock').locator('button', { hasText: 'Delete…' }).click();
  await page.locator('.modal input[type=checkbox]').uncheck();
  await reloaded(() => page.click('.modal .btn.danger:has-text("Delete gadget")'));
  ok(!installed().includes('clock'), 'deleting the built-in Clock removes its folder');
  ok(/switched off or not installed/.test(await T(clockTile).textContent()) && await page.locator('.tile .todo, .tile .bucket').count() > 0, 'its tiles stay (marked as missing); the other gadgets carry on');
  await openGadgets();
  ok(/clock/.test(await page.textContent('.ga-missing')), 'the Gadgets page lists "Tiles without a gadget: clock"');
  // reinstall from the downloaded zip, by dragging it onto the drop box
  await page.evaluate((b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bin], 'clock.zip', { type: 'application/zip' }));
    const zone = document.querySelector('.ga-drop');
    zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, clockZip);
  await page.waitForSelector('.ga-confirm');
  ok(/2 tiles of this type already exist and will work again/.test(await page.locator('.ga-confirm').textContent()), 'dropping the downloaded clock.zip back says its 2 tiles will work again');
  const fileTiles = await page.evaluate(() => HB.store.data.files.length);
  await page.fill('.ga-pass', PASS);
  await reloaded(() => page.click('.modal .btn.primary:has-text("Install")'));
  await page.waitForSelector(`.tile[data-tile="${clockTile}"] .clock-time`);
  ok(installed().includes('clock') && (await page.evaluate(() => HB.store.data.files.length)) === fileTiles, 'reinstalled: the clock tile works again (and the zip did not go to a Files tile)');

  await page.evaluate((id) => HB.app.showScenario(HB.store.get('tiles', id).scenario_id), hid); await page.waitForTimeout(300);
  await openGadgets();
  await row('hello').locator('button', { hasText: 'Delete…' }).click();
  ok(await page.locator('.modal input[type=checkbox]').isChecked(), '"move its tiles to the Trash" is ticked by default');
  await reloaded(() => page.click('.modal .btn.danger:has-text("Delete gadget")'));
  const trash = await page.evaluate(async () => (await HB.api.trash()).items.filter((i) => i.type === 'tiles').map((i) => i.label));
  ok(!installed().includes('hello') && !(await page.locator('.hello-box').count()) && trash.includes('Hello'), 'deleting Hello removes its folder and moves its tile to the Trash');

  const db = await post('gadgets/delete', { type: 'broken', trash_tiles: false });
  ok(db.status === 200 && !installed().includes('broken'), 'a broken gadget can be deleted too');
  await page.reload(); await ready();
  await openGadgets();
  await page.locator('.ga-missing .ga-row', { hasText: 'broken' }).locator('button').click();
  await reloaded(() => page.click('.modal .btn.danger:has-text("Move to Trash")'));
  ok(!(await page.locator(`.tile[data-tile="${bid}"]`).count()), 'leftover tiles of a deleted gadget can be moved to the Trash from the Gadgets page');
  await post('gadgets/delete', { type: 'grumpy', trash_tiles: true });

  section('the shipped gadget zips (dist/gadgets) are installable');
  const dist = path.join(REPO, 'dist', 'gadgets');
  const zips = fs.existsSync(dist) ? fs.readdirSync(dist).filter((f) => f.endsWith('.zip')) : [];
  const bad = [];
  for (const f of zips) { const r = await up(fs.readFileSync(path.join(dist, f)), f); if (r.status !== 200) bad.push(f + ': ' + ((r.json || {}).error || r.status)); }
  ok(zips.length === SHIPPED && !bad.length, 'all ' + zips.length + ' pass the installer\'s checks (run tools/build-zip.py first)' + (bad.length ? ': ' + bad.join(' | ') : ''));

  section('cleanup');
  ok(treeSig(path.join(REPO, 'private', 'gadgets')) === shipped, 'the shipped gadgets folder in the repository was never touched');
  if (fs.existsSync(offFile)) fs.unlinkSync(offFile);
  clearLimits();
  ok(errors.length === 0, 'no unexpected browser errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
