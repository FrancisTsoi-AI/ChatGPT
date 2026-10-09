(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;
  const limits = {};
  const PAGE = 100;

  function thoughtEl(t, ctx) {
    const text = h('p', { class: 'thought-text', text: t.text, title: 'Click to edit' });
    text.addEventListener('click', () => {
      if (HB.justDragged() || window.getSelection().toString()) return;
      HB.ui.inlineEdit(text, { value: t.text, multiline: true, max: 20000,
        onSave: (v) => S.update('thoughts', t.id, { text: v, tags: HB.tagsToString([...HB.parseTags(t.tags), ...HB.hashtags(v)]) }, { label: 'edit thought' }),
        onCancel: () => HB.board.reconcile(true) });
    });
    return h('article', {
      class: 'thought', dataset: { id: t.id },
      oncontextmenu: (e) => {
        e.preventDefault();
        HB.ui.menu(e.clientX, e.clientY, [
          { label: 'Copy text', onClick: () => navigator.clipboard && navigator.clipboard.writeText(t.text) },
          { label: 'Tags…', onClick: () => HB.editMeta('thoughts', t, { title: 'Thought tags', noColour: true }) },
          ...(HB.moveTargets('thoughts', t, ['thoughts']).length ? [{ label: 'Move to tile', children: HB.moveTargets('thoughts', t, ['thoughts']) }] : []),
          { sep: true }, { label: 'Delete', danger: true, onClick: () => S.remove('thoughts', t.id, { label: 'delete thought' }) },
        ]);
      },
    }, h('time', { class: 'thought-time', text: HB.fmtDateTime(t.created_at), datetime: t.created_at }), text, HB.tagChips(t),
    h('button', { class: 'x', title: 'Delete', 'aria-label': 'Delete thought', text: '×', onclick: () => S.remove('thoughts', t.id, { label: 'delete thought' }) }));
  }

  HB.gadgets.define('thoughts', class extends HB.Gadget {
    render(body, ctx) {
      let busy = false;
      const submit = async () => {
        const v = ta.value.trim();
        if (!v || busy) return;
        busy = true;
        ta.value = '';
        const row = await HB.safeCreate('thoughts', { tile_id: ctx.id, text: v, tags: HB.tagsToString(HB.hashtags(v)) }, 'add thought');
        if (!row) ta.value = v;
        busy = false;
        const again = document.querySelector('.tile[data-tile="' + ctx.tile.id + '"] textarea[data-key="thought"]');
        if (again) again.focus();
      };
      const ta = h('textarea', {
        rows: 2, placeholder: 'Type a thought, press Enter…  (Shift+Enter for a new line)', dataset: { key: 'thought' }, maxlength: 20000,
        onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } },
      });
      const all = ctx.items('thoughts');
      const limit = limits[ctx.id] || PAGE;
      const list = h('div', { class: 'thoughts', dataset: { tile: ctx.id } });
      all.slice(0, limit).forEach((t) => list.append(thoughtEl(t, ctx)));
      if (!all.length) list.append(h('div', { class: 'empty small no-drag', text: 'Nothing yet.' }));
      body.append(h('div', { class: 'thought-input' }, ta), list);
      if (all.length > limit) {
        body.append(h('button', { class: 'btn small more', text: 'Show ' + Math.min(PAGE, all.length - limit) + ' older (' + (all.length - limit) + ' hidden)',
          onclick: () => { limits[ctx.id] = limit + PAGE; HB.board.reconcile(true); } }));
      }
      HB.sortable(body, list, {
        group: 'thoughts', sort: false,
        onDrop: (evt) => { if (evt.from !== evt.to) S.update('thoughts', Number(evt.item.dataset.id), { tile_id: Number(evt.to.dataset.tile) }, { label: 'move thought' }); },
        onTrash: (item) => S.remove('thoughts', Number(item.dataset.id), { label: 'delete thought' }),
      });
    }
  });
})();
