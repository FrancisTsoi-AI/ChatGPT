/* Browser test for the extra tiles (flashcards, quotes, notes, reading list, habits, time log, timer, stats,
 * embed, search box, feeds, weather, sketch), the emoji picker and the enlarge button.
 *
 * It starts a tiny fake web server on :9099 (RSS/Atom feeds, a page title, weather) and needs a SECOND dev
 * server that is allowed to fetch from it (see tests/README.md):
 *   HB_ALLOW_PRIVATE_FETCH=1 HB_OPENMETEO_FORECAST=http://127.0.0.1:9099/forecast \
 *   HB_OPENMETEO_GEOCODE=http://127.0.0.1:9099/geocode php -S 127.0.0.1:8082 -t public
 *   BASE=http://127.0.0.1:8082 STORAGE=private/storage node tests/gadgets.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8082';
const PASS = process.env.PASS || 'test-passphrase-123';
const STORAGE = process.env.STORAGE || path.join(__dirname, '..', 'private', 'storage');
let failures = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failures++; };
const section = (t) => console.log('\n# ' + t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- fake outside world ---------------------------------------------------------------------
const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Fake News</title>
<item><title>Alpha story</title><link>http://127.0.0.1:9099/a</link><pubDate>Tue, 06 Oct 2026 10:00:00 GMT</pubDate><description>First &lt;b&gt;summary&lt;/b&gt; text</description></item>
<item><title><![CDATA[<script>window.__xss=1</script> Evil title]]></title><link>javascript:window.__xss=2</link><pubDate>Tue, 06 Oct 2026 09:00:00 GMT</pubDate><description>x</description></item>
<item><title>Gamma story</title><link>http://127.0.0.1:9099/g</link><pubDate>Mon, 05 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Fake Atom</title>
<entry><title>Atom one</title><link rel="alternate" href="http://127.0.0.1:9099/atom1"/><id>a1</id><updated>2026-10-06T11:00:00Z</updated><summary>Atom summary</summary></entry>
<entry><title>Atom two</title><link href="http://127.0.0.1:9099/atom2"/><id>a2</id><updated>2026-10-04T11:00:00Z</updated></entry></feed>`;
const fake = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (body, type = 'text/plain') => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };
  if (u.pathname === '/feed.xml') return send(RSS, 'application/rss+xml');
  if (u.pathname === '/atom.xml') return send(ATOM, 'application/atom+xml');
  if (u.pathname === '/evil.xml') return send('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><rss><channel><title>&a;</title></channel></rss>', 'application/xml');
  if (u.pathname === '/bad.txt') return send('hello');
  if (u.pathname === '/page.html') return send('<html><head><title>Fake Page Title</title></head><body>hi</body></html>', 'text/html');
  if (u.pathname === '/geocode') return send(JSON.stringify({ results: [{ name: 'Singapore', admin1: '', country: 'Singapore', latitude: 1.2897, longitude: 103.8501 }] }), 'application/json');
  if (u.pathname === '/forecast') {
    const f = u.searchParams.get('temperature_unit') === 'fahrenheit';
    const t = (c) => (f ? Math.round((c * 9 / 5 + 32) * 10) / 10 : c);
    return send(JSON.stringify({
      current: { temperature_2m: t(28.4), apparent_temperature: t(31), relative_humidity_2m: 80, weather_code: 2, wind_speed_10m: 12, is_day: 1 },
      daily: { time: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'], weather_code: [2, 61, 0, 3, 95, 1], temperature_2m_max: [30, 29, 31, 28, 27, 30].map(t), temperature_2m_min: [25, 24, 26, 24, 23, 25].map(t), precipitation_probability_max: [10, 70, 0, 20, 90, 5] },
    }), 'application/json');
  }
  res.writeHead(404); res.end('nope');
});

async function drag(page, from, to, opt = {}) {
  const a = await from.boundingBox(), b = await to.boundingBox();
  const sx = a.x + (opt.fx ?? a.width / 2), sy = a.y + (opt.fy ?? a.height / 2);
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 6, sy + 6, { steps: 3 });
  await page.mouse.move(b.x + (opt.tx ?? b.width / 2), b.y + (opt.ty ?? b.height / 2), { steps: 12 });
  await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(300);
}

(async () => {
  await new Promise((r) => fake.listen(9099, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  // Singapore time (UTC+8) on purpose: local-vs-UTC mistakes show up here but not in a UTC browser
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true, timezoneId: 'Asia/Singapore', locale: 'en-GB' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/401|403|429|status of (400|422|502)/.test(m.text())) errors.push('console: ' + m.text()); });

  const settle = () => page.waitForFunction(() => HB.store.status === 'saved' && !HB.store.ops.length, null, { timeout: 8000 });
  const T = (id) => page.locator(`.tile[data-tile="${id}"]`);
  const addTile = (type) => page.evaluate(async (t) => (await HB.board.addTile(t)).id, type);
  const field = (label) => page.locator(`.modal .field:has(> span:text-is("${label}"))`).locator('input,textarea,select').first();
  const menu = async (id, item) => { await T(id).locator('.tile-head button[aria-label="Tile menu"]').click(); await page.locator('.menu-item', { hasText: item }).first().click(); };
  const entries = (tileId, kind) => page.evaluate(([t, k]) => HB.store.entriesOf(t, k), [tileId, kind]);

  section('sign in, make a scratch scenario');
  await page.goto(BASE + '/');
  await page.fill('#pass', PASS); await page.click('button[type=submit]');
  await page.waitForSelector('.tile');
  await page.evaluate(async () => { const r = await HB.store.create('scenarios', { name: 'Lab' }); HB.app.showScenario(r.id); });
  await page.waitForTimeout(300);

  // ===================================================================================== emoji + toolbox
  section('toolbox: emoji icons without searching');
  const tb = await addTile('toolbox');
  await T(tb).locator('input[data-key="link-add"]').fill('Gmail | mail.google.com');
  await T(tb).locator('input[data-key="link-add"]').press('Enter');
  await T(tb).locator('.link-card').first().waitFor();
  ok((await T(tb).locator('.link-icon').first().textContent()) === '📧', 'quick-add picks an emoji for "Gmail" automatically (📧)');
  await menu(tb, 'Add link…');
  await field('Name').fill('Uni library');
  ok((await page.locator('.modal .emoji-input').inputValue()) === '📚', 'the add-link dialog suggests 📚 while you type "Uni library"');
  await field('URL').fill('library.example.edu');
  await page.locator('.modal .emoji-field .btn', { hasText: 'Choose' }).click();
  await page.fill('.emoji-search', 'music');
  await page.waitForSelector('.emoji-btn');
  const firstMusic = await page.locator('.emoji-btn').first().textContent();
  await page.locator('.emoji-btn').first().click();
  ok((await page.locator('.modal .emoji-input').inputValue()) === firstMusic && firstMusic.length > 0, 'searching "music" in the picker and clicking inserts that emoji (' + firstMusic + ')');
  await page.locator('.modal .btn.primary').click();
  await page.waitForFunction((e) => [...document.querySelectorAll('.link-icon')].some((x) => x.textContent === e), firstMusic);
  ok(true, 'the chosen emoji is saved on the card');
  await T(tb).locator('.link-card').first().click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Choose icon' }).click();
  await page.fill('.emoji-search', 'rocket');
  await page.locator('.emoji-btn').first().click();
  await page.waitForFunction(() => [...document.querySelectorAll('.link-icon')].some((x) => x.textContent === '🚀'));
  ok(true, 'right-click → Choose icon… changes it directly');

  // ===================================================================================== enlarge / shrink
  section('enlarge and shrink tiles');
  const note = await addTile('note');
  await page.waitForTimeout(700);
  const r0 = await T(note).boundingBox();
  await T(note).locator('.max-btn').click();
  await page.waitForTimeout(250);
  const r1 = await T(note).boundingBox();
  ok(r1.width > 1400 * 0.85 && r1.height > 900 * 0.85, `⤢ enlarges the tile to fill the screen (${Math.round(r0.width)}×${Math.round(r0.height)} → ${Math.round(r1.width)}×${Math.round(r1.height)})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const r2 = await T(note).boundingBox();
  ok(Math.abs(r2.width - r0.width) < 3 && Math.abs(r2.x - r0.x) < 3, 'Esc restores it to its old size and place');
  await T(note).locator('.max-btn').click(); await page.waitForTimeout(150);
  await T(note).locator('.max-btn').click(); await page.waitForTimeout(250);
  ok(Math.abs((await T(note).boundingBox()).width - r0.width) < 3, 'the same button restores it');
  const w0 = await page.evaluate((i) => HB.store.get('tiles', i).width, note);
  await menu(note, 'Bigger'); await settle();
  const w1 = await page.evaluate((i) => HB.store.get('tiles', i).width, note);
  await menu(note, 'Smaller'); await menu(note, 'Smaller'); await settle();
  const w2 = await page.evaluate((i) => HB.store.get('tiles', i).width, note);
  ok(w1 === w0 + 1 && w2 === w0 - 1, `Bigger / Smaller step the width (${w0} → ${w1} → ${w2})`);

  // ===================================================================================== markdown note
  section('markdown note (and it cannot inject script)');
  await T(note).locator('button:has-text("Edit")').click();
  await T(note).locator('.note-edit').fill('# Title\n\nSome **bold** and *italic* text with `code`.\n\n- [ ] first task\n- [x] done task\n\n<script>window.__xss=1</script>\n[bad](javascript:window.__xss=2) and [good](https://example.com/x)\n\nhttps://example.org/auto');
  await T(note).locator('button:has-text("Done")').click();
  await T(note).locator('.md strong').waitFor();
  const md = await T(note).evaluate((el) => ({
    scripts: el.querySelectorAll('script').length, jsLinks: [...el.querySelectorAll('a')].filter((a) => /^javascript:/i.test(a.getAttribute('href') || '')).length,
    links: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href') + '|' + a.rel), h: el.querySelector('h2') && el.querySelector('h2').textContent,
    em: !!el.querySelector('em'), code: !!el.querySelector('code'), boxes: el.querySelectorAll('input[type=checkbox]').length, text: el.textContent, xss: window.__xss,
  }));
  ok(md.h === 'Title' && md.em && md.code && md.boxes === 2, 'headings, italic, code and task boxes render');
  ok(md.scripts === 0 && md.xss === undefined && md.jsLinks === 0, 'a <script> tag and a javascript: link in the text do nothing');
  ok(md.text.includes('<script>window.__xss=1</script>'), 'the script text is shown as plain text');
  ok(md.links.some((l) => l.startsWith('https://example.com/x') && /noopener/.test(l)) && md.links.some((l) => l.startsWith('https://example.org/auto')), 'real links and bare URLs become safe links');
  await T(note).locator('input[type=checkbox]').first().check();
  await settle();
  const noteRows = await entries(note, 'note');
  ok(noteRows.length === 1 && /- \[x\] first task/.test(noteRows[0].a), 'ticking a task box edits the note text and saves it');
  await page.reload(); await page.waitForSelector('.tile');
  ok(/first task/.test(await T(note).textContent()) && (await T(note).locator('input:checked').count()) === 2, 'the note survives a reload');

  // ===================================================================================== quotes
  section('quotes with a separate source');
  const qt = await addTile('quotes');
  await T(qt).locator('button:has-text("+ Quote")').click();
  await field('Quote').fill('The medium is the message.');
  await field('Author').fill('Marshall McLuhan');
  await field('Source (book, article, talk…)').fill('Understanding Media');
  await field('Year').fill('1964');
  await field('Page / location').fill('7');
  await field('Tags').fill('media, theory');
  await page.locator('.modal .btn.primary').click();
  await T(qt).locator('.quote').waitFor();
  ok(await T(qt).locator('.quote-src').textContent() === '— Marshall McLuhan, Understanding Media, (1964), p. 7' || /Marshall McLuhan, Understanding Media/.test(await T(qt).locator('.quote-src').textContent()), 'the source is shown on its own line under the quote');
  const q = (await entries(qt, 'quote'))[0];
  ok(q.a === 'The medium is the message.' && q.b === 'Understanding Media' && q.data.author === 'Marshall McLuhan' && q.data.page === '7', 'quote text, source (b) and author/page are stored separately');
  await T(qt).locator('.quote').hover();
  await T(qt).locator('.quote-btns button:has-text("Copy")').click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip.startsWith('“The medium is the message.” — Marshall McLuhan, Understanding Media') && /p\. 7/.test(clip), 'Copy puts quote + source on the clipboard: ' + clip);
  await T(qt).locator('.quote').click({ button: 'right' });
  await page.locator('.menu-item', { hasText: 'Edit…' }).click();
  await field('Source (book, article, talk…)').fill('Understanding Media (2nd ed.)');
  await page.locator('.modal .btn.primary').click();
  await page.waitForFunction(() => /2nd ed/.test(document.querySelector('.quote-src').textContent));
  ok(true, 'editing the source updates the line');
  await T(qt).locator('.quote').hover();
  await T(qt).locator('.quote .x').click();
  await page.waitForFunction((i) => !document.querySelector(`.tile[data-tile="${i}"] .quote`), qt);
  await page.keyboard.press('Control+z');
  await T(qt).locator('.quote').waitFor();
  ok(true, 'delete + Ctrl+Z brings the quote back');

  // ===================================================================================== flashcards
  section('flashcards: scheduling and study mode');
  const sched = await page.evaluate(() => {
    let c = { data: {} }; const out = [];
    for (let i = 0; i < 3; i++) { const n = HB.srs.next(c, 3); out.push(n.data.ivl); c = { data: n.data, due_at: n.due_at }; }
    const again = HB.srs.next({ data: { ivl: 8, ease: 2.5, reps: 3 } }, 1);
    const easy = HB.srs.next({ data: {} }, 4);
    return { out, againIvl: again.data.ivl, againReps: again.data.reps, againDue: Date.parse(again.due_at) - Date.now(), easyIvl: easy.data.ivl, ease: again.data.ease };
  });
  ok(JSON.stringify(sched.out) === '[1,3,8]', 'Good ×3 gives intervals 1 → 3 → 8 days (got ' + sched.out + ')');
  ok(sched.againReps === 0 && sched.againIvl === 0 && sched.againDue > 8 * 60000 && sched.againDue < 11 * 60000 && sched.ease === 2.3, 'Again resets the card, due in ~10 minutes, ease drops to 2.3');
  ok(sched.easyIvl === 4, 'Easy on a new card gives 4 days');
  const fc = await addTile('flashcards');
  await menu(fc, 'Import cards…');
  await field('One card per line:  front | back').fill('Capital of France? | **Paris**\nWhat is 2+2?\t4\nbad line without separator\nLargest planet? | Jupiter');
  await page.locator('.modal .btn.primary').click();
  await page.waitForFunction((i) => document.querySelector(`.tile[data-tile="${i}"] .fc-study`).textContent.includes('Study 3'), fc);
  ok(true, 'importing 3 good lines (1 bad line skipped) makes 3 new cards');
  await page.evaluate((i) => HB.setTileSettings(i, { newPerDay: 2 }), fc);
  await page.waitForFunction((i) => document.querySelector(`.tile[data-tile="${i}"] .fc-study`).textContent.includes('Study 2'), fc);
  ok(true, 'the "new cards per day" limit caps today\'s session (Study 2)');
  await T(fc).locator('.fc-study').click();
  await page.waitForSelector('.study');
  ok(/Card 1 of 2/.test(await page.textContent('.study-head')), 'study mode opens as a focused full-window view');
  await page.keyboard.press('1'); // digits must not switch scenario or grade before the answer is shown
  ok(/Card 1 of 2/.test(await page.textContent('.study-head')) && (await page.locator('.grade').count()) === 0, 'grading keys do nothing until the answer is shown');
  await page.keyboard.press('Space');
  await page.waitForSelector('.grade');
  ok(!/null|undefined/.test(await page.textContent('.study')), 'the study view shows no stray "null" text');
  const labels = await page.$$eval('.grade small', (e) => e.map((x) => x.textContent));
  ok(labels.length === 4 && labels[0] === '10m' && labels[2] === '1d', 'the four grade buttons preview their next interval (' + labels.join(' / ') + ')');
  await page.keyboard.press('3');      // card 1: Good
  await page.keyboard.press('Space'); await page.keyboard.press('1'); // card 2: Again → comes back
  ok(/Card 3 of 3/.test(await page.textContent('.study-head')), 'an "Again" card is put back at the end of the session');
  await page.keyboard.press('Space'); await page.keyboard.press('4');
  await page.waitForSelector('.study-done');
  ok(/3 reviews/.test(await page.textContent('.study-done')), 'the session ends with a summary');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.study', { state: 'detached' });
  await settle();
  const cards = await entries(fc, 'card');
  const sorted = cards.slice().sort((a, b) => a.id - b.id);
  const dueIn = (c) => (Date.parse(c.due_at) - Date.now()) / 86400000;
  ok(dueIn(sorted[0]) > 0.9 && dueIn(sorted[0]) < 1.1, 'card graded Good is due in about 1 day');
  ok(dueIn(sorted[1]) > 0 && dueIn(sorted[1]) < 0.02 || sorted[1].data.reps >= 1, 'the Again card was rescheduled (and then passed in the same session)');
  ok(cards.filter((c) => !c.due_at).length === 1, 'the third new card was not introduced (daily limit)');
  const server = await page.evaluate(async (t) => (await HB.api.state()).entries.filter((e) => e.kind === 'card' && e.tile_id === t).map((e) => e.due_at), fc);
  ok(server.filter(Boolean).length === 2, 'review results are saved on the server');

  await page.reload(); await page.waitForSelector('.tile');
  const afterReload = await entries(fc, 'card');
  const g1 = afterReload.slice().sort((a, b) => a.id - b.id)[0];
  ok(Math.abs(dueIn(g1) - 1) < 0.1 && /Z$/.test(g1.due_at), 'due times keep their meaning after a reload in UTC+8 (stored as UTC, sent with Z)');

  // ===================================================================================== reading list
  section('reading list');
  const rd = await addTile('reading');
  const add = async (t) => { await T(rd).locator('input[data-key="read-add"]').fill(t); await T(rd).locator('input[data-key="read-add"]').press('Enter'); };
  await add('Paper A | https://example.com/a');
  await T(rd).locator('.read').first().waitFor();
  await add('http://127.0.0.1:9099/page.html');
  await page.waitForFunction((i) => [...document.querySelectorAll(`.tile[data-tile="${i}"] .read-title`)].some((x) => x.textContent === 'Fake Page Title'), rd, { timeout: 8000 });
  ok(true, 'pasting a bare link fetches the page title for you');
  await add('Just a note to read later');
  await page.waitForFunction((i) => document.querySelectorAll(`.tile[data-tile="${i}"] .read`).length === 3, rd);
  ok((await T(rd).locator('.read-title').first().textContent()) === 'Just a note to read later', 'new items go to the top');
  ok(await T(rd).locator('.read', { hasText: 'Just a note' }).locator('.read-title').evaluate((e) => getComputedStyle(e).textDecorationLine === 'none'), 'unread titles are not struck through (only finished ones)');
  await T(rd).locator('.read', { hasText: 'Paper A' }).locator('.read-state').click();
  await settle();
  ok((await T(rd).locator('.read', { hasText: 'Paper A' }).getAttribute('class')).includes('reading'), 'the circle cycles unread → reading');
  await T(rd).locator('.read', { hasText: 'Paper A' }).locator('.read-state').click();
  await settle();
  await page.waitForFunction((i) => /Read 1/.test(document.querySelector(`.tile[data-tile="${i}"] .seg`).textContent), rd);
  await T(rd).locator('.seg-btn', { hasText: /^Read \d/ }).click();
  await page.waitForFunction((i) => document.querySelectorAll(`.tile[data-tile="${i}"] .read`).length === 1, rd);
  const dbg = { n: await T(rd).locator('.read').count(), seg: await T(rd).locator('.seg').textContent(), st: await page.evaluate((i) => HB.store.entriesOf(i, 'reading').map((r) => r.data.status), rd) };
  ok(dbg.n === 1 && /Read 1/.test(dbg.seg), 'the Read filter shows only finished items, with counts ' + JSON.stringify(dbg));
  await T(rd).locator('.seg-btn', { hasText: /^All/ }).click();

  // ===================================================================================== habits
  section('habit tracker');
  const hb = await addTile('habits');
  await T(hb).locator('button:has-text("+ Habit")').click();
  await field('Habit').fill('Read 20 pages');
  await page.locator('.modal .btn.primary').click();
  await T(hb).locator('.hcell').first().waitFor();
  const todayKey = await page.evaluate(() => HB.localDay());
  const yKey = await page.evaluate(() => HB.localDay(HB.addDays(new Date(), -1)));
  const cell = (k) => T(hb).locator(`.hcell[data-day="${k}"]`);
  await cell(todayKey).click();
  await page.waitForFunction(([i, k]) => document.querySelector(`.tile[data-tile="${i}"] .hcell[data-day="${k}"]`).classList.contains('on'), [hb, todayKey]);
  ok((await T(hb).locator('.hstreak').textContent()) === '1', 'ticking today starts a 1-day streak');
  await cell(yKey).click();
  await page.waitForFunction((i) => document.querySelector(`.tile[data-tile="${i}"] .hstreak`).textContent === '2', hb);
  ok(true, 'ticking yesterday too makes it 2 days');
  await cell(todayKey).click(); await settle();
  ok(!(await cell(todayKey).getAttribute('class')).includes('on') && (await T(hb).locator('.hstreak').textContent()) === '1', 'ticking again clears the day (streak counts from yesterday)');
  await cell(todayKey).click(); await settle();
  const habitRows = await entries(hb, 'habit');
  ok(habitRows.length === 2 && habitRows.every((r) => r.day), 'toggling reuses the same row instead of piling up duplicates');
  await page.reload(); await page.waitForSelector('.tile');
  ok((await T(hb).locator('.hcell.on').count()) === 2, 'ticks survive a reload');

  // ===================================================================================== time log
  section('time log');
  const tl = await addTile('timelog');
  await T(tl).locator('.tl-label').fill('Thesis chapter 2');
  await T(tl).locator('.tl-top .btn').click();
  await page.waitForFunction((i) => /^0:00:0[1-9]/.test(document.querySelector(`.tile[data-tile="${i}"] .tl-clock`).textContent), tl, { timeout: 5000 });
  ok(true, 'Start runs a live clock');
  await page.reload(); await page.waitForSelector('.tile');
  ok(/^0:00:/.test(await T(tl).locator('.tl-clock').textContent()) && (await T(tl).locator('.tl-top .btn').textContent()).includes('Stop'), 'a running timer survives a reload');
  await sleep(1200);
  await T(tl).locator('.tl-top .btn').click();
  await page.waitForFunction((i) => document.querySelector(`.tile[data-tile="${i}"] .tl-row`), tl);
  const t1 = (await entries(tl, 'time'))[0];
  ok(t1.a === 'Thesis chapter 2' && t1.num >= 2 && t1.day === todayKey, 'Stop saves an entry with the label, seconds and day');
  await T(tl).locator('button:has-text("+ Add time")').click();
  await field('What for').fill('Thesis chapter 2'); await field('Minutes').fill('45');
  await page.locator('.modal .btn.primary').click();
  await page.waitForFunction((i) => /45m/.test(document.querySelector(`.tile[data-tile="${i}"] .tl-today`).textContent), tl);
  ok(/45m/.test(await T(tl).locator('.tl-bars').textContent()), 'manual time shows in today\'s total and the weekly bars');

  // ===================================================================================== timer
  section('timer: count down and count up');
  const tm = await addTile('timer');
  await T(tm).locator('.timer-time').waitFor();
  await page.evaluate((i) => HB.setTileSettings(i, { dur: 3 }), tm);
  await page.waitForFunction((i) => document.querySelector(`.tile[data-tile="${i}"] .timer-time`).textContent === '00:03', tm);
  await T(tm).locator('.timer-btns .primary').click();
  await page.waitForFunction((i) => document.querySelector(`.tile[data-tile="${i}"] .timer-label`).textContent === 'Counting down', tm);
  await page.waitForFunction((i) => document.querySelector(`.tile[data-tile="${i}"] .timer-time.over`), tm, { timeout: 8000 });
  ok(/Time is up/.test(await T(tm).locator('.timer-label').textContent()), 'a countdown reaches zero and says time is up');
  await settle();
  ok((await page.evaluate(() => HB.store.data.tiles.find((t) => t.type === 'timer').settings.done)) === true, 'the finished state is saved (no repeat alarm after a reload)');
  await T(tm).locator('.seg-btn', { hasText: 'Count up' }).click();
  await T(tm).locator('.timer-btns .primary').click();
  await sleep(2300);
  await T(tm).locator('.timer-btns .primary').click(); // pause
  const frozen = await T(tm).locator('.timer-time').textContent();
  await sleep(1200);
  ok(/^00:0[2-4]$/.test(frozen) && frozen === (await T(tm).locator('.timer-time').textContent()), 'count up counts, and Pause freezes it (' + frozen + ')');
  await T(tm).locator('.timer-btns .btn:not(.primary)').click();
  await page.waitForFunction((i) => document.querySelector(`.tile[data-tile="${i}"] .timer-time`).textContent === '00:00', tm);
  ok(true, 'Reset returns to zero');

  // ===================================================================================== stats
  section('stats and progress');
  const st = await addTile('stats');
  await T(st).locator('button:has-text("+ Counter")').click();
  await field('Name').fill('Words written'); await field('Current value').fill('1000'); await field('Target (optional)').fill('4000'); await field('Unit (optional)').fill('words'); await field('Step for + / −').fill('500');
  await page.locator('.modal .btn.primary').click();
  await T(st).locator('.stat').waitFor();
  ok((await T(st).locator('.bar > i').getAttribute('style')).includes('25%'), 'a counter shows its progress bar (1000 / 4000 = 25%)');
  await T(st).locator('.stat-btns .btn', { hasText: '+' }).click();
  await page.waitForFunction((i) => document.querySelector(`.tile[data-tile="${i}"] .stat-val b`).textContent === '1,500', st);
  ok((await T(st).locator('.bar > i').getAttribute('style')).includes('37.5%'), '+ adds the step (1,500 → 37.5%)');

  // ===================================================================================== embed
  section('embed a website, video or playlist');
  const parsed = await page.evaluate(() => ({
    list: HB.embedParse('https://www.youtube.com/playlist?list=PLabc123XYZ_-'), watch: HB.embedParse('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123XYZ_-'),
    short: HB.embedParse('https://youtu.be/dQw4w9WgXcQ'), music: HB.embedParse('https://music.youtube.com/playlist?list=PLmusicList12345'),
    spotify: HB.embedParse('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=x'), http: HB.embedParse('http://example.com'), js: HB.embedParse('javascript:alert(1)'),
    snippet: HB.embedParse('<iframe width="560" src="https://example.com/embed/1" frameborder="0"></iframe>'), bare: HB.embedParse('example.com/page'), ytbad: HB.embedParse('https://www.youtube.com/'),
  }));
  ok(parsed.list.src === 'https://www.youtube-nocookie.com/embed/videoseries?list=PLabc123XYZ_-', 'a YouTube playlist link becomes the privacy-enhanced playlist embed');
  ok(parsed.watch.src === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?list=PLabc123XYZ_-' && parsed.short.src === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'watch links and youtu.be links are converted');
  ok(parsed.music.src.includes('videoseries?list=PLmusicList12345'), 'a YouTube Music playlist link works too');
  ok(parsed.spotify.src === 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M', 'Spotify links are converted');
  ok(parsed.http.error && parsed.js.error && parsed.ytbad.error, 'http:, javascript: and empty YouTube addresses are refused');
  ok(parsed.snippet.src === 'https://example.com/embed/1' && parsed.bare.src === 'https://example.com/page', 'a pasted <iframe> snippet or bare domain is understood');
  const em = await addTile('embed');
  await T(em).locator('input[data-key="embed-url"]').fill('https://www.youtube.com/playlist?list=PLabc123XYZ_-');
  await T(em).locator('input[data-key="embed-url"]').press('Enter');
  await T(em).locator('iframe').waitFor();
  const fr = await T(em).locator('iframe').evaluate((f) => ({ src: f.src, sandbox: f.getAttribute('sandbox'), ref: f.getAttribute('referrerpolicy') }));
  ok(fr.src.startsWith('https://www.youtube-nocookie.com/embed/videoseries') && /allow-scripts/.test(fr.sandbox) && fr.ref === 'strict-origin-when-cross-origin',
    'the tile shows a sandboxed iframe that tells YouTube only the site origin (without it YouTube shows "Error 153")');
  ok(/ads/i.test(await T(em).locator('.embed-foot').textContent()), 'the tile is upfront that YouTube controls ads');
  const csp = await page.evaluate(async () => (await fetch('/')).headers.get('content-security-policy'));
  ok(/frame-src 'self' https:/.test(csp), 'the page policy allows https frames (and nothing else)');

  // ===================================================================================== search box
  section('search box + libraries');
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
  const sb = await addTile('search');
  await T(sb).locator('.search-q').fill('deep learning');
  await T(sb).locator('.search-q').press('Enter');
  ok((await page.evaluate(() => window.__opened[0])) === 'https://scholar.google.com/scholar?q=deep%20learning', 'Enter searches Google Scholar with the words encoded');
  const names = await T(sb).locator('.engine').allTextContents();
  ok(['HKMU', 'Lancaster', 'HKU'].every((n) => names.some((x) => x.includes(n))), 'HKMU, Lancaster and HKU libraries are in the list (' + names.length + ' sites)');
  await T(sb).locator('.engine', { hasText: 'HKMU' }).click();
  await T(sb).locator('button[type=submit]').click();
  await page.waitForSelector('.modal');
  ok(/Set up/.test(await page.textContent('.modal-head')), 'a library without a known pattern asks for one-time setup');
  await field('2 · Address of the results page').fill('https://hkmu.example.edu/discovery/search?query=any,contains,nonsense&vid=VID&tab=all');
  await page.locator('.modal .btn.primary').click();
  await page.waitForSelector('.toast.error');
  ok(/could not find/i.test(await page.textContent('.toast.error')), 'a wrong sample word is explained, not silently accepted');
  await field('1 · Word you searched for').fill('nonsense');
  await page.locator('.modal .btn.primary').click();
  await page.waitForSelector('.modal', { state: 'detached' });
  await settle();
  const eng = await page.evaluate((i) => HB.store.get('tiles', i).settings.engines.find((e) => e.id === 'hkmu').url, sb);
  ok(eng === 'https://hkmu.example.edu/discovery/search?query=any,contains,{q}&vid=VID&tab=all', 'the results address is turned into a reusable pattern with {q}');
  await T(sb).locator('.search-q').fill('machine learning');
  await T(sb).locator('.search-q').press('Enter');
  ok((await page.evaluate(() => window.__opened[1])) === 'https://hkmu.example.edu/discovery/search?query=any,contains,machine%20learning&vid=VID&tab=all', 'the learned library search now works directly');
  ok(await page.evaluate(() => HB.searchLearn('https://x/s?q=a+b&z=1', 'a b')) === 'https://x/s?q={q}&z=1', 'the pattern learner also handles + encoded spaces');
  await menu(sb, 'Edit search sites…');
  await page.locator('.modal textarea').fill('Mine | https://mine.example/?s={q}\nBroken line without address');
  await page.locator('.modal .btn.primary').click();
  await settle();
  ok((await T(sb).locator('.engine').count()) === 1, 'the site list can be edited (bad lines are dropped)');

  // ===================================================================================== feeds
  section('news feeds (RSS / Atom)');
  const fd = await addTile('feeds');
  await T(fd).locator('button:has-text("Add feeds")').click();
  await page.locator('.modal textarea').fill('Fake | http://127.0.0.1:9099/feed.xml\nAtom | http://127.0.0.1:9099/atom.xml\nBroken | http://127.0.0.1:9099/bad.txt\nEvil | http://127.0.0.1:9099/evil.xml');
  await page.locator('.modal .btn.primary').click();
  await T(fd).locator('.feed-item').first().waitFor({ timeout: 10000 });
  await page.waitForFunction((i) => document.querySelectorAll(`.tile[data-tile="${i}"] .feed-item`).length === 5, fd);
  ok(true, 'RSS and Atom items are merged into one list (5 items)');
  const titles = await T(fd).locator('.feed-title').allTextContents();
  ok(titles[0] === 'Atom one' && titles[1] === 'Alpha story', 'newest first across feeds');
  const bad = await T(fd).evaluate((el) => ({ scripts: el.querySelectorAll('script').length, xss: window.__xss, evilHref: [...el.querySelectorAll('a')].filter((a) => /Evil title/.test(a.textContent)).map((a) => a.getAttribute('href')), errs: [...el.querySelectorAll('.form-err')].map((e) => e.textContent) }));
  ok(bad.scripts === 0 && bad.xss === undefined, 'HTML inside feed titles is shown as text, never run');
  ok(bad.evilHref[0] === null, 'a javascript: link inside a feed is dropped');
  ok(bad.errs.some((e) => /Broken: .*not an RSS or Atom/.test(e)), 'a feed that is not RSS reports its own error without breaking the others');
  ok(bad.errs.some((e) => /Evil/.test(e)), 'a feed with an XML entity trick is refused');
  const unread0 = await T(fd).locator('.file-bar .muted').textContent();
  const pop = ctx.waitForEvent('page');
  await T(fd).locator('.feed-item', { hasText: 'Alpha story' }).click();
  (await pop).close();
  await settle();
  ok((await T(fd).locator('.feed-item.read').count()) === 1 && /4 unread/.test(await T(fd).locator('.file-bar .muted').textContent()), 'opening an item marks it read (' + unread0 + ' → 4 unread)');
  await T(fd).locator('button:has-text("Mark all read")').click(); await settle();
  ok(/0 unread/.test(await T(fd).locator('.file-bar .muted').textContent()), 'Mark all read');

  // ===================================================================================== weather
  section('weather');
  const wx = await addTile('weather');
  await T(wx).locator('input[data-key="city"]').fill('Singapore');
  await T(wx).locator('.weather-setup .btn').click();
  await T(wx).locator('.place').first().waitFor();
  await T(wx).locator('.place').first().click();
  await T(wx).locator('.wx-temp').waitFor();
  ok((await T(wx).locator('.wx-temp').textContent()) === '28°C' && (await T(wx).locator('.wx-text').textContent()) === 'Partly cloudy', 'current conditions show (28°C, partly cloudy)');
  ok((await T(wx).locator('.wx-day').count()) === 5, 'five forecast days show');
  await menu(wx, 'Use Fahrenheit');
  await page.waitForFunction((i) => (document.querySelector(`.tile[data-tile="${i}"] .wx-temp`) || {}).textContent === '83°F', wx, { timeout: 8000 });
  ok(true, 'the units switch to Fahrenheit (83°F)');

  // ===================================================================================== sketch
  section('sketch board');
  const sk = await addTile('sketch');
  await T(sk).locator('canvas').waitFor();
  await page.waitForTimeout(500);
  const files0 = fs.readdirSync(path.join(STORAGE, 'files')).filter((f) => /^[a-f0-9]{32}$/.test(f)).length;
  const stroke = async (y) => {
    const b = await T(sk).locator('canvas').boundingBox();
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * y); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * (y + 0.05), { steps: 8 });
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * y, { steps: 8 }); await page.mouse.up();
  };
  await stroke(0.4);
  await page.waitForFunction((i) => /Saved/.test(document.querySelector(`.tile[data-tile="${i}"] .sk-bar .muted`).textContent), sk, { timeout: 10000 });
  const f1 = await page.evaluate(async (i) => { const f = HB.store.itemsOf('files', i)[0]; const r = await fetch('file.php?id=' + f.id); const b = new Uint8Array(await r.arrayBuffer()); return { id: f.id, size: f.size, magic: [...b.slice(0, 4)].join(), type: r.headers.get('content-type') }; }, sk);
  ok(f1.magic === '137,80,78,71' && f1.type === 'image/png' && f1.size > 500, 'the drawing is saved as a PNG file (' + f1.size + ' bytes)');
  await stroke(0.7);
  await page.waitForFunction((a) => HB.store.itemsOf('files', a[0])[0].size !== a[1], [sk, f1.size], { timeout: 10000 }).catch(() => {});
  await page.waitForFunction((i) => /Saved/.test(document.querySelector(`.tile[data-tile="${i}"] .sk-bar .muted`).textContent), sk, { timeout: 10000 });
  await sleep(400);
  const rows = await page.evaluate(async (i) => (await HB.api.state()).files.filter((f) => f.tile_id === i).map((f) => f.id), sk);
  ok(rows.length === 1 && rows[0] === f1.id, 'saving again replaces the same file record (no pile of versions)');
  const files1 = fs.readdirSync(path.join(STORAGE, 'files')).filter((f) => /^[a-f0-9]{32}$/.test(f)).length;
  ok(files1 === files0 + 1, 'and the old image is removed from disk');
  await page.reload(); await page.waitForSelector('.tile');
  await page.waitForFunction((i) => { const c = document.querySelector(`.tile[data-tile="${i}"] canvas`); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let k = 0; k < d.length; k += 4 * 997) if (d[k] < 120) return true; return false; }, sk, { timeout: 8000 });
  ok(true, 'after a reload the drawing is back on the board');
  const dark = (y) => page.evaluate(([i, yy]) => { const c = document.querySelector(`.tile[data-tile="${i}"] canvas`); const d = c.getContext('2d').getImageData(Math.round(c.width * 0.4), Math.round(c.height * yy), 1, 1).data; return d[0] < 120; }, [sk, y]);
  ok(await dark(0.4 + 0.025), 'the first stroke is where it was drawn');
  await stroke(0.2);
  await T(sk).locator('button:has-text("Undo")').click();
  ok(!(await dark(0.2 + 0.025)), 'Undo removes the last stroke');
  await page.waitForFunction((i) => /Saved/.test(document.querySelector(`.tile[data-tile="${i}"] .sk-bar .muted`).textContent), sk, { timeout: 10000 });

  // ===================================================================================== cross-cutting
  section('search, trash, sharing, backup');
  await page.keyboard.press('Control+k');
  await page.fill('.cmd-input', 'medium is the message');
  await page.waitForSelector('.cmd-row:has-text("The medium is the message")');
  ok(true, 'Ctrl+K finds a quote by its text');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.fill('.cmd-input', 'Understanding Media');
  await page.waitForSelector('.cmd-row:has-text("The medium is the message")');
  ok(true, '…and by its source');
  await page.keyboard.press('Escape');
  await T(qt).locator('.tile-head button[aria-label="Tile menu"]').click();
  await page.locator('.menu-item', { hasText: 'Also show in' }).click();
  await page.locator('.menu.sub .menu-item', { hasText: 'PhD' }).click();
  await settle();
  await page.keyboard.press('3');
  await page.waitForSelector('.tile.mirror .quote');
  ok(/Marshall McLuhan/.test(await page.textContent('.tile.mirror .quote')), 'a quotes tile can be shared into another scenario');
  await page.keyboard.press('4');
  const exp = await page.evaluate(async () => { const j = await (await fetch('export.php?format=json')).json(); return { kinds: [...new Set(j.entries.map((e) => e.kind))].sort().join() }; });
  ok(exp.kinds === 'card,habit,note,quote,reading,time', 'the JSON backup includes every kind of new entry (' + exp.kinds + ')');
  const zip = await page.evaluate(async () => { const b = new Uint8Array(await (await fetch('export.php?format=zip')).arrayBuffer()); return String.fromCharCode(b[0], b[1]); });
  ok(zip === 'PK', 'the zip backup still builds (it carries the sketch image)');
  await page.keyboard.press('4');
  await page.click('#trash-zone');
  await page.waitForSelector('.trash-row, .trash-list');
  await page.keyboard.press('Escape');

  ok(errors.length === 0, 'no browser errors' + (errors.length ? ': ' + errors.slice(0, 6).join(' | ') : ''));
  await browser.close();
  fake.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
