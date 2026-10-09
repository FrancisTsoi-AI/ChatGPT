(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const MIN = 60000, DAY = 86400000;

  /**
   * Scheduler (SM-2 style). grade: 1 Again, 2 Hard, 3 Good, 4 Easy.
   * Returns the new {data, due_at} for a card; `data` holds ivl (days), ease, reps, lapses.
   */
  function next(card, g, now) {
    now = now || Date.now();
    const d = card.data || {};
    let ivl = d.ivl || 0, ease = d.ease || 2.5, reps = d.reps || 0, lapses = d.lapses || 0, due;
    if (g === 1) {
      reps = 0; lapses++; ease = Math.max(1.3, ease - 0.2); ivl = 0; due = now + 10 * MIN;
    } else {
      if (g === 2) { ease = Math.max(1.3, ease - 0.15); ivl = reps === 0 ? 1 : Math.max(1, Math.round(ivl * 1.2)); }
      else if (g === 3) ivl = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(ivl + 1, Math.round(ivl * ease));
      else { ease += 0.15; ivl = reps === 0 ? 4 : Math.max(ivl + 2, Math.round(Math.max(ivl, 1) * ease * 1.3)); }
      reps++;
      due = now + ivl * DAY;
    }
    return {
      data: Object.assign({}, d, { ivl, ease: Math.round(ease * 100) / 100, reps, lapses, first: d.first || HB.localDay(new Date(now)), last: now }),
      due_at: new Date(due).toISOString(),
    };
  }
  function span(ms) {
    if (ms < 3600000) return Math.max(1, Math.round(ms / MIN)) + 'm';
    if (ms < DAY) return Math.round(ms / 3600000) + 'h';
    const d = ms / DAY;
    if (d < 30) return Math.round(d) + 'd';
    if (d < 365) return Math.round(d / 30 * 10) / 10 + 'mo';
    return Math.round(d / 365 * 10) / 10 + 'y';
  }
  const preview = (card, g) => span(Date.parse(next(card, g).due_at) - Date.now());
  HB.srs = { next, preview, span };

  const isDue = (c, now) => !!c.due_at && Date.parse(c.due_at) <= now;
  const isNew = (c) => !c.due_at;

  /** Cards to study right now: everything due, plus new cards up to today's allowance. */
  function queueFor(ctx) {
    const cards = S.entriesOf(ctx.id, 'card');
    const now = Date.now();
    const today = HB.localDay();
    const limit = ctx.settings.newPerDay === undefined ? 20 : ctx.settings.newPerDay;
    const introduced = cards.filter((c) => c.data && c.data.first === today).length;
    const due = cards.filter((c) => isDue(c, now)).sort((a, b) => a.due_at.localeCompare(b.due_at));
    const fresh = cards.filter(isNew).slice(0, Math.max(0, limit - introduced));
    return { due, fresh, all: cards, queue: due.concat(fresh) };
  }

  async function editCard(ctx, card, opts) {
    opts = opts || {};
    const fields = [
      { name: 'a', label: 'Front (question)', type: 'textarea', rows: 3, value: card ? card.a : '', required: true },
      { name: 'b', label: 'Back (answer)', type: 'textarea', rows: 4, value: card ? card.b || '' : '', required: true },
      { name: 'tags', label: 'Tags', value: card ? card.tags : '', placeholder: 'comma, separated' },
    ];
    if (!card) fields.push({ name: 'more', label: 'Add another card after this one', type: 'checkbox', value: true });
    const v = await HB.ui.form({ title: card ? 'Edit card' : 'New card', fields, submit: card ? 'Save' : 'Add card' });
    if (!v) return;
    const tags = HB.tagsToString(HB.parseTags(v.tags));
    if (card) { S.update('entries', card.id, { a: v.a, b: v.b, tags }, { label: 'edit card' }); return; }
    await HB.createEntry(ctx, 'card', { a: v.a, b: v.b, tags, data: { ivl: 0, ease: 2.5, reps: 0, lapses: 0 } });
    if (v.more) await editCard(ctx, null, opts);
  }

  async function importCards(ctx) {
    const v = await HB.ui.form({
      title: 'Import cards', submit: 'Import',
      fields: [{ name: 'text', type: 'textarea', rows: 10, required: true, label: 'One card per line:  front | back',
        hint: 'Also accepts tab-separated text (paste from Excel or an Anki export). Blank and malformed lines are skipped.' }],
    });
    if (!v) return;
    const rows = [];
    v.text.split('\n').forEach((line) => {
      const sep = line.includes('\t') ? '\t' : line.includes(' | ') ? ' | ' : line.includes('|') ? '|' : null;
      if (!sep) return;
      const i = line.indexOf(sep);
      const a = line.slice(0, i).trim(), b = line.slice(i + sep.length).trim();
      if (a && b) rows.push({ tile_id: ctx.id, kind: 'card', a, b, data: { ivl: 0, ease: 2.5, reps: 0, lapses: 0 } });
    });
    if (!rows.length) { HB.ui.toast('No cards found. Use one per line:  front | back', { type: 'error' }); return; }
    try { await S.createMany('entries', rows, { label: 'import cards' }); HB.ui.toast('Imported ' + rows.length + ' card' + (rows.length === 1 ? '' : 's')); } catch (e) { HB.ui.toast('Import failed: ' + e.message, { type: 'error' }); }
  }

  function browse(ctx) {
    const input = h('input', { type: 'text', placeholder: 'Filter cards…' });
    const list = h('div', { class: 'card-list' });
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const now = Date.now();
      const cards = S.entriesOf(ctx.id, 'card').filter((c) => !q || (c.a + ' ' + (c.b || '') + ' ' + c.tags).toLowerCase().includes(q));
      list.replaceChildren(...cards.map((c) => h('div', { class: 'card-row' },
        h('div', { class: 'card-row-text' }, h('div', { class: 'card-front', text: c.a }), h('div', { class: 'muted small card-back', text: c.b || '' })),
        h('span', { class: 'chip', text: isNew(c) ? 'new' : isDue(c, now) ? 'due' : 'in ' + span(Date.parse(c.due_at) - now) }),
        h('button', { class: 'btn small', text: 'Edit', onclick: async () => { await editCard(ctx, c); draw(); } }),
        h('button', { class: 'btn small danger', text: 'Delete', onclick: () => { S.remove('entries', c.id, { label: 'delete card' }); draw(); } }))));
      if (!cards.length) list.append(h('div', { class: 'muted', text: 'No cards.' }));
    };
    input.addEventListener('input', draw);
    draw();
    HB.ui.modal({ title: 'Cards in this deck', wide: true, content: h('div', {}, input, list), actions: [{ label: 'Close', primary: true }] });
  }

  /** Full-window study session. */
  function study(ctx) {
    const q0 = queueFor(ctx);
    if (!q0.queue.length) { HB.ui.toast('Nothing to study right now. 🎉'); return; }
    const queue = q0.queue.map((c) => c.id);
    let pos = 0, shown = false, reviewed = 0, again = 0;
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };

    const back = h('div', { class: 'study-back' });
    const box = h('div', { class: 'study', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Study flashcards' });
    back.append(box);
    document.getElementById('layer').append(back);
    HB.modalCount = (HB.modalCount || 0) + 1;

    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      HB.modalCount = Math.max(0, HB.modalCount - 1);
      S.flush();
      HB.board.reconcile(true);
    };
    const current = () => S.get('entries', queue[pos]);

    function grade(g) {
      const c = current();
      if (!c) return;
      const n = next(c, g);
      S.update('entries', c.id, n, { record: false });
      counts[g]++; reviewed++;
      if (g === 1) { again++; queue.push(c.id); }
      pos++; shown = false;
      draw();
    }

    function draw() {
      box.replaceChildren();
      const head = h('div', { class: 'study-head' },
        h('span', { class: 'muted', text: pos < queue.length ? 'Card ' + (pos + 1) + ' of ' + queue.length : 'Finished' }),
        h('div', { class: 'study-prog' }, h('i', { style: { width: Math.round((pos / queue.length) * 100) + '%' } })),
        h('button', { class: 'btn ghost', text: '✕', title: 'Close (Esc)', 'aria-label': 'Close', onclick: close }));
      box.append(head);
      const c = current();
      if (pos >= queue.length || !c) {
        const good = counts[3] + counts[4];
        box.append(h('div', { class: 'study-done' }, h('div', { class: 'study-big', text: '🎉 Session complete' }),
          h('p', { text: reviewed + ' review' + (reviewed === 1 ? '' : 's') + (reviewed ? ' · ' + Math.round((good / reviewed) * 100) + '% remembered well' : '') }),
          h('p', { class: 'muted small', text: 'Again ' + counts[1] + ' · Hard ' + counts[2] + ' · Good ' + counts[3] + ' · Easy ' + counts[4] }),
          h('button', { class: 'btn primary', text: 'Done', onclick: close })));
        return;
      }
      const front = h('div', { class: 'study-side md' }, HB.md.render(c.a));
      const answer = h('div', { class: 'study-side study-answer md' }, HB.md.render(c.b || ''));
      const area = h('div', { class: 'study-card', onclick: () => { if (!shown) reveal(); } }, front, shown ? h('hr') : null, shown ? answer : h('div', { class: 'muted study-hint', text: 'Tap or press Space to show the answer' }));
      const btns = h('div', { class: 'study-btns' });
      if (shown) {
        [[1, 'Again'], [2, 'Hard'], [3, 'Good'], [4, 'Easy']].forEach(([g, name]) => btns.append(h('button', { class: 'grade g' + g, dataset: { grade: g }, onclick: () => grade(g) },
          h('b', { text: name }), h('small', { text: preview(c, g) }), h('kbd', { text: String(g) }))));
      } else btns.append(h('button', { class: 'btn primary big', text: 'Show answer', onclick: reveal }));
      box.append(area, btns);
      if (c.tags) box.append(h('div', { class: 'muted small study-tags', text: HB.parseTags(c.tags).map((t) => '#' + t).join(' ') }));
    }
    function reveal() { shown = true; draw(); }

    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
      if (pos >= queue.length) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); } return; }
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
      else if (shown && /^[1-4]$/.test(e.key)) { e.preventDefault(); grade(Number(e.key)); }
      else if (shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); grade(3); }
    }
    document.addEventListener('keydown', onKey, true);
    draw();
  }

  HB.gadgets.define('flashcards', class extends HB.Gadget {
    render(body, ctx) {
      if (this.readOnly) { // share page: flip through the cards, nothing is scheduled
        const cards = S.entriesOf(ctx.id, 'card');
        body.append(h('div', { class: 'fc-ro' }, h('p', { class: 'muted small', text: cards.length + ' cards · click a card to see its answer' }),
          cards.map((c) => { const back = h('div', { class: 'fc-ro-back md', hidden: true }, HB.md.render(c.b || ''));
            return h('div', { class: 'fc-ro-card', onclick: () => { back.hidden = !back.hidden; } }, h('div', { class: 'md' }, HB.md.render(c.a)), back); })));
        return;
      }
      const { due, fresh, all } = queueFor(ctx);
      const upcoming = all.filter((c) => c.due_at && !isDue(c, Date.now())).sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
      const total = due.length + fresh.length;
      body.append(h('div', { class: 'fc' },
        h('div', { class: 'fc-counts' },
          h('div', { class: 'fc-n due' }, h('b', { text: String(due.length) }), h('small', { text: 'due' })),
          h('div', { class: 'fc-n new' }, h('b', { text: String(fresh.length) }), h('small', { text: 'new' })),
          h('div', { class: 'fc-n' }, h('b', { text: String(all.length) }), h('small', { text: 'cards' }))),
        h('button', { class: 'btn primary big fc-study', text: total ? '▶ Study ' + total : 'All caught up ✓', disabled: !total, onclick: () => study(ctx) }),
        !total && upcoming ? h('div', { class: 'muted small', text: 'Next review in ' + span(Date.parse(upcoming.due_at) - Date.now()) }) : null,
        h('div', { class: 'fc-btns' },
          h('button', { class: 'btn small', text: '+ Add card', onclick: () => editCard(ctx, null) }),
          h('button', { class: 'btn small', text: 'Browse', disabled: !all.length, onclick: () => browse(ctx) }),
          h('button', { class: 'btn small', text: 'Import', onclick: () => importCards(ctx) }))));
    }
    menu(tile, ctx) {
      const limit = ctx.settings.newPerDay === undefined ? 20 : ctx.settings.newPerDay;
      return [
        { label: 'Study now', onClick: () => study(ctx) },
        { label: 'Add card…', onClick: () => editCard(ctx, null) },
        { label: 'Import cards…', onClick: () => importCards(ctx) },
        { label: 'Browse cards…', onClick: () => browse(ctx) },
        { label: 'New cards per day (' + limit + ')…', onClick: async () => {
          const v = await HB.ui.form({ title: 'New cards per day', fields: [{ name: 'n', label: 'Number of new cards introduced each day', value: String(limit), required: true }] });
          if (v && isFinite(parseInt(v.n, 10))) HB.setTileSettings(ctx.id, { newPerDay: Math.max(0, parseInt(v.n, 10)) }, 'new cards per day');
        } },
      ];
    }
  });
})();
