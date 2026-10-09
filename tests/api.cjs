/* API/gateway test. Needs a seeded database and the dev server.
 *   BASE=http://localhost:8080 PASS=... STORAGE=private/storage MYSQL="mysql homebase" node tests/api.cjs */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BASE = process.env.BASE || 'http://localhost:8080';
const PASS = process.env.PASS || 'test-passphrase-123';
const STORAGE = process.env.STORAGE || path.join(__dirname, '..', 'private', 'storage');
const MYSQL = process.env.MYSQL || 'mysql homebase';
let failures = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failures++; };

class Client {
  constructor() { this.cookie = ''; this.csrf = ''; this.setCookie = ''; }
  async req(route, { method = 'GET', body, form, headers = {}, csrf = true } = {}) {
    const h = { Cookie: this.cookie, ...headers };
    if (method !== 'GET' && csrf && this.csrf) h['X-CSRF-Token'] = this.csrf;
    let b;
    if (form) b = form; else if (body !== undefined) { b = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    const r = await fetch(`${BASE}/api.php?r=${route}`, { method, headers: h, body: b });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    sc.forEach((c) => { this.setCookie = c; this.cookie = c.split(';')[0]; });
    let json = null; try { json = await r.json(); } catch (e) { /* none */ }
    return { status: r.status, json };
  }
  async status() { const r = await this.req('auth/status'); this.csrf = r.json.csrf; return r; }
  async login(p = PASS) { await this.status(); const r = await this.req('auth/login', { method: 'POST', body: { passphrase: p } }); if (r.status === 200) this.csrf = r.json.csrf; return r; }
  batch(ops) { return this.req('batch', { method: 'POST', body: { ops } }); }
  state() { return this.req('state').then((r) => r.json); }
}
const sql = (q) => execSync(`${MYSQL} -N -e "${q}"`).toString().trim();
const resetLimit = () => fs.readdirSync(path.join(STORAGE, 'ratelimit')).filter((f) => f.endsWith('.json')).forEach((f) => fs.unlinkSync(path.join(STORAGE, 'ratelimit', f)));

(async () => {
  resetLimit();
  console.log('\n# login rules');
  const a = new Client();
  let r = await a.status();
  ok(r.status === 200 && r.json.authed === false && a.csrf.length > 20, 'status gives a CSRF token and not-authed');
  ok(/HttpOnly/i.test(a.setCookie) && /SameSite=Lax/i.test(a.setCookie), 'session cookie is HttpOnly + SameSite=Lax');
  ok(/Max-Age=|expires=/i.test(a.setCookie), 'session cookie is long-lived (device stays signed in)');
  r = await a.req('auth/login', { method: 'POST', body: { passphrase: 'x' }, csrf: false });
  ok(r.status === 403, 'login without CSRF token is refused');
  for (let i = 1; i <= 4; i++) { r = await a.req('auth/login', { method: 'POST', body: { passphrase: 'nope' + i } }); }
  ok(r.status === 401 && /1 tries left/.test(r.json.error), '4th wrong try warns that 1 try is left');
  r = await a.req('auth/login', { method: 'POST', body: { passphrase: 'nope5' } });
  ok(r.status === 429 && r.json.retry_after > 800 && r.json.retry_after <= 900, '5th wrong try locks for 15 minutes');
  r = await a.req('auth/login', { method: 'POST', body: { passphrase: PASS } });
  ok(r.status === 429, 'even the right passphrase is refused during the pause');
  resetLimit();
  r = await a.login();
  ok(r.status === 200 && r.json.authed, 'right passphrase signs in once the pause is over');
  r = await a.req('state', {});
  ok(r.status === 200 && r.json.scenarios.length >= 1, 'state loads when signed in');
  const noCsrf = await a.req('batch', { method: 'POST', body: { ops: [] }, csrf: false });
  ok(noCsrf.status === 403, 'writes need the CSRF header');

  console.log('\n# data rules');
  const st = await a.state();
  const sid = st.scenarios[0].id;
  r = await a.batch([{ op: 'create', type: 'tiles', data: { scenario_id: sid, type: 'bogus', x: 0, y: 0, width: 2, height: 2 } }]);
  ok(r.status === 400, 'unknown tile type is rejected');
  r = await a.batch([{ op: 'create', type: 'links', data: { tile_id: 999999, name: 'x', url: 'https://x.y' } }]);
  ok(r.status === 400, 'a link under a missing tile is rejected');
  r = await a.batch([{ op: 'update', type: 'tiles', id: 999999, data: { title: 'x' } }]);
  ok(r.status === 404, 'updating a missing row gives 404');
  r = await a.batch([{ op: 'create', type: 'files', data: { tile_id: 1 } }]);
  ok(r.status === 400, 'files cannot be created through the batch API');
  r = await a.batch([{ op: 'create', type: 'tiles', data: { scenario_id: sid, type: 'toolbox', x: 0, y: 50, width: 4, height: 3, title: 'T', settings: { k: 1 } } },
    { op: 'create', type: 'scenarios', data: { name: 'Temp' } }]);
  ok(r.status === 200 && r.json.results[0].row.settings.k === 1, 'create returns the row with settings decoded');
  const tileId = r.json.results[0].id, tempScenario = r.json.results[1].id;
  r = await a.batch([{ op: 'create', type: 'links', data: { tile_id: tileId, name: 'A', url: 'https://a.example' } }, { op: 'create', type: 'links', data: { tile_id: tileId, name: 'B', url: 'https://b.example' } }]);
  ok(r.json.results[0].row.position === 0 && r.json.results[1].row.position === 1, 'positions are assigned in order');
  const linkA = r.json.results[0].id;
  r = await a.batch([{ op: 'update', type: 'links', id: linkA, data: { name: 'A2', id: 5, deleted_at: null, tile_id: tileId } }]);
  ok(r.json.results[0].row.name === 'A2' && r.json.results[0].row.id === linkA, 'only whitelisted columns are writable');
  // transaction rollback
  r = await a.batch([{ op: 'update', type: 'links', id: linkA, data: { name: 'SHOULD-ROLL-BACK' } }, { op: 'update', type: 'tiles', id: 999999, data: { title: 'x' } }]);
  const afterRb = (await a.state()).links.find((l) => l.id === linkA);
  ok(r.status === 404 && afterRb.name === 'A2', 'a failing op rolls back the whole batch');
  // soft delete / trash / restore
  await a.batch([{ op: 'delete', type: 'links', id: linkA }]);
  ok(!(await a.state()).links.some((l) => l.id === linkA), 'deleted link disappears from state');
  let tr = (await a.req('trash')).json.items;
  ok(tr.some((i) => i.type === 'links' && i.id === linkA), 'deleted link is listed in the trash');
  await a.batch([{ op: 'restore', type: 'links', id: linkA }]);
  ok((await a.state()).links.some((l) => l.id === linkA), 'restore brings it back');
  r = await a.batch([{ op: 'purge', type: 'links', id: linkA }]);
  ok(sql(`SELECT COUNT(*) FROM links WHERE id=${linkA}`) === '1', 'purge refuses rows that are not in the trash');
  // last scenario cannot be deleted
  const others = (await a.state()).scenarios.map((s) => s.id);
  const ops = others.slice(0, -1).map((id) => ({ op: 'delete', type: 'scenarios', id }));
  r = await a.batch([...ops, { op: 'delete', type: 'scenarios', id: others[others.length - 1] }]);
  ok(r.status === 400, 'the last scenario cannot be deleted');
  await a.batch([{ op: 'delete', type: 'scenarios', id: tempScenario }]);
  ok(!(await a.state()).scenarios.some((s) => s.id === tempScenario), 'a deleted scenario leaves state');
  await a.batch([{ op: 'restore', type: 'scenarios', id: tempScenario }]);
  r = await a.batch([{ op: 'setting', key: 'theme', value: 'dark' }]);
  ok((await a.state()).settings.theme === 'dark', 'settings are saved');
  r = await a.batch([{ op: 'setting', key: 'Bad Key!', value: 'x' }]);
  ok(r.status === 400, 'bad setting keys are rejected');

  console.log('\n# search');
  r = await a.req('search&q=B');
  ok(r.status === 200 && r.json.results.some((x) => x.label === 'B' && x.url === 'https://b.example'), 'search finds a link and returns its url');
  r = await a.req('search&q=' + encodeURIComponent('%'));
  ok(r.status === 200 && r.json.results.length === 0, 'LIKE wildcards are escaped');

  console.log('\n# files on disk');
  const ft = (await a.batch([{ op: 'create', type: 'tiles', data: { scenario_id: sid, type: 'files', x: 0, y: 60, width: 4, height: 3, title: 'F' } }])).json.results[0].id;
  const form = new FormData();
  form.append('tile_id', String(ft));
  form.append('file', new Blob(['payload-123']), '../../evil name.txt');
  r = await a.req('upload', { method: 'POST', form });
  ok(r.status === 200 && r.json.files[0].original_name === 'evil name.txt', 'upload stores the file; path parts in the name are stripped');
  const fid = r.json.files[0].id;
  ok(!('stored_name' in r.json.files[0]), 'stored name is never sent to the browser');
  const stored = sql(`SELECT stored_name FROM files WHERE id=${fid}`);
  ok(/^[a-f0-9]{32}$/.test(stored) && fs.existsSync(path.join(STORAGE, 'files', stored)), 'bytes sit in private storage under a random name');
  const dl = await fetch(`${BASE}/file.php?id=${fid}&dl=1`, { headers: { Cookie: a.cookie } });
  ok(dl.status === 200 && (await dl.text()) === 'payload-123', 'download returns the exact bytes');
  const anon = await fetch(`${BASE}/file.php?id=${fid}`);
  ok(anon.status === 401, 'anonymous file request is refused');
  // chunk protocol
  const up = 'a'.repeat(32), data = Buffer.from('0123456789');
  const chunk = (off, buf) => { const f = new FormData(); f.append('upload_id', up); f.append('offset', String(off)); f.append('total', '10'); f.append('name', 'chunked.bin'); f.append('tile_id', String(ft)); f.append('file', new Blob([buf]), 'c'); return a.req('upload-chunk', { method: 'POST', form: f }); };
  r = await chunk(0, data.subarray(0, 4));
  ok(r.json.done === false && r.json.received === 4, 'first chunk is accepted');
  r = await chunk(8, data.subarray(8));
  ok(r.status === 409, 'an out-of-order chunk is refused');
  r = await chunk(4, data.subarray(4));
  ok(r.json.done === true && r.json.file.size === 10, 'last chunk completes the file');
  // trash → purge after 30 days removes the file from disk
  await a.batch([{ op: 'delete', type: 'files', id: fid }]);
  ok(fs.existsSync(path.join(STORAGE, 'files', stored)), 'a trashed file stays on disk (restorable)');
  sql(`UPDATE files SET deleted_at = UTC_TIMESTAMP() - INTERVAL 31 DAY WHERE id=${fid}`);
  sql(`DELETE FROM settings WHERE \\\`key\\\`='_last_purge'`);
  await a.state();
  ok(sql(`SELECT COUNT(*) FROM files WHERE id=${fid}`) === '0' && !fs.existsSync(path.join(STORAGE, 'files', stored)), 'after 30 days the purge removes the row and the bytes');
  // purging a tile removes its files too
  const f2 = (await a.state()).files.find((f) => f.original_name === 'chunked.bin');
  const stored2 = sql(`SELECT stored_name FROM files WHERE id=${f2.id}`);
  await a.batch([{ op: 'delete', type: 'tiles', id: ft }]);
  r = await a.batch([{ op: 'purge', type: 'tiles', id: ft }]);
  ok(sql(`SELECT COUNT(*) FROM files WHERE tile_id=${ft}`) === '0' && !fs.existsSync(path.join(STORAGE, 'files', stored2)), 'purging a tile cascades to its files on disk');

  console.log('\n# new tile data rules');
  const mk = async (type) => (await a.batch([{ op: 'create', type: 'tiles', data: { scenario_id: sid, type, x: 0, y: 90, width: 3, height: 3 } }])).json.results[0].id;
  const fcT = await mk('flashcards'), quT = await mk('quotes'), skT = await mk('sketch'), flT = await mk('files');
  r = await a.batch([{ op: 'create', type: 'entries', data: { tile_id: fcT, kind: 'card', a: 'Q', b: 'A', due_at: '2026-10-07T10:00:00Z', data: { ivl: 1, ease: 2.5 } } }]);
  ok(r.status === 200 && r.json.results[0].row.data.ivl === 1 && r.json.results[0].row.due_at === '2026-10-07T10:00:00Z', 'a card is stored with its schedule ' + JSON.stringify(r.json).slice(0, 300));
  const cardId = r.json.results[0].id;
  r = await a.batch([{ op: 'create', type: 'entries', data: { tile_id: quT, kind: 'card', a: 'x' } }]);
  ok(r.status === 400, 'a card cannot be put in a quotes tile');
  r = await a.batch([{ op: 'create', type: 'entries', data: { tile_id: fcT, kind: 'nonsense', a: 'x' } }]);
  ok(r.status === 400, 'an unknown entry kind is refused');
  r = await a.batch([{ op: 'update', type: 'entries', id: cardId, data: { kind: 'quote', tile_id: quT } }]);
  ok(r.status === 400, 'an entry cannot be moved into a tile of the wrong type (kind cannot change either)');
  r = await a.batch([{ op: 'create', type: 'entries', data: { tile_id: fcT, kind: 'card', a: 'x', day: '2026-02-30' } }]);
  ok(r.status === 400, 'an impossible date is refused');
  r = await a.batch([{ op: 'create', type: 'entries', data: { tile_id: fcT, kind: 'card', a: 'x'.repeat(5000), b: 'y' } }]);
  ok(r.status === 200, 'long text is accepted (MEDIUMTEXT)');
  await a.batch([{ op: 'delete', type: 'entries', id: cardId }]);
  ok((await a.req('trash')).json.items.some((i) => i.type === 'entries' && i.id === cardId && i.label === 'Q'), 'a deleted card shows in the trash by its front text');
  r = await a.req('search&q=' + encodeURIComponent('xxxxx'));
  ok(r.json.results.some((x) => x.type === 'entries' && x.kind === 'card'), 'search covers card text');

  console.log('\n# outbound fetch is locked down');
  const anon2 = new Client();
  for (const route of ['g/feeds/feed&url=http://example.com/x', 'g/reading/title&url=http://example.com/x', 'g/weather/geocode&q=singapore', 'g/weather/weather&lat=1&lon=1']) {
    r = await anon2.req(route);
    ok(r.status === 401, route.split('&')[0] + ' needs a login');
  }
  const bad = ['http://127.0.0.1/x', 'http://localhost/x', 'http://[::1]/x', 'http://10.0.0.5/x', 'http://192.168.1.1/x', 'http://169.254.169.254/latest/meta-data/', 'http://0.0.0.0/', 'file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com/', 'http://user:pw@example.com/', 'http://example.com:22/', 'javascript:alert(1)'];
  for (const u of bad) {
    r = await a.req('g/feeds/feed&url=' + encodeURIComponent(u));
    ok(r.status >= 400 && r.status < 500 && !/ssh|root:/i.test(JSON.stringify(r.json)), 'feed refuses ' + u + ' (' + r.status + ': ' + r.json.error + ')');
  }
  r = await a.req('g/reading/title&url=' + encodeURIComponent('http://169.254.169.254/'));
  ok(r.status === 400, 'the page-title lookup is guarded the same way');
  r = await a.req('g/weather/weather&lat=999&lon=0');
  ok(r.status === 400, 'weather rejects impossible coordinates');

  r = await a.req('g/nosuch/thing');
  ok(r.status === 404, 'an unknown gadget action is a clean 404');
  r = await a.req('g/clock/anything');
  ok(r.status === 404, 'a gadget without server actions answers 404');

  console.log('\n# sketch uploads');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up1 = async (tile, blob, name, replace) => { const f = new FormData(); f.append('tile_id', String(tile)); if (replace) f.append('replace_id', String(replace)); f.append('file', blob, name); return a.req('upload', { method: 'POST', form: f }); };
  r = await up1(skT, new Blob(['not an image']), 'a.txt');
  ok(r.status === 400 && /PNG/.test(r.json.error), 'a sketch tile only accepts PNG images');
  r = await up1(skT, new Blob([png]), 'sketch.png');
  ok(r.status === 200 && r.json.files[0].type === 'image/png', 'a PNG is stored for the sketch');
  const skFile = r.json.files[0].id;
  const skStored = sql(`SELECT stored_name FROM files WHERE id=${skFile}`);
  r = await up1(skT, new Blob([png, Buffer.from([0])]), 'sketch.png', skFile);
  const skStored2 = sql(`SELECT stored_name FROM files WHERE id=${skFile}`);
  ok(r.status === 200 && r.json.files[0].id === skFile && skStored2 !== skStored && !fs.existsSync(path.join(STORAGE, 'files', skStored)) && fs.existsSync(path.join(STORAGE, 'files', skStored2)), 'replace_id overwrites the same record and removes the old bytes');
  r = await up1(flT, new Blob([png]), 'x.png', skFile);
  ok(r.status === 400, 'replace_id cannot touch another tile\'s file (or a non-sketch tile)');
  ok(sql(`SELECT COUNT(*) FROM files WHERE tile_id=${skT}`) === '1', 'still exactly one record for the sketch');
  for (const t of [fcT, quT, skT, flT]) { await a.batch([{ op: 'delete', type: 'tiles', id: t }, { op: 'purge', type: 'tiles', id: t }]); }

  console.log('\n# export');
  const ex = await fetch(`${BASE}/export.php?format=json`, { headers: { Cookie: a.cookie } });
  const exj = await ex.json();
  ok(ex.status === 200 && exj.tiles.length > 0 && Array.isArray(exj.settings), 'JSON export works');
  ok((await fetch(`${BASE}/export.php`)).status === 401, 'export needs a login');

  // clean up test data
  await a.batch([{ op: 'delete', type: 'tiles', id: tileId }, { op: 'purge', type: 'scenarios', id: tempScenario }].slice(0, 1));
  await a.req('auth/logout', { method: 'POST' });
  resetLimit();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
