/* Files gadget folders: create, open, nest, move (drag + menu), delete, upload into a folder, folder drop,
 * zip paths, share visibility. See tests/README.md.
 *   BASE=http://localhost:8080 MYSQL="mysql homebase" node tests/folders.cjs
 * Needs Playwright + Chromium and a fresh (seeded) database. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8080';
const PASS = process.env.PASS || 'test-passphrase-123';
const CHROME = process.env.CHROME || undefined;

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failures++; };
const section = (t) => console.log('\n# ' + t);

async function drag(page, from, to) {
  const a = await from.boundingBox(), b = await to.boundingBox();
  const sx = a.x + a.width / 2, sy = a.y + a.height / 2, tx = b.x + b.width / 2, ty = b.y + b.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 6, sy + 6, { steps: 3 });
  await page.mouse.move(tx, ty, { steps: 14 });
  await page.waitForTimeout(150);
  await page.mouse.move(tx + 1, ty + 1, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}
const settle = (page) => page.waitForFunction(() => HB.store.status === 'saved' && !HB.store.ops.length, null, { timeout: 8000 });

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/401|403|429/.test(m.text())) errors.push('console: ' + m.text()); });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-folders-'));
  const mk = (n, body) => { const p = path.join(dir, n); fs.writeFileSync(p, body); return p; };
  const fA = mk('alpha.txt', 'alpha'), fB = mk('beta.txt', 'beta'), fC = mk('gamma.txt', 'gamma');

  await page.goto(BASE + '/');
  await page.fill('#pass', PASS);
  await page.click('button[type=submit]');
  await page.waitForSelector('.tile');
  await page.evaluate(() => HB.board.addTile('files'));
  const tile = page.locator('.tile[data-type="files"]').first();
  await tile.waitFor();
  const root = () => tile.locator('.files:not(.folders)');
  const names = async () => (await tile.locator('.files:not(.folders) .file-name').allTextContents());
  const folderNames = async () => (await tile.locator('.files.folders .file-name').allTextContents());
  const state = () => page.evaluate(() => ({
    files: HB.store.data.files.map((f) => ({ id: f.id, n: f.original_name, d: f.folder_id })),
    folders: HB.store.data.entries.filter((e) => e.kind === 'folder').map((e) => ({ id: e.id, n: e.a, p: e.num })),
  }));
  const newFolder = async (name) => {
    await tile.locator('.btn-folder').click();
    await page.fill('.modal input', name);
    await page.click('.modal .btn.primary, .modal button:has-text("Create")');
    await page.waitForFunction((n) => HB.store.data.entries.some((e) => e.kind === 'folder' && e.a === n), name);
    await settle(page);
  };

  section('create folders and upload');
  await tile.locator('input[type=file]').setInputFiles([fA, fB]);
  await tile.locator('.file').nth(1).waitFor();
  await settle(page);
  ok((await names()).length === 2, 'two files at the top level');
  await newFolder('Docs');
  ok((await folderNames()).join() === 'Docs', 'folder "Docs" is listed');
  ok(/Empty/.test(await tile.locator('.files.folders .file-meta').textContent()), 'an empty folder says so');

  section('drag a file into a folder');
  await drag(page, root().locator('.file', { hasText: 'alpha.txt' }), tile.locator('.files.folders .file.folder'));
  await settle(page);
  let st = await state();
  const docs = st.folders.find((f) => f.n === 'Docs');
  ok(st.files.find((f) => f.n === 'alpha.txt').d === docs.id, 'alpha.txt now belongs to Docs');
  ok(!(await names()).includes('alpha.txt') && (await names()).includes('beta.txt'), 'alpha.txt left the top-level list');
  ok(/1 file/.test(await tile.locator('.files.folders .file-meta').textContent()), 'folder shows "1 file"');

  section('open folder, upload into it, nest');
  await tile.locator('.files.folders .file.folder .file-name').click();
  await tile.locator('.crumbs').waitFor();
  ok((await names()).join() === 'alpha.txt', 'inside Docs only alpha.txt shows');
  ok(/All files/.test(await tile.locator('.crumbs').textContent()) && /Docs/.test(await tile.locator('.crumbs .here').textContent()), 'breadcrumb shows All files › Docs');
  await tile.locator('input[type=file]').setInputFiles([fC]);
  await page.waitForFunction(() => HB.store.data.files.some((f) => f.original_name === 'gamma.txt'));
  await settle(page);
  st = await state();
  ok(st.files.find((f) => f.n === 'gamma.txt').d === docs.id, 'upload while inside Docs lands in Docs (server-side folder_id)');
  await newFolder('Sub');
  st = await state();
  const sub = st.folders.find((f) => f.n === 'Sub');
  ok(sub.p === docs.id, 'new folder inside Docs is a child of Docs');
  ok((await folderNames()).join() === 'Sub', 'Sub shows inside Docs');

  section('move with the menu, and drag to a breadcrumb');
  await root().locator('.file', { hasText: 'gamma.txt' }).click({ button: 'right' });
  await page.locator('.menu >> text=Move to folder').click();
  await page.locator('.menu.sub >> text=Sub').click();
  await settle(page);
  st = await state();
  ok(st.files.find((f) => f.n === 'gamma.txt').d === sub.id, 'menu: gamma.txt moved to Sub');
  await drag(page, root().locator('.file', { hasText: 'alpha.txt' }), tile.locator('.crumb', { hasText: 'All files' }));
  await settle(page);
  st = await state();
  ok(st.files.find((f) => f.n === 'alpha.txt').d === 0, 'dragging onto the "All files" crumb moves it to the top level');

  section('rename, delete folder');
  await tile.locator('.crumb', { hasText: 'All files' }).click();
  await tile.locator('.files.folders .file.folder').click({ button: 'right' });
  await page.locator('.menu >> text=Rename').click();
  await page.fill('.inline-edit', 'Papers');
  await page.press('.inline-edit', 'Enter');
  await settle(page);
  ok((await folderNames()).join() === 'Papers', 'folder renamed to Papers');
  await tile.locator('.files.folders .file.folder').click({ button: 'right' });
  await page.locator('.menu >> text=Delete folder').click();
  await settle(page);
  st = await state();
  ok(!st.folders.some((f) => f.n === 'Papers'), 'folder is gone');
  const sub2 = st.folders.find((f) => f.n === 'Sub');
  ok(sub2 && sub2.p === 0, 'its sub-folder moved up to the top level');
  ok(st.files.every((f) => f.d === 0 || f.d === sub.id), 'files were not lost (gamma stays in Sub, others at top)');
  ok((await names()).includes('alpha.txt') && (await names()).includes('beta.txt'), 'top level lists alpha and beta');
  await page.keyboard.press('Control+z');
  await settle(page);
  ok((await folderNames()).includes('Papers'), 'undo brings the folder back');
  await page.keyboard.press('Control+Shift+z');
  await settle(page);

  section('folders survive a reload');
  await page.reload();
  await page.waitForSelector('.tile[data-type="files"]');
  ok((await folderNames()).join() === 'Sub', 'Sub is still there after reload');
  await tile.locator('.files.folders .file.folder .file-name').click();
  ok((await names()).join() === 'gamma.txt', 'gamma.txt is still in Sub');

  section('dropping a desktop folder rebuilds the tree');
  await tile.locator('.crumb', { hasText: 'All files' }).click();
  await page.evaluate(async () => {
    const t = HB.store.data.tiles.find((x) => x.type === 'files');
    const mkf = (n, dirs) => { const f = new File([n], n, { type: 'text/plain' }); f._dir = dirs; return f; };
    await HB.upload.files([mkf('one.txt', ['Photos']), mkf('two.txt', ['Photos', '2024']), mkf('three.txt', ['Photos', '2024']), mkf('Sub.txt', ['sub'])], t.id);
  });
  await page.waitForFunction(() => HB.store.data.files.filter((f) => /^(one|two|three|Sub)\.txt$/.test(f.original_name)).length === 4, null, { timeout: 15000 });
  await settle(page);
  st = await state();
  const photos = st.folders.find((f) => f.n === 'Photos'), y24 = st.folders.find((f) => f.n === '2024');
  ok(photos && photos.p === 0 && y24 && y24.p === photos.id, 'Photos/2024 created with the right parents');
  ok(st.files.find((f) => f.n === 'one.txt').d === photos.id && st.files.find((f) => f.n === 'two.txt').d === y24.id && st.files.find((f) => f.n === 'three.txt').d === y24.id, 'files sit in the matching folders');
  ok(st.folders.filter((f) => f.n.toLowerCase() === 'sub').length === 1 && st.files.find((f) => f.n === 'Sub.txt').d === sub.id, 'an existing folder is reused (case-insensitive), not duplicated');

  section('tree view: several folders open at once');
  await page.evaluate(() => { const t = HB.store.data.tiles.find((x) => x.type === 'files'); HB.store.update('tiles', t.id, { height: 11 }); });
  await settle(page);
  await tile.locator('.btn-tree').click();
  await tile.locator('.tree').waitFor();
  ok((await tile.locator('.tree-head').count()) >= 3, 'tree shows All files plus the folders');
  ok((await tile.locator('.tree-files .file-name', { hasText: 'one.txt' }).count()) === 0, 'folders start collapsed');
  const head = (n) => tile.locator('.tree-head', { hasText: n }).first();
  await head('Photos').locator('.tree-twist').click();
  await head('Sub').locator('.tree-twist').click();
  ok((await tile.locator('.tree-files .file-name', { hasText: 'gamma.txt' }).count()) === 1, 'Sub is open and shows gamma.txt');
  await head('2024').locator('.tree-twist').click();
  ok((await tile.locator('.tree-files .file-name', { hasText: 'two.txt' }).count()) === 1 && (await tile.locator('.tree-files .file-name', { hasText: 'gamma.txt' }).count()) === 1, 'Photos › 2024 and Sub are open together');
  await tile.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await drag(page, tile.locator('.tree-files .file', { hasText: 'beta.txt' }), head('Sub'));
  await settle(page);
  st = await state();
  ok(st.files.find((f) => f.n === 'beta.txt').d === sub.id, 'dragging a file onto a folder row moves it in the tree');
  ok((await tile.locator('.tree-files[data-folder="' + sub.id + '"] .file-name', { hasText: 'beta.txt' }).count()) === 1, 'it now shows inside the open Sub folder');
  await tile.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await drag(page, tile.locator('.tree-files .file', { hasText: 'two.txt' }), tile.locator('.tree-root'));
  await settle(page);
  st = await state();
  ok(st.files.find((f) => f.n === 'two.txt').d === 0, 'dragging onto "All files" moves it to the top level');
  await page.reload();
  await page.waitForSelector('.tile[data-type="files"] .tree');
  ok((await tile.locator('.tree-files .file-name', { hasText: 'gamma.txt' }).count()) === 1 && (await tile.locator('.tree-files .file-name', { hasText: 'one.txt' }).count()) === 1, 'the expanded folders are remembered after a reload');
  await head('Sub').locator('.file-name').click();
  ok(/Uploads → Sub/.test(await tile.locator('.file-bar').textContent()), 'selecting a folder makes it the upload target');
  await tile.locator('input[type=file]').setInputFiles([mk('delta.txt', 'delta')]);
  await page.waitForFunction(() => HB.store.data.files.some((f) => f.original_name === 'delta.txt'));
  await settle(page);
  st = await state();
  ok(st.files.find((f) => f.n === 'delta.txt').d === sub.id, 'an upload lands in the selected folder');
  await page.evaluate(() => { const t = HB.store.data.tiles.find((x) => x.type === 'files'); HB.fileTree.collapseAll(t.id, t.id); });
  ok((await tile.locator('.tree-files .file-name', { hasText: 'gamma.txt' }).count()) === 0, 'collapse all closes every folder');
  await page.evaluate(() => { const t = HB.store.data.tiles.find((x) => x.type === 'files'); HB.fileTree.expandAll(t.id, t.id); });
  ok((await tile.locator('.tree-files .file-name', { hasText: 'one.txt' }).count()) === 1 && (await tile.locator('.tree-files .file-name', { hasText: 'delta.txt' }).count()) === 1, 'expand all opens them all');
  await tile.locator('.btn-tree').click();
  await tile.locator('.tree').waitFor({ state: 'detached' });
  ok((await tile.locator('.tree').count()) === 0, 'the List button goes back to one folder at a time');

  section('server rules');
  const bad = await page.evaluate(async () => {
    const t = HB.store.data.tiles.find((x) => x.type === 'files');
    const f = new FormData(); f.append('tile_id', t.id); f.append('folder_id', '99999'); f.append('file', new Blob(['x']), 'orphan.txt');
    const r = await fetch('api.php?r=upload', { method: 'POST', headers: { 'X-CSRF-Token': HB.api.csrf() }, body: f });
    return (await r.json()).files[0].folder_id;
  });
  ok(bad === 0, 'an unknown folder_id on upload falls back to the top level');
  const zipNames = await page.evaluate(async () => {
    const b = new Uint8Array(await (await fetch('export.php?format=zip')).arrayBuffer());
    return new TextDecoder('latin1').decode(b);
  });
  ok(/files\/Photos\/2024\/\d+-three\.txt/.test(zipNames) && /files\/Sub\/\d+-gamma\.txt/.test(zipNames) && /files\/\d+-two\.txt/.test(zipNames), 'zip backup keeps the folder paths');

  section('share page');
  const slug = 'folderstest' + Date.now().toString(36).slice(-4);
  const sid = await page.evaluate(() => HB.store.data.scenarios[0].id);
  let shareId;
  const save = (inc) => page.evaluate(async ({ sid, slug, inc, id }) => {
    const r = await fetch('api.php?r=shares/save', { method: 'POST', headers: { 'X-CSRF-Token': HB.api.csrf(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id, scenario_id: sid, slug, password: 'secret-pass-1', include_files: inc }) });
    const j = await r.json();
    return { status: r.status, id: j.share && j.share.id };
  }, { sid, slug, inc, id: shareId }).then((r) => { shareId = r.id || shareId; return r.status; });
  const shareFolders = async () => {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.goto(BASE + '/' + slug);
    const out = await p.evaluate(async ({ slug }) => {
      const csrf = (document.querySelector('meta[name="csrf"]') || {}).content || (window.HB && HB.api && HB.api.csrf && HB.api.csrf()) || '';
      await fetch('api.php?r=share/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ slug, password: 'secret-pass-1' }) });
      const j = await (await fetch('api.php?r=share/state&share=' + slug)).json();
      return { folders: (j.entries || []).filter((e) => e.kind === 'folder').length, files: (j.files || []).length };
    }, { slug });
    await c.close();
    return out;
  };
  ok((await save(false)) === 200, 'share link created without file downloads');
  const off = await shareFolders();
  ok(off.files === 0 && off.folders === 0, 'without file downloads the share exposes no files and no folder names');
  ok((await save(true)) === 200, 'share link switched to include files');
  const on = await shareFolders();
  ok(on.files > 0 && on.folders > 0, 'with file downloads the share has files and folders (' + on.files + ' files, ' + on.folders + ' folders)');

  ok(errors.length === 0, 'no console or page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
