/* Browser test for round 3: modular gadgets, embed fix, mp3, Toolbox open-all / icons, Writer, YouTube playlist,
 * delete scenario, sign out everywhere, and share links (password, expiry, read-only, scope).
 * Uses the SECOND dev server (fetches allowed to the fake site this test starts on :9099), see tests/README.md:
 *   BASE=http://127.0.0.1:8082 STORAGE=private/storage MYSQL="mysql homebase" node tests/v3.cjs
 * Needs a fresh, seeded database (truncate the tables first). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8082';
const PASS = process.env.PASS || 'test-passphrase-123';
const MYSQL = process.env.MYSQL || 'mysql homebase';
const MP3 = path.join(__dirname, 'fixtures', 'tone.mp3');
let failures = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failures++; };
const section = (t) => console.log('\n# ' + t);
const sql = (q) => execSync(`${MYSQL} -N -e "${q}"`).toString().trim();

const fake = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (body, type, extra) => { res.writeHead(200, Object.assign({ 'Content-Type': type }, extra || {})); res.end(body); };
  if (u.pathname === '/noframe.html') return send('<html><head><title>No frames</title><meta http-equiv="refresh" content="0;url=https://evil.example"><script>window.top.location="https://evil.example"</script></head><body><h1>Article title</h1><p>Body text <a href="/next">next</a></p><form action="/x"><input name="q"></form></body></html>', 'text/html; charset=utf-8', { 'X-Frame-Options': 'DENY' });
  if (u.pathname === '/ancestors.html') return send('<p>x</p>', 'text/html', { 'Content-Security-Policy': "frame-ancestors 'self'" });
  if (u.pathname === '/frame-ok.html') return send('<p>embeddable</p>', 'text/html');
  if (u.pathname === '/v3-feed.xml') return send('<?xml version="1.0"?><rss version="2.0"><channel><title>F</title><item><title>Shared item</title><link>http://127.0.0.1:9099/a</link></item></channel></rss>', 'application/rss+xml');
  res.writeHead(404); res.end('nope');
});

(async () => {
  await new Promise((r) => fake.listen(9099, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'Asia/Singapore' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  // ERR_TUNNEL_CONNECTION_FAILED / ERR_NAME_NOT_RESOLVED: YouTube thumbnails when the test machine has no internet
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (40[0-9]|413|415|422|429|502)|ERR_FAILED|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|CORS policy/.test(m.text())) errors.push('console: ' + m.text() + ' @ ' + (m.location() || {}).url); });
  const settle = () => page.waitForFunction(() => HB.store.status === 'saved' && !HB.store.ops.length, null, { timeout: 8000 });
  const T = (id) => page.locator(`.tile[data-tile="${id}"]`);
  const addTile = (type) => page.evaluate(async (t) => (await HB.board.addTile(t)).id, type);
  const menu = async (id, item) => { await T(id).locator('.tile-head button[aria-label="Tile menu"]').click(); await page.locator('.menu-item', { hasText: item }).first().click(); };
  const login = async (p) => { await p.goto(BASE + '/'); await p.fill('#pass', PASS); await p.click('button[type=submit]'); await p.waitForSelector('.tile'); };
  const mainMenu = async (label) => { await page.click('#btn-menu'); await page.locator('.menu-item', { has: page.locator('.menu-label', { hasText: new RegExp('^' + label) }) }).first().click(); };
  const scratch = async (name) => { await page.evaluate(async (n) => { const r = await HB.store.create('scenarios', { name: n }); HB.app.showScenario(r.id); }, name); await page.waitForTimeout(250); };

  await login(page);

  // ======================================================================================== modules
  section('gadgets are modules');
  const SHIPPED = fs.readdirSync(path.join(__dirname, '..', 'private', 'gadgets')).filter((d) => fs.existsSync(path.join(__dirname, '..', 'private', 'gadgets', d, 'manifest.json'))).length;
  const bundle = await page.evaluate(async () => { const r = await fetch(document.querySelector('script[src^="assets.php?b=core"]').src); return { cc: r.headers.get('cache-control'), body: await r.text(), scripts: document.querySelectorAll('script[data-gadget]').length }; });
  const n = (bundle.body.match(/^HB\.gadgets\.addManifest\(/gm) || []).length;
  ok(n === SHIPPED && bundle.scripts === SHIPPED, 'the core bundle carries all ' + SHIPPED + ' manifests, and each gadget loads as its own script (' + n + ', ' + bundle.scripts + ')');
  ok(/immutable/.test(bundle.cc), 'the versioned bundle may be cached for a year');
  const reg = await page.evaluate(() => {
    const types = HB.gadgets.types();
    const t = HB.store.data.tiles[0];
    return { types, isGadget: HB.gadgets.instance(t) instanceof HB.Gadget, groups: [...new Set(types.map((x) => HB.typeInfo[x].group))] };
  });
  ok(reg.types.length === SHIPPED && reg.isGadget, 'every tile is driven by an instance of a class that extends HB.Gadget');
  ok(JSON.stringify(reg.groups) === JSON.stringify(['Everyday', 'Writing', 'Study', 'Focus', 'Web', 'Files & media']), 'the + Tile menu groups come from the manifests');

  // ======================================================================================== embed
  section('embed: YouTube referrer, sites that refuse frames');
  const chk = await page.evaluate(async () => ({
    deny: await HB.api.gadget('embed', 'check', { url: 'http://127.0.0.1:9099/noframe.html' }),
    anc: await HB.api.gadget('embed', 'check', { url: 'http://127.0.0.1:9099/ancestors.html' }),
    okay: await HB.api.gadget('embed', 'check', { url: 'http://127.0.0.1:9099/frame-ok.html' }),
  }));
  ok(!chk.deny.ok && /X-Frame-Options/.test(chk.deny.reason), 'the server sees that a site forbids framing (X-Frame-Options: DENY)');
  ok(!chk.anc.ok && /frame-ancestors/.test(chk.anc.reason) && chk.okay.ok, '…or forbids it by CSP frame-ancestors; a normal page passes');
  const snap = await page.evaluate(async () => { const r = await fetch(HB.api.url('g/embed/snapshot', { url: 'http://127.0.0.1:9099/noframe.html' })); return { csp: r.headers.get('content-security-policy'), xfo: r.headers.get('x-frame-options'), body: await r.text() }; });
  ok(/sandbox allow-popups/.test(snap.csp) && !/allow-scripts|allow-same-origin/.test(snap.csp) && /default-src 'none'/.test(snap.csp), 'the simplified copy is served with a sandbox policy: no scripts, no forms, no same-origin');
  ok(!/<script/i.test(snap.body) && !/http-equiv="refresh"/i.test(snap.body) && /<base href="http:\/\/127\.0\.0\.1:9099\/noframe\.html" target="_blank">/.test(snap.body) && /Article title/.test(snap.body), 'scripts and auto-redirects are stripped; links open in a new tab');
  ok(snap.xfo === 'SAMEORIGIN', 'the copy may only be framed by Home Base itself');
  const priv = await page.evaluate(async () => { try { await HB.api.gadget('embed', 'check', { url: 'http://169.254.169.254/latest/' }); return 'allowed'; } catch (e) { return e.status; } });
  ok(priv === 400, 'cloud-metadata addresses are refused, even on this test server that allows private fetches (' + priv + ')');
  await scratch('Embeds');
  const em = await addTile('embed');
  await page.evaluate((id) => { HB.api._gadget = HB.api.gadget; HB.api.gadget = (t, a, q) => (t === 'embed' && a === 'check' ? Promise.resolve({ ok: false, reason: 'X-Frame-Options: DENY' }) : HB.api._gadget(t, a, q)); HB.setTileSettings(id, { url: 'https://news.example.com/story', mode: 'auto' }); }, em);
  await page.waitForFunction((id) => { const f = document.querySelector(`.tile[data-tile="${id}"] iframe`); return f && /g\/embed\/snapshot/.test(f.getAttribute('src')); }, em, { timeout: 8000 });
  const cf = await T(em).locator('iframe').evaluate((f) => ({ sandbox: f.getAttribute('sandbox'), note: f.closest('.embed-wrap').textContent }));
  ok(cf.sandbox === 'allow-popups allow-popups-to-escape-sandbox' && /refuses to be shown/.test(cf.note), 'when a site refuses frames the tile switches to the sandboxed copy and says why');
  await T(em).locator('button:has-text("Try live page")').click();
  await page.waitForFunction((id) => { const f = document.querySelector(`.tile[data-tile="${id}"] iframe`); return f && f.getAttribute('src') === 'https://news.example.com/story'; }, em);
  ok((await T(em).locator('iframe').getAttribute('referrerpolicy')) === 'strict-origin-when-cross-origin', '"Try live page" switches back; live frames send only the site origin');
  await page.evaluate(() => { HB.api.gadget = HB.api._gadget; });

  // ======================================================================================== mp3
  section('music: mp3');
  await scratch('Music');
  const mu = await addTile('music');
  ok((await T(mu).locator('input[type=file]').getAttribute('accept')).includes('.mp3'), 'the picker lists .mp3 explicitly (phones that hide audio/* still offer it)');
  await page.setInputFiles(`.tile[data-tile="${mu}"] input[type=file]`, [MP3]);
  await T(mu).locator('.file').waitFor();
  await T(mu).locator('.mp-play').click();
  await page.waitForFunction(() => { const a = document.getElementById('audio'); return !a.paused && a.currentTime > 0.2; }, null, { timeout: 8000 });
  ok(true, 'an mp3 uploaded to the Music player plays');
  await T(mu).locator('.mp-play').click();
  const fl = await addTile('files');
  await page.setInputFiles(`.tile[data-tile="${fl}"] input[type=file]`, [MP3]);
  await T(fl).locator('.file').waitFor();
  await menu(mu, 'Add audio from Files tiles');
  await page.waitForFunction(([m, f]) => document.querySelectorAll(`.tile[data-tile="${m}"] .file`).length === 2 && !document.querySelector(`.tile[data-tile="${f}"] .file`), [mu, fl]);
  ok(true, 'audio sitting in a Files tile can be pulled into the Music player');
  const b64 = fs.readFileSync(MP3).toString('base64');
  await page.evaluate((b) => {
    const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bytes], 'dropped.mp3', { type: 'audio/mpeg' }));
    document.getElementById('board-wrap').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 700, clientY: 860 }));
  }, b64);
  await page.waitForFunction((m) => [...document.querySelectorAll(`.tile[data-tile="${m}"] .file-name`)].some((x) => x.textContent === 'dropped.mp3'), mu, { timeout: 10000 });
  ok(true, 'mp3 files dropped on empty space go to the Music player, not a Files tile');
  const legacy = await page.evaluate(async () => { const f = HB.store.data.files.find((x) => x.original_name === 'dropped.mp3'); return HB.isAudio({ type: 'application/octet-stream', original_name: 'Song.MP3' }) && !!f; });
  ok(legacy, 'files the browser could not type are recognised as audio by their name');

  // ======================================================================================== toolbox
  section('toolbox: open all, icons only');
  await scratch('Links');
  const tb = await addTile('toolbox');
  for (const l of ['Mail | mail.example.com', 'Docs | docs.example.com', 'Code | github.com']) { await T(tb).locator('input[data-key="link-add"]').fill(l); await T(tb).locator('input[data-key="link-add"]').press('Enter'); await page.waitForTimeout(250); }
  await page.waitForFunction((id) => document.querySelectorAll(`.tile[data-tile="${id}"] .link-card`).length === 3, tb);
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return window.__opened.length === 1 ? {} : null; }; });
  await T(tb).locator('.tb-bar .btn', { hasText: 'Open all 3' }).click();
  const opened = await page.evaluate(() => window.__opened);
  ok(opened.length === 3 && opened[0] === 'https://mail.example.com', '"Open all 3" opens every link');
  ok(/blocked 2 of 3/.test(await page.locator('.toast.error').last().textContent()), 'when the browser blocks pop-ups it says how many and how to allow them');
  await T(tb).locator('.tb-bar .btn', { hasText: 'Icons' }).click();
  await page.waitForFunction((id) => document.querySelector(`.tile[data-tile="${id}"] .links.icons`), tb);
  const iv = await T(tb).locator('.link-card').first().evaluate((a) => ({ name: getComputedStyle(a.querySelector('.link-name')).display, w: a.querySelector('.link-icon').getBoundingClientRect().width, title: a.title }));
  ok(iv.name === 'none' && iv.w >= 34 && /Mail/.test(iv.title), 'icon view shows only (bigger) icons; the name is in the hover title');
  await settle();
  await page.reload(); await page.waitForSelector(`.tile[data-tile="${tb}"] .links.icons`);
  ok(true, 'icon view is remembered');

  // ======================================================================================== writer
  section('writer: double-click, rich text, HTML + JS, code');
  await scratch('Writing');
  await page.mouse.dblclick(800, 400);
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('wr-rich'));
  ok(true, 'double-clicking empty space adds a Writer with the caret ready');
  const wr = await page.evaluate(() => Number(document.activeElement.closest('.tile').dataset.tile));
  await page.keyboard.type('Big idea');
  await page.keyboard.press('Control+a');
  await T(wr).locator('.wr-b.b').click();
  await T(wr).locator('.wr-dd-block').click();
  await page.locator('.wr-pop-item', { hasText: 'Heading 2' }).click();
  await page.waitForFunction((id) => HB.store.entriesOf(id, 'doc').some((e) => /<h2>.*Big idea/.test(e.a)), wr, { timeout: 6000 });
  ok(true, 'toolbar formatting (bold, heading) is saved as HTML');
  await page.evaluate(() => {
    const ed = document.querySelector('.wr-rich'); ed.focus();
    const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);
    const dt = new DataTransfer(); dt.setData('text/html', '<p>ok<img src=x onerror="window.__xss=1"><script>window.__xss=2<\/script><a href="javascript:window.__xss=3">bad</a><iframe src="https://evil.example"></iframe><a href="https://good.example" onclick="window.__xss=4">good</a></p>');
    ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(900);
  const pasted = await T(wr).locator('.wr-rich').evaluate((el) => ({ html: el.innerHTML, xss: window.__xss }));
  ok(!/onerror|onclick|<script|<iframe|javascript:/i.test(pasted.html) && pasted.xss === undefined && /href="https:\/\/good\.example"/.test(pasted.html), 'pasted HTML is cleaned: no scripts, handlers, frames or javascript: links');
  ok(await page.evaluate(() => HB.sanitizeHtml('<b style="color:red;background:url(x)">t</b><svg onload=1></svg>') === '<b style="color: red">t</b>'), 'the sanitizer also strips unsafe styles and SVG');
  await settle();
  await page.reload(); await page.waitForSelector(`.tile[data-tile="${wr}"] .wr-rich h2`);
  const reloaded = await T(wr).locator('.wr-rich').innerHTML();
  ok(/<h2>.*Big idea/.test(reloaded) && /good\.example/.test(reloaded), 'rich text survives a reload (' + reloaded.slice(0, 120) + ')');
  const found = await page.evaluate(async () => (await HB.api.search('Big idea')).results.filter((r) => r.kind === 'doc'));
  ok(found.length === 1 && /^Big idea/.test(found[0].label) && !/</.test(found[0].label), 'Ctrl+K finds text in Writer documents (searchKinds in the manifest), shown without HTML');
  await T(wr).locator('.wr-modes .seg-btn', { hasText: 'HTML + JS' }).click();
  await T(wr).locator('.wr-ta').waitFor();
  await T(wr).locator('button:has-text("Starter page")').click();
  await page.waitForFunction(() => { const f = document.querySelector('.wr-frame'); return !!f && /g\/writer\/run/.test(f.src); }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const fr = page.frames().find((f) => /g\/writer\/run/.test(f.url()));
  ok(!!fr, 'the page runs in a preview frame');
  if (fr) {
    await fr.click('#b'); await fr.click('#b');
    ok((await fr.textContent('#out')) === 'Clicked 2 times', 'its JavaScript runs');
    const iso = await fr.evaluate(async () => {
      let cookie; try { cookie = document.cookie; } catch (e) { cookie = 'blocked'; }
      let api; try { const r = await fetch('/api.php?r=state'); api = r.status; } catch (e) { api = 'blocked'; }
      let parentDoc; try { parentDoc = parent.document.title; } catch (e) { parentDoc = 'blocked'; }
      return { origin: self.origin, cookie, api, parentDoc };
    });
    ok(iso.origin === 'null' && iso.cookie === 'blocked' && iso.api === 'blocked' && iso.parentDoc === 'blocked', 'it is sandboxed: no origin, no cookies, no API, no access to Home Base ' + JSON.stringify(iso));
  }
  const runHdr = await page.evaluate(async (id) => { const e = HB.store.entriesOf(id, 'doc').find((x) => x.data.mode === 'web'); const r = await fetch(HB.api.url('g/writer/run', { id: e.id })); return r.headers.get('content-security-policy'); }, wr);
  ok(/^sandbox allow-scripts/.test(runHdr) && !/allow-same-origin/.test(runHdr), 'the run page itself carries the sandbox policy (safe even when opened in its own tab)');
  await T(wr).locator('.wr-modes .seg-btn', { hasText: 'Code' }).click();
  await T(wr).locator('.wr-lang').selectOption('python');
  await T(wr).locator('.wr-ta').click();
  await page.keyboard.type('def f(x):\n  return "hi"  # done');
  await page.waitForTimeout(900);
  const hl = await T(wr).locator('.wr-hl span').evaluateAll((s) => s.map((x) => x.className + ':' + x.textContent));
  ok(hl.includes('wr-k:def') && hl.includes('wr-s:"hi"') && hl.includes('wr-c:# done'), 'code is highlighted for the chosen language (' + hl.join(', ') + ')');
  await settle();
  const modes = await page.evaluate((id) => HB.store.entriesOf(id, 'doc').map((e) => e.data.mode).sort().join(), wr);
  ok(modes === 'code,rich,web', 'each mode keeps its own text, so switching modes loses nothing');

  // ======================================================================================== youtube
  section('YouTube playlist');
  await scratch('Videos');
  const ytRefs = [];
  await ctx.route(/youtube-nocookie\.com\/embed/, (r) => { ytRefs.push(r.request().headers().referer || ''); r.fulfill({ status: 200, contentType: 'text/html', body: '<p>player</p>' }); });
  const yt = await addTile('youtube');
  for (const l of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/9bZkp7q19f0', 'https://music.youtube.com/watch?v=kJQP7kiw5Fk&list=RDxyz']) {
    await T(yt).locator('input[data-key="yt-add"]').fill(l); await T(yt).locator('input[data-key="yt-add"]').press('Enter'); await page.waitForTimeout(300);
  }
  await page.waitForFunction((id) => document.querySelectorAll(`.tile[data-tile="${id}"] .yt-item`).length === 3, yt);
  const f1 = await T(yt).locator('.yt-frame').evaluate((f) => ({ src: f.src, ref: f.getAttribute('referrerpolicy') }));
  ok(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/.test(f1.src) && /playlist=9bZkp7q19f0%2CkJQP7kiw5Fk/.test(f1.src), 'the player starts at the first video and queues the rest in order');
  await page.waitForTimeout(300);
  ok(f1.ref === 'strict-origin-when-cross-origin' && ytRefs.length && ytRefs.every((r) => r === BASE + '/'), 'it sends the site origin YouTube requires, and nothing more (' + ytRefs[0] + ')');
  await T(yt).locator('.yt-item').nth(1).click();
  await page.waitForFunction((id) => /embed\/9bZkp7q19f0\?/.test(document.querySelector(`.tile[data-tile="${id}"] .yt-frame`).src), yt);
  ok(/autoplay=1/.test(await T(yt).locator('.yt-frame').getAttribute('src')), 'clicking a video plays from there');
  await T(yt).locator('.yt-controls button[title="Repeat the list"]').click();
  await page.waitForFunction((id) => /loop=1/.test(document.querySelector(`.tile[data-tile="${id}"] .yt-frame`).src), yt);
  ok(true, 'Repeat loops the list');
  const parsed = await page.evaluate(() => [HB.parseYouTube('https://www.youtube.com/playlist?list=PLabcdef123').list, HB.parseYouTube('https://vimeo.com/1').error, HB.parseYouTube('youtu.be/9bZkp7q19f0').vid]);
  ok(parsed[0] === 'PLabcdef123' && /Only YouTube/.test(parsed[1]) && parsed[2] === '9bZkp7q19f0', 'playlist links, bare youtu.be links and non-YouTube links are understood');

  // ======================================================================================== delete scenario
  section('delete a scenario');
  const before = await page.locator('.tab:not(.add)').count();
  await mainMenu('This scenario');
  await page.locator('.menu.sub .menu-item', { hasText: 'Delete this scenario' }).click();
  await page.click('.modal .btn.danger');
  await page.waitForFunction((n) => document.querySelectorAll('.tab:not(.add)').length === n - 1, before);
  ok(!(await page.locator('.tab:has-text("Videos")').count()), '⋯ → This scenario → Delete removes the current scenario');
  await settle();
  ok(/Videos/.test(await page.evaluate(async () => JSON.stringify((await HB.api.trash()).items))), 'it goes to the trash and can be restored');

  // ======================================================================================== sharing
  section('share a scenario: password, expiry, read-only');
  await page.keyboard.press('1'); await page.waitForTimeout(300);
  const work = await page.evaluate(() => HB.app.scenarioId);
  await page.evaluate(async () => {
    const S = HB.store, sid = HB.app.scenarioId;
    const td = S.tilesOf(sid).find((t) => t.type === 'todo');
    await S.create('tasks', { tile_id: td.id, bucket: 'urgent', text: 'Shared task' });
    const fd = await HB.board.addTile('feeds'); HB.setTileSettings(fd.id, { feeds: [{ id: 'f1', name: 'F', url: 'http://127.0.0.1:9099/v3-feed.xml' }] });
    await HB.board.addTile('music');
    await HB.board.addTile('search');
  });
  const smu = await page.evaluate((sid) => HB.store.tilesOf(sid).find((t) => t.type === 'music').id, work);
  await page.setInputFiles(`.tile[data-tile="${smu}"] input[type=file]`, [MP3]);
  await T(smu).locator('.file').waitFor();
  await settle();
  await mainMenu('Share this scenario');
  await page.click('.modal .btn.primary:has-text("New share link")');
  const fld = (l) => page.locator(`.modal .field:has(> span:text-is("${l}")) input, .modal .field:has(> span:text-is("${l}")) select`).first();
  await fld('Link name').fill('api');
  await page.click('.modal .btn.primary');
  await page.waitForSelector('.toast.error');
  ok(/reserved/.test(await page.locator('.toast.error').last().textContent()), 'reserved link names (api, setup, …) are refused');
  await fld('Link name').fill('home');
  const pw = await fld('Password').inputValue();
  ok(pw.length >= 12, 'a strong password is suggested (' + pw + ')');
  await fld('Link stops working').selectOption('1d');
  await page.click('.modal .btn.primary');
  await page.waitForSelector('.share-done');
  ok(/\/home$/m.test(await page.locator('.share-copy code').first().textContent()), 'the link is <site>/home');
  await page.keyboard.press('Escape');

  const vctx = await browser.newContext({ viewport: { width: 1300, height: 850 } });
  const v = await vctx.newPage();
  const verr = [];
  v.on('pageerror', (e) => verr.push(e.message));
  await v.goto(BASE + '/share.php?s=home');
  ok((await v.textContent('h1')) === 'Shared page' && !(await v.content()).includes('Shared task'), 'the link first asks for the password and shows nothing else');
  await v.fill('#pass', 'not-it'); await v.click('button[type=submit]');
  await v.waitForSelector('#login-msg:not(:empty)');
  ok(/Wrong password \(4 tries left\)/.test(await v.textContent('#login-msg')), 'a wrong password is refused and counted');
  await v.fill('#pass', pw); await v.click('button[type=submit]');
  await v.waitForSelector('.tile .task-text');
  ok(await v.locator('.task-text:has-text("Shared task")').count() === 1, 'with the password the visitor sees the scenario live');
  ok((await v.locator('.tab').allTextContents()).join() === 'Work' && /until/.test(await v.textContent('#share-badge')), 'only that scenario, with its expiry shown');
  ok((await v.locator('#btn-add, #btn-menu, #trash-zone, .add-row:not(.search-form):visible').count()) === 0, 'no adding, menus, trash or input boxes');
  await v.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; }; });
  ok((await v.locator('.engine').allTextContents()).every((n) => !/Library|Libraries/.test(n)), 'a Search box leaves out sites that still need your one-time setup');
  await v.locator('.engine', { hasText: /^Wikipedia$/ }).click();
  await v.locator('.search-form input').fill('read only'); await v.locator('.search-form input').press('Enter');
  ok((await v.evaluate(() => window.__opened[0])) === 'https://en.wikipedia.org/w/index.php?search=read%20only' && !(await v.locator('.toast').count()),
    'visitors can still use a Search box (their choice of site stays in their browser)');
  ok((await v.locator('.ui-resizable-handle').count()) === 0, 'tiles cannot be moved or resized');
  await v.waitForSelector('.feed-item');
  ok(/Shared item/.test(await v.textContent('.feed-list')), 'gadgets that fetch (news feeds) work for the visitor');
  const vs = await v.evaluate(async () => {
    const csrf = document.querySelector('meta[name=csrf]').content;
    const post = (r, body) => fetch('api.php?r=' + r, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) }).then((x) => x.status);
    return {
      batch: await post('batch', { ops: [{ op: 'setting', key: 'x', value: '1' }] }),
      batchShare: await fetch('api.php?r=batch&share=home', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: '{"ops":[]}' }).then((x) => x.status),
      state: (await fetch('api.php?r=state')).status, trash: (await fetch('api.php?r=trash')).status, exp: (await fetch('export.php')).status,
      shares: (await fetch('api.php?r=shares')).status,
      feedOther: (await fetch('api.php?r=g/feeds/feed&share=home&url=' + encodeURIComponent('http://127.0.0.1:9099/noframe.html'))).status,
      geocode: (await fetch('api.php?r=g/weather/geocode&share=home&q=x')).status,
    };
  });
  ok(vs.batch === 401 && vs.batchShare === 403 && vs.state === 401 && vs.trash === 401 && vs.exp === 401 && vs.shares === 401, 'every owner route and every write is refused ' + JSON.stringify(vs));
  ok(vs.feedOther === 403 && vs.geocode === 403, 'gadget server actions are limited to what the shared tiles hold (no free fetching)');
  const st = await v.evaluate(async () => (await fetch('api.php?r=share/state&share=home')).json());
  ok(st.scenarios.length === 1 && st.tiles.every((t) => t.scenario_id === st.scenarios[0].id) && Object.keys(st.settings).length === 0, 'the data sent holds only the shared scenario, none of your settings');
  const fid = st.files.find((f) => f.original_name === 'tone.mp3').id;
  ok((await v.evaluate(async (id) => (await fetch('file.php?id=' + id)).status, fid)) === 200, 'with "files allowed" the visitor can play/download the scenario\'s files');
  const otherFile = await page.evaluate(() => HB.store.data.files.find((f) => f.original_name === 'dropped.mp3').id);
  ok((await v.evaluate(async (id) => (await fetch('file.php?id=' + id)).status, otherFile)) === 401, 'files from other scenarios stay private');
  await v.evaluate(() => HB.store.update('tasks', HB.store.data.tasks[0].id, { text: 'changed by visitor' }));
  ok(/read-only/.test(await v.locator('.toast').last().textContent()) && (await v.locator('.task-text:has-text("Shared task")').count()) === 1, 'the visitor\'s page refuses changes and says why');
  // owner turns files off
  await page.evaluate(async () => { const s = (await HB.api.call('shares')).shares[0]; await HB.api.call('shares/save', { method: 'POST', body: { id: s.id, slug: s.slug, password: '', expires_at: s.expires_at, include_files: false } }); });
  ok((await v.evaluate(async (id) => (await fetch('file.php?id=' + id)).status, fid)) === 401, 'switching "files allowed" off blocks downloads at once');
  // owner changes the password: the visitor is locked out
  await page.evaluate(async () => { const s = (await HB.api.call('shares')).shares[0]; await HB.api.call('shares/save', { method: 'POST', body: { id: s.id, slug: s.slug, password: 'brand-new-pass', expires_at: s.expires_at, include_files: false } }); });
  ok((await v.evaluate(async () => (await fetch('api.php?r=share/state&share=home')).status)) === 401, 'changing the password locks out everyone who used the old one');
  await v.reload(); await v.fill('#pass', 'brand-new-pass'); await v.click('button[type=submit]'); await v.waitForSelector('.tile');
  // expiry
  sql("UPDATE shares SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE slug='home'");
  ok((await v.evaluate(async () => (await fetch('api.php?r=share/state&share=home')).status)) === 401, 'an expired link stops working');
  await v.reload();
  ok((await v.textContent('h1')) === 'Not available', 'and its page says it is not available');
  sql("UPDATE shares SET expires_at = NULL WHERE slug='home'");
  // brute force
  const vb = await (await browser.newContext()).newPage();
  await vb.goto(BASE + '/share.php?s=home');
  let last = '';
  for (let i = 0; i < 5; i++) { await vb.fill('#pass', 'guess' + i); await vb.click('button[type=submit]'); await vb.waitForFunction((p) => document.getElementById('login-msg').textContent && document.getElementById('login-msg').textContent !== p, last); last = await vb.textContent('#login-msg'); }
  ok(/Locked for 15 minutes/.test(last), '5 wrong passwords pause the link for 15 minutes');
  fs.readdirSync(path.join(process.env.STORAGE || 'private/storage', 'ratelimit')).forEach((f) => { if (f.endsWith('.json')) fs.unlinkSync(path.join(process.env.STORAGE || 'private/storage', 'ratelimit', f)); });
  ok(verr.length === 0, 'no errors on the visitor\'s page' + (verr.length ? ': ' + verr.join(' | ') : ''));

  // ======================================================================================== sign out everywhere
  section('sign out on all devices');
  const other = await (await browser.newContext()).newPage();
  await login(other);
  ok((await other.evaluate(async () => (await fetch('api.php?r=state')).status)) === 200, 'a second device is signed in');
  await mainMenu('Sign out on all devices');
  await page.locator('.modal input[type=checkbox]').check();
  await page.click('.modal .btn.danger');
  await page.waitForSelector('.toast:has-text("All other devices")');
  ok((await other.evaluate(async () => (await fetch('api.php?r=state')).status)) === 401, 'the other device is signed out at once');
  ok((await page.evaluate(async () => (await fetch('api.php?r=state')).status)) === 200, '"Keep this device" keeps this one signed in');
  const w = await page.evaluate(async () => { try { await HB.api.batch([{ op: 'setting', key: 'probe', value: '1' }]); return 'ok'; } catch (e) { return e.status; } });
  ok(w === 'ok', 'and it can still save (it got a fresh security token)');
  ok((await v.evaluate(async () => (await fetch('api.php?r=share/state&share=home')).status)) === 200, 'share links are not affected');
  await mainMenu('Sign out on all devices');
  await page.click('.modal .btn.danger');
  await page.waitForSelector('#login-form');
  ok(true, 'without "keep", this device is signed out too');

  ok(errors.length === 0, 'no browser errors' + (errors.length ? ': ' + errors.slice(0, 6).join(' | ') : ''));
  await browser.close();
  fake.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
