/* Browser test for round 4: the document editor (CKEditor-style Writer), the Writer folder, and scenario groups.
 *   BASE=http://127.0.0.1:8080 node tests/v4.cjs
 * Needs a fresh, seeded database (truncate the tables first, see tests/README.md). Runs in Asia/Singapore time. */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const PASS = process.env.PASS || 'test-passphrase-123';
const PNG = path.join(__dirname, 'fixtures', 'pixel.png');
let failures = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failures++; };
const section = (t) => console.log('\n# ' + t);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, timezoneId: 'Asia/Singapore' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (40[0-9]|413|415|422|429|502)|ERR_FAILED/.test(m.text())) errors.push('console: ' + m.text()); });
  const settle = () => page.waitForFunction(() => HB.store.status === 'saved' && !HB.store.ops.length, null, { timeout: 8000 });
  const T = (id) => page.locator(`.tile[data-tile="${id}"]`);
  const addTile = (type) => page.evaluate(async (t) => (await HB.board.addTile(t)).id, type);
  const scratch = async (name) => { await page.evaluate(async (n) => { const r = await HB.store.create('scenarios', { name: n }); HB.app.showScenario(r.id); }, name); await page.waitForTimeout(250); };
  const login = async (p) => { await p.goto(BASE + '/'); await p.fill('#pass', PASS); await p.click('button[type=submit]'); await p.waitForSelector('.tile'); };
  const tabs = () => page.evaluate(() => document.getElementById('tabs').innerText.replace(/\n/g, ' | '));
  await login(page);

  // ======================================================================================== editor
  section('editor: Markdown shortcuts, toolbar, tables, links, find, source, undo');
  await scratch('Docs');
  const wr = await addTile('writer');
  await page.evaluate((id) => HB.board.toggleMax(id), wr);
  const ed = T(wr).locator('.wr-rich');
  const html = () => ed.evaluate((e) => e.innerHTML);
  await ed.click();
  await page.keyboard.type('# Title'); await page.keyboard.press('Enter');
  ok(/^<h1>Title<\/h1>/.test(await html()), 'typing "# " makes a heading');
  await page.keyboard.type('plain **bold** and *slanted* and `code` end'); await page.keyboard.press('Enter');
  let x = await html();
  ok(/<b>bold<\/b>/.test(x) && /<i>slanted<\/i>/.test(x) && /<code>code<\/code>/.test(x), 'typing **bold**, *italic* and `code` formats the words');
  ok(/<h1>Title<\/h1><p>plain /.test(x), 'Enter after a heading starts a clean paragraph');
  await page.keyboard.type('- one'); await page.keyboard.press('Enter'); await page.keyboard.type('two'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.keyboard.type('[] first job'); await page.keyboard.press('Enter'); await page.keyboard.type('second job');
  x = await html();
  ok(/<ul><li>one<\/li><li>two<\/li><\/ul>/.test(x), '"- " starts a bulleted list, Enter twice leaves it');
  ok(/<ul class="todo"><li>first job<\/li><li>second job<\/li><\/ul>/.test(x), '"[] " starts a to-do list');
  ok(!/<p>(<ul|<ol|<p|<h)/.test(x), 'lists are never left inside a paragraph');
  await T(wr).locator('ul.todo li').first().click({ position: { x: 8, y: 8 } });
  ok(/<li data-done="1">first job/.test(await html()), 'clicking the tick box checks a to-do item');
  await page.keyboard.press('Control+End'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.keyboard.type('after the lists');
  // toolbar: size, colour, align
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await T(wr).locator('.wr-dd-size').click(); await page.locator('.wr-pop-item', { hasText: /^24$/ }).click();
  await T(wr).locator('.wr-b[title^="Text colour"]').click(); await page.locator('.wr-pal .wr-sw').nth(8).click();
  await T(wr).locator('.wr-b[title^="Alignment"]').click(); await page.locator('.wr-pop-item', { hasText: 'Centre' }).click();
  x = await html();
  ok(/font-size: 24px/.test(x) && /color: rgb/.test(x) && /text-align: center/.test(x), 'font size, text colour and alignment from the toolbar');
  // table
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await T(wr).locator('.wr-b[title^="Table"]').click(); await page.locator('.wr-tcell').nth(1 * 8 + 2).click();
  await page.keyboard.type('a'); await page.keyboard.press('Tab'); await page.keyboard.type('b'); await page.keyboard.press('Tab'); await page.keyboard.type('c');
  await T(wr).locator('.wr-b[title^="Table"]').click(); await page.locator('.wr-pop-item', { hasText: 'Column right' }).click();
  await T(wr).locator('.wr-b[title^="Table"]').click(); await page.locator('.wr-pop-item', { hasText: 'Row below' }).click();
  const tb = await ed.evaluate((e) => { const t = e.querySelector('table'); return { rows: t.rows.length, cols: t.rows[0].cells.length, text: t.rows[0].textContent, th: t.rows[0].cells[0].tagName }; });
  ok(tb.rows === 3 && tb.cols === 4 && tb.text.startsWith('abc') && tb.th === 'TH', 'table: grid picker, Tab moves between cells, add column and row');
  // link: dialog, balloon
  await ed.press('Control+End'); await page.keyboard.press('Enter'); await page.keyboard.type('see ');
  await page.keyboard.press('Control+k');
  await page.locator('.modal input').nth(0).fill('example.com'); await page.locator('.modal input').nth(1).fill('Example');
  await page.locator('.modal button', { hasText: 'Apply' }).click();
  ok(/see(&nbsp;| )<a href="https:\/\/example\.com">Example<\/a>/.test(await html()), 'Ctrl+K adds a link at the caret (the dialog also works while the tile is enlarged)');
  await page.waitForTimeout(250);
  ok(await T(wr).locator('.wr-balloon').isVisible() && /example\.com/.test(await T(wr).locator('.wr-bb-url').textContent()), 'a link balloon offers open / edit / unlink');
  await T(wr).locator('.wr-bb', { hasText: 'Unlink' }).click();
  ok(!/<a /.test(await html()), 'Unlink removes it');
  // paste an address over selected words
  await page.keyboard.press('Shift+Control+ArrowLeft');
  await page.evaluate(() => { const e = document.querySelector('.wr-rich'); const dt = new DataTransfer(); dt.setData('text/plain', 'https://example.org/p'); e.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  ok(/<a href="https:\/\/example\.org\/p"/.test(await html()), 'pasting an address over selected text links it');
  // image: upload, size, align, resize, remove, undo
  await ed.press('Control+End');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), (async () => { await T(wr).locator('.wr-b[title^="Image"]').click(); await page.locator('.wr-pop-item', { hasText: 'Upload' }).click(); })()]);
  await fc.setFiles(PNG);
  await T(wr).locator('.wr-rich img').waitFor();
  ok(/<img src="file\.php\?id=\d+"/.test(await html()), 'an uploaded picture is inserted as a stored file');
  await T(wr).locator('.wr-rich img').click();
  await T(wr).locator('.wr-bb', { hasText: '25%' }).click(); await T(wr).locator('.wr-bb[title="Centre"]').click();
  await page.waitForTimeout(250);
  x = await html();
  ok(/width="25%"/.test(x) && /data-align="center"/.test(x), 'a picture can be sized and centred from its balloon');
  await T(wr).locator('.wr-rich img').scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
  const hb = await T(wr).locator('.wr-handle').boundingBox();
  await page.mouse.move(hb.x + 7, hb.y + 7); await page.mouse.down(); await page.mouse.move(hb.x + 90, hb.y + 40, { steps: 5 }); await page.mouse.up();
  ok(!/width="25%"/.test(await html()) && /width="\d+%"/.test(await html()), 'dragging the corner resizes it');
  await T(wr).locator('.wr-bb[title="Remove picture"]').click();
  ok(!/<img/.test(await html()), 'a picture can be removed');
  await page.keyboard.press('Control+z');
  ok(/<img/.test(await html()), 'Ctrl+Z brings it back (the editor keeps its own undo history)');
  // find and replace
  await page.keyboard.press('Control+f');
  await T(wr).locator('.wr-fi').first().fill('job');
  ok(/2 of 2|1 of 2/.test(await T(wr).locator('.wr-find-info').textContent()), 'Ctrl+F finds matches');
  await T(wr).locator('.wr-fi').nth(1).fill('task'); await T(wr).locator('.wr-find button', { hasText: 'All' }).click();
  x = await html();
  ok(/first task/.test(x) && /second task/.test(x), 'replace all');
  await T(wr).locator('.wr-find-x').click();
  // source view
  await T(wr).locator('.wr-b.src').click();
  await T(wr).locator('.wr-source').fill('<h2 style="color:red;background:url(x)">Source</h2><p onclick="x()">hi<script>window.__x=1</script><a href="javascript:1">j</a></p>');
  await T(wr).locator('.wr-b.src').click();
  x = await html();
  ok(/^<h2 style="color: red">Source<\/h2><p>hi<a>j<\/a><\/p>$/.test(x) && (await page.evaluate(() => window.__x)) === undefined, 'HTML source edits are cleaned again before they are used');
  await ed.click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' typed'); await page.waitForTimeout(500);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
  ok(!/typed/.test(await html()), 'undo, then redo');
  await page.keyboard.press('Control+Shift+z');
  ok(/typed/.test(await html()), 'redo puts it back');
  await page.waitForTimeout(900); await settle();
  await page.evaluate(() => HB.board.restoreMax());
  const rich = await page.evaluate(() => HB.sanitizeHtml('<p style="font-size:24px;color:#abc;position:fixed;font-family:Georgia, serif">x</p><span style="background-color:rgb(1,2,3)">y</span><ul class="todo evil"><li data-done="1" onclick="1">z</li></ul><img src="file.php?id=4" width="30%" data-align="left" onerror="1"><img src="javascript:1">'));
  ok(rich === '<p style="font-size: 24px; color: #abc; font-family: Georgia, serif">x</p><span style="background-color: rgb(1,2,3)">y</span><ul class="todo"><li data-done="1">z</li></ul><img src="file.php?id=4" width="30%" data-align="left">', 'the sanitizer keeps the new formatting (size, font, to-do, picture size) and nothing else (' + rich + ')');
  ok(await page.evaluate(() => HB.editor.toText('<h1>A</h1><p>b<br>c</p><ul><li>d</li></ul>') === 'A\nb\nc\nd'), 'plain text export');

  // tables resize by dragging, paste as plain text, own icon
  section('editor: resizable tables, paste as plain text, own icon');
  await page.evaluate(() => HB.board.toggleMax(Number(document.querySelector('.tile[data-type="writer"]').dataset.tile)));
  await ed.click(); await page.keyboard.press('Control+End');
  await T(wr).locator('.wr-b[title="Table"]').click();
  await page.locator('.wr-tcell').nth(2 * 8 + 1).click(); // 3 rows x 2 columns
  const th0 = T(wr).locator('.wr-rich th').first();
  const cb = await th0.boundingBox();
  await page.mouse.move(cb.x + cb.width - 1, cb.y + cb.height / 2);
  ok(await T(wr).locator('.wr-rich.wr-col-resize').count() === 1, 'the pointer turns into a column-resize arrow on a cell edge');
  await page.mouse.down(); await page.mouse.move(cb.x + cb.width + 60, cb.y + cb.height / 2, { steps: 5 }); await page.mouse.up();
  const cw = (await th0.boundingBox()).width;
  ok(Math.abs(cw - (cb.width + 60)) < 4, 'dragging a column edge widens the column (' + Math.round(cb.width) + ' → ' + Math.round(cw) + ')');
  ok(Math.abs((await T(wr).locator('.wr-rich tr:nth-child(3) td').first().boundingBox()).width - cw) < 3, 'the cells below follow the column');
  const tr1 = T(wr).locator('.wr-rich tr').nth(1), rb0 = await tr1.boundingBox();
  await page.mouse.move(rb0.x + 20, rb0.y + rb0.height - 1);
  ok(await T(wr).locator('.wr-rich.wr-row-resize').count() === 1, 'the pointer turns into a row-resize arrow on a row edge');
  await page.mouse.down(); await page.mouse.move(rb0.x + 20, rb0.y + rb0.height + 40, { steps: 5 }); await page.mouse.up();
  ok((await tr1.boundingBox()).height > rb0.height + 30, 'dragging a row edge makes the row taller');
  await page.waitForFunction((id) => HB.store.entriesOf(id, 'doc').some((e) => /<th style="width: \d+px/.test(e.a) && /<tr style="height: \d+px/.test(e.a)), wr, { timeout: 6000 });
  await settle(); await page.reload(); await th0.waitFor();
  ok(Math.abs((await th0.boundingBox()).width - cw) < 3, 'the column width survives a reload');
  ok(await page.evaluate(() => HB.sanitizeHtml('<table><tr><td style="width:50px;position:fixed;height:url(x)">a</td></tr></table><div style="width:10px">d</div>').replace(/<\/?(table|tbody|tr)>/g, '') === '<td style="width: 50px">a</td><div>d</div>'),
    'the sanitizer keeps px/% width and height on table parts only');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.evaluate(() => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob(['<p><b>PLAINCHECK</b> text</p>'], { type: 'text/html' }), 'text/plain': new Blob(['PLAINCHECK text'], { type: 'text/plain' }) })]));
  await T(wr).locator('.wr-rich').click({ button: 'right', position: { x: 300, y: 12 } });
  ok((await page.locator('.menu-item .menu-label').allTextContents()).includes('Paste as plain text'), 'right-click in the editor offers Paste as plain text');
  await page.locator('.menu-item', { hasText: 'Paste as plain text' }).click();
  await page.waitForTimeout(300);
  let ph = await T(wr).locator('.wr-rich').innerHTML();
  ok(/PLAINCHECK text/.test(ph) && !/<b>PLAINCHECK/.test(ph), 'Paste as plain text drops the formatting');
  await T(wr).locator('.wr-rich').click({ button: 'right', position: { x: 300, y: 12 } });
  await page.locator('.menu-item', { has: page.locator('.menu-label', { hasText: /^Paste$/ }) }).click();
  await page.waitForTimeout(300);
  ph = await T(wr).locator('.wr-rich').innerHTML();
  ok(/<b[^>]*>PLAINCHECK<\/b>/.test(ph), 'the normal Paste keeps safe formatting' + (/<b[^>]*>PLAINCHECK/.test(ph) ? '' : ' [' + ph.slice(0, 300) + ']'));
  await T(wr).locator('.wr-rich').click({ button: 'right', position: { x: 300, y: 12 } });
  await page.locator('.menu-item', { hasText: 'Tile menu' }).hover();
  ok(await page.locator('.menu.sub .menu-item', { hasText: 'Rename' }).count() > 0, 'the tile menu is still reachable from the right-click menu');
  await page.keyboard.press('Escape');
  await T(wr).locator('.tile-head button[aria-label="Tile menu"]').click();
  await page.locator('.menu-item', { hasText: 'Change icon' }).click();
  await page.locator('.emoji-input').fill('🧪');
  await page.locator('.modal .btn.primary').first().click();
  await page.waitForFunction((id) => document.querySelector(`.tile[data-tile="${id}"] .tile-icon`).textContent === '🧪', wr, { timeout: 4000 });
  await settle(); await page.reload(); await page.waitForSelector(`.tile[data-tile="${wr}"] .tile-icon`);
  ok((await T(wr).locator('.tile-icon').textContent()) === '🧪', 'a Writer can have its own icon, kept after a reload');

  // ======================================================================================== writer folder
  section('Writer folder: pages, sub-folders, drag, filter, search');
  await scratch('Notebook');
  const lib = await addTile('library');
  await T(lib).locator('.lib').waitFor();
  await T(lib).locator('.lib-empty button', { hasText: 'New page' }).click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('lib-title'));
  await page.keyboard.type('Meeting notes'); await page.keyboard.press('Enter');
  await page.keyboard.type('# Agenda'); await page.keyboard.press('Enter'); await page.keyboard.type('buy more tea');
  await page.waitForTimeout(1000);
  const rows = () => page.evaluate((id) => HB.store.entriesOf(id, 'page').map((r) => ({ id: r.id, b: r.b, num: r.num, t: r.data.t, a: r.a })), lib);
  let r = await rows();
  ok(r.length === 1 && r[0].b === 'Meeting notes' && /<h1>Agenda<\/h1><p>buy more tea<\/p>/.test(r[0].a), 'a page has a title and rich text, saved as you type');
  await T(lib).locator('.lib-side-top .btn').click(); await page.locator('.menu-item', { hasText: 'New folder' }).click();
  await page.waitForSelector('.inline-edit'); await page.keyboard.type('Projects'); await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await T(lib).locator('.lib-item.folder > .lib-row').hover(); await T(lib).locator('.lib-item.folder > .lib-row .lib-more').click();
  await page.locator('.menu-item', { hasText: 'New code page here' }).click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('lib-title'));
  await page.keyboard.type('script'); await page.keyboard.press('Enter');
  await page.keyboard.type('const x = 1; // go');
  await page.waitForTimeout(1000);
  r = await rows();
  const proj = r.find((q) => q.t === 'folder'), code = r.find((q) => q.t === 'code');
  ok(proj && code && code.num === proj.id && code.a === 'const x = 1; // go', 'a folder holds pages (here a code page with colour highlighting)');
  ok((await T(lib).locator('.wr-hl .wr-k').allTextContents()).includes('const'), 'the code page is highlighted');
  ok(/Projects/.test(await T(lib).locator('.lib-crumbs').textContent()), 'the open page shows where it lives');
  // drag "Meeting notes" into the folder
  const first = T(lib).locator('.lib-list > .lib-item:not(.folder)', { hasText: 'Meeting notes' }).locator('.lib-row').first();
  const kids = T(lib).locator('.lib-kids').first();
  const b1 = await first.boundingBox(), b2 = await kids.boundingBox();
  await page.mouse.move(b1.x + 40, b1.y + b1.height / 2); await page.mouse.down(); await page.mouse.move(b1.x + 50, b1.y + 20, { steps: 4 });
  await page.mouse.move(b2.x + 40, b2.y + 10, { steps: 8 }); await page.mouse.move(b2.x + 41, b2.y + 12, { steps: 3 }); await page.mouse.up();
  await page.waitForTimeout(500);
  r = await rows();
  ok(r.find((q) => q.b === 'Meeting notes').num === proj.id, 'dragging a page onto a folder moves it in');
  // a folder cannot go into itself
  const inside = await page.evaluate(([id, lib]) => { const g = HB.gadgets.instance(HB.store.get('tiles', lib)); const t = g.tree(); return g.descendants(t, id).length; }, [proj.id, lib]);
  ok(inside === 2, 'folder knows its content (' + inside + ')');
  // filter
  await T(lib).locator('.lib-filter').fill('script');
  ok((await T(lib).locator('.lib-item:not([hidden])').count()) === 2, 'the filter shows matching pages and their folder');
  await T(lib).locator('.lib-filter').fill('');
  // rename title live in the sidebar
  await T(lib).locator('.lib-item:not(.folder)', { hasText: 'Meeting notes' }).locator('.lib-row').first().click();
  await T(lib).locator('.lib-title').fill('Meeting minutes');
  await page.waitForTimeout(100);
  ok((await T(lib).locator('.lib-item.active, .lib-row.active').first().textContent()).includes('Meeting minutes'), 'renaming a page updates the list at once');
  await page.waitForTimeout(900); await settle();
  // each page and folder can have its own icon
  await T(lib).locator('.lib-item:not(.folder)', { hasText: 'Meeting minutes' }).locator('.lib-row').first().click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Change icon' }).click();
  await page.locator('.emoji-input').fill('🍵');
  await page.locator('.modal .btn.primary').first().click();
  await page.waitForFunction((id) => [...document.querySelectorAll(`.tile[data-tile="${id}"] .lib-item:not(.folder) .lib-ico`)].some((e) => e.textContent === '🍵'), lib, { timeout: 4000 });
  await T(lib).locator('.lib-item.folder > .lib-row').click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Change icon' }).click();
  await page.locator('.emoji-input').fill('🚀');
  await page.locator('.modal .btn.primary').first().click();
  await page.waitForFunction((id) => document.querySelector(`.tile[data-tile="${id}"] .lib-item.folder > .lib-row .lib-ico`).textContent === '🚀', lib, { timeout: 4000 });
  await T(lib).locator('.lib-item.folder > .lib-row').click(); await T(lib).locator('.lib-item.folder > .lib-row').click(); // close and open again: a custom folder icon stays
  ok((await T(lib).locator('.lib-item.folder > .lib-row .lib-ico').textContent()) === '🚀', 'pages and folders can have their own icon (a folder keeps it when opened or closed)');
  await settle();
  // search
  const hits = await page.evaluate(async () => (await HB.api.search('tea')).results.filter((x) => x.kind === 'page'));
  ok(hits.length === 1 && /^Meeting minutes/.test(hits[0].label) && !/</.test(hits[0].label), 'Ctrl+K finds text inside pages and shows the page title');
  // reload keeps everything, including the open page
  await page.reload(); await T(lib).locator('.lib-title').waitFor();
  ok((await T(lib).locator('.lib-title').inputValue()) === 'Meeting minutes' && /buy more tea/.test(await T(lib).locator('.wr-rich').innerText()), 'everything survives a reload, and the same page is open again');
  // move a Writer into the folder, with its picture
  const w2 = await addTile('writer');
  await T(w2).locator('.wr-rich').click(); await page.keyboard.type('Loose thoughts');
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), (async () => { await T(w2).locator('.wr-b[title^="Image"]').click(); await page.locator('.wr-pop-item', { hasText: 'Upload' }).click(); })()]);
  await fc2.setFiles(PNG);
  await T(w2).locator('.wr-rich img').waitFor(); await page.waitForTimeout(1000); await settle();
  await T(w2).locator('.tile-head button[aria-label="Tile menu"]').click();
  await page.locator('.menu-item', { hasText: 'Move into a Writer folder' }).hover();
  await page.locator('.menu-item', { hasText: 'Writer folder' }).last().click();
  await page.locator('.modal .btn.primary', { hasText: 'Move' }).click();
  await page.waitForTimeout(800); await settle();
  r = await rows();
  const moved = r.find((q) => /Loose thoughts/.test(q.a));
  ok(!!moved && /<img src="file\.php\?id=\d+"/.test(moved.a) && !(await page.evaluate((id) => !!HB.store.get('tiles', id) && !HB.store.get('tiles', id).deleted_at, w2)), 'a Writer can be moved into a folder as a page; its tile is removed');
  const imgId = Number(moved.a.match(/id=(\d+)/)[1]);
  ok(await page.evaluate(([id, lib]) => HB.store.get('files', id).tile_id === lib, [imgId, lib]), 'its pictures move with it, so they survive the tile being purged from the trash');
  // delete a folder with its content: confirm, trash
  await T(lib).locator('.lib-item.folder > .lib-row').click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Delete folder' }).click();
  await page.locator('.modal .btn.danger').click();
  await page.waitForTimeout(500);
  ok((await rows()).length === 1, 'deleting a folder takes its pages along (all go to the trash); the page outside it stays');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(500);
  ok((await rows()).length === 4, 'Ctrl+Z brings the whole folder back');

  // ======================================================================================== read-only share
  section('Writer folder on a share page');
  const sid = await page.evaluate(() => HB.app.scenarioId);
  await page.evaluate(async (sid) => { await HB.api.call('shares/save', { method: 'POST', body: { scenario_id: sid, slug: 'notebook', password: 'a-long-pass-1', include_files: false } }); }, sid);
  const vctx = await browser.newContext({ viewport: { width: 1300, height: 850 } });
  const v = await vctx.newPage();
  await v.goto(BASE + '/share.php?s=notebook'); await v.fill('#pass', 'a-long-pass-1'); await v.click('button[type=submit]');
  await v.waitForSelector('.lib');
  await v.waitForSelector('.lib-title');
  ok((await v.locator('.lib-item').count()) >= 3 && (await v.locator('.lib-more, .lib-side-top .btn').count()) === 0, 'visitors see the page list without edit buttons');
  await v.locator('.lib-item:not(.folder)', { hasText: 'Loose thoughts' }).locator('.lib-row').first().click();
  await v.waitForSelector('.wr-rich');
  ok((await v.locator('.wr-rich').getAttribute('contenteditable')) === 'false' && (await v.locator('.wr-tools').count()) === 0, 'the page is read-only (no toolbar)');
  const picOk = await v.evaluate(async (id) => (await fetch('file.php?id=' + id)).status, imgId);
  ok(picOk === 200, 'pictures in a shared Writer folder are served even when "files allowed" is off');
  ok(await v.locator('.wr-rich img').count() === 1 && /Loose thoughts/.test(await v.locator('.wr-rich').innerText()), 'a visitor can open other pages, with their pictures');
  await vctx.close();

  // ======================================================================================== scenario groups
  section('scenario groups: minimise and maximise a set of tabs');
  const before = await page.evaluate(() => HB.store.scenarios().map((s) => s.name));
  await page.locator('.tab', { hasText: 'Docs' }).click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Group' }).hover();
  await page.locator('.menu-item', { hasText: 'New group' }).click();
  await page.fill('.modal input', 'Writing'); await page.locator('.modal button', { hasText: 'Create' }).click();
  await page.locator('.tab', { hasText: 'Notebook' }).click({ button: 'right' });
  await page.locator('.menu-item', { hasText: /^Group/ }).hover();
  await page.locator('.menu-item', { hasText: 'Writing' }).click();
  ok(/^▾ \| Writing \| Docs \| Notebook/.test(await tabs()) || /Writing \| Docs \| Notebook/.test(await tabs()), 'a group shows its name and its tabs (' + (await tabs()) + ')');
  ok(await page.locator('.tab-group .tab').count() === 2, 'two scenarios are inside the group');
  await page.locator('.tab-gchip').click();
  ok(await page.locator('.tab-group.collapsed').count() === 1 && (await page.locator('.tab-gcount').textContent()) === '2', 'clicking the group name minimises it and shows how many tabs it holds');
  ok(await page.locator('.tab-group .tab:visible').count() === 1 && /Notebook/.test(await page.locator('.tab-group .tab:visible').textContent()), 'the scenario you are on stays visible');
  await page.locator('.tab', { hasText: 'Work' }).click();
  ok(await page.locator('.tab-group .tab:visible').count() === 0, 'once you leave, a minimised group is just its name');
  await page.keyboard.press('5'); await page.waitForTimeout(300);
  ok((await page.evaluate(() => HB.store.get('scenarios', HB.app.scenarioId).name)) === 'Notebook', 'keys 1-9 follow the order of the tabs, also inside a minimised group');
  await page.locator('.tab', { hasText: 'Work' }).click();
  await page.locator('.tab-gchip').click();
  ok(await page.locator('.tab-group .tab:visible').count() === 2, 'clicking again maximises it');
  // drag a tab into the group
  const src = await page.locator('.tab', { hasText: 'Work' }).boundingBox(); const dst = await page.locator('.tab', { hasText: 'Docs' }).boundingBox();
  await page.mouse.move(src.x + 10, src.y + 10); await page.mouse.down(); await page.mouse.move(src.x + 25, src.y + 10, { steps: 3 });
  await page.mouse.move(dst.x + dst.width - 10, dst.y + 10, { steps: 10 }); await page.mouse.move(dst.x + dst.width - 8, dst.y + 10, { steps: 3 }); await page.mouse.up();
  await page.waitForTimeout(500);
  ok(await page.locator('.tab-group .tab').count() === 3, 'dragging a tab into a group makes it a member');
  await settle();
  await page.reload(); await page.waitForSelector('.tab-group');
  ok(await page.locator('.tab-group .tab').count() === 3 && /Writing/.test(await tabs()), 'groups are remembered (they are stored with your settings, so every device sees them)');
  await page.locator('.tab-gchip').click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Ungroup' }).click();
  ok(await page.locator('.tab-group').count() === 0 && (await page.evaluate(() => HB.store.scenarios().length)) === before.length, 'ungrouping keeps every scenario');

  ok(errors.length === 0, 'no browser errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
