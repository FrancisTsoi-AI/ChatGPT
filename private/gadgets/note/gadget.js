(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const editing = new Set();   // tile ids being typed in on this page
  const creating = new Map();  // tile id -> pending create promise (so a fast typist never creates two rows)
  const timers = new Map();

  const rowOf = (ctx) => S.entriesOf(ctx.id, 'note')[0] || null;

  async function save(ctx, text) {
    const row = rowOf(ctx);
    if (row) { if (row.a !== text) S.update('entries', row.id, { a: text }, { record: false }); return; }
    if (creating.has(ctx.id)) { await creating.get(ctx.id); const r = rowOf(ctx); if (r) S.update('entries', r.id, { a: text }, { record: false }); return; }
    const p = S.create('entries', { tile_id: ctx.id, kind: 'note', a: text }, { record: false }).catch((e) => HB.ui.toast('Could not save the note: ' + e.message, { type: 'error' }));
    creating.set(ctx.id, p);
    await p;
    creating.delete(ctx.id);
  }

  HB.gadgets.define('note', class extends HB.Gadget {
    keep(ctx) { return editing.has(ctx.id); }
    render(body, ctx) {
      const row = rowOf(ctx);
      const text = row ? row.a || '' : '';
      const wrap = h('div', { class: 'note' });
      body.append(wrap);

      const view = () => {
        editing.delete(ctx.id);
        wrap.replaceChildren();
        const text = rowOf(ctx) ? rowOf(ctx).a || '' : ''; // always the latest saved text
        const tools = h('div', { class: 'note-tools' }, h('button', { class: 'btn small', text: '✎ Edit', onclick: () => edit() }),
          h('span', { class: 'muted small', text: text.trim() ? text.trim().split(/\s+/).length + ' words' : '' }));
        const md = h('div', { class: 'md', title: 'Double-click to edit', ondblclick: () => edit() });
        if (text.trim()) {
          md.append(HB.md.render(text, { onToggle: (idx, checked) => { save(ctx, HB.md.toggleLine((rowOf(ctx) || { a: text }).a || text, idx, checked)); } }));
        } else md.append(h('div', { class: 'empty small', text: 'Empty note. Double-click or press Edit to write (Markdown works).' }));
        wrap.append(tools, md);
      };

      const edit = () => {
        if (HB.readOnly) return;
        editing.add(ctx.id);
        wrap.replaceChildren();
        const ta = h('textarea', { class: 'note-edit', value: (rowOf(ctx) || { a: text }).a || '', dataset: { key: 'note' }, placeholder: '# Title\n\nWrite in Markdown: **bold**, *italic*, - lists, - [ ] tasks, > quotes, `code`, [links](https://…)' });
        const status = h('span', { class: 'muted small', text: '' });
        const flush = () => { clearTimeout(timers.get(ctx.id)); status.textContent = 'Saving…'; return save(ctx, ta.value).then(() => { status.textContent = 'Saved'; }); };
        ta.addEventListener('input', () => { status.textContent = 'Typing…'; clearTimeout(timers.get(ctx.id)); timers.set(ctx.id, setTimeout(flush, 800)); });
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); }
          if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
        });
        const done = async () => { await flush(); view(); HB.board.markRendered(ctx.tile.id); };
        wrap.append(h('div', { class: 'note-tools' }, h('button', { class: 'btn small primary', text: '✓ Done', onclick: done }), status), ta);
        ta.focus();
      };

      if (editing.has(ctx.id)) edit(); else view();
    }
  });
})();
