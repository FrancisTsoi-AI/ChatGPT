(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const ORDER = ['unread', 'reading', 'read'];
  const ICON = { unread: '○', reading: '◐', read: '●' };
  const statusOf = (r) => ((r.data || {}).status) || 'unread';
  const filters = {};
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

  function setStatus(r, s) {
    if (HB.readOnly) return; // a visitor opening a link must not try to change your list
    S.update('entries', r.id, { data: Object.assign({}, r.data, { status: s }) }, { label: 'reading status' });
  }

  async function edit(ctx, r) {
    const d = r.data || {};
    const v = await HB.ui.form({ title: 'Edit reading item', fields: [
      { name: 'a', label: 'Title', value: r.a || '', required: true, max: 300 },
      { name: 'b', label: 'Link', value: r.b || '', type: 'url', validate: (x) => (x && !HB.normUrl(x) ? 'Use an http(s) address' : '') },
      { name: 'author', label: 'Author', value: d.author || '', max: 120 },
      { name: 'note', label: 'Note', type: 'textarea', rows: 3, value: d.note || '' },
      { name: 'tags', label: 'Tags', value: r.tags || '', placeholder: 'comma, separated' },
      { name: 'colour', label: 'Colour label', type: 'color', value: r.colour || '' },
    ] });
    if (!v) return;
    S.update('entries', r.id, { a: v.a, b: v.b ? HB.normUrl(v.b) : '', tags: HB.tagsToString(HB.parseTags(v.tags)), colour: v.colour, data: Object.assign({}, d, { author: v.author, note: v.note }) }, { label: 'edit reading item' });
  }

  async function add(ctx, text) {
    let title = '', url = '';
    if (text.includes('|')) { [title, url] = text.split('|').map((s) => s.trim()); } else if (HB.normUrl(text)) url = text; else title = text;
    const norm = url ? HB.normUrl(url) : '';
    if (url && !norm) { HB.ui.toast('That link is not a web address', { type: 'error' }); return; }
    const top = S.entriesOf(ctx.id, 'reading')[0];
    const row = await HB.createEntry(ctx, 'reading', { a: title || (norm ? host(norm) : ''), b: norm, position: top ? top.position - 1 : 0, data: { status: 'unread' } });
    if (row && norm && !title) { // fetch the page title in the background (needs the server's cURL); ignore failures
      HB.api.gadget('reading', 'title', { url: norm }).then((t) => { if (t && t.title) S.update('entries', row.id, { a: t.title }, { record: false }); }).catch(() => {});
    }
  }

  HB.gadgets.define('reading', class extends HB.Gadget {
    render(body, ctx) {
      const all = S.entriesOf(ctx.id, 'reading');
      const f = filters[ctx.id] || 'all';
      const shown = f === 'all' ? all : all.filter((r) => statusOf(r) === f);
      const counts = (s) => all.filter((r) => statusOf(r) === s).length;
      const seg = h('div', { class: 'seg' }, ['all', ...ORDER].map((k) => h('button', {
        type: 'button', class: 'seg-btn' + (k === f ? ' on' : ''), text: k === 'all' ? 'All ' + all.length : k[0].toUpperCase() + k.slice(1) + ' ' + counts(k),
        onclick: () => { filters[ctx.id] = k; HB.board.reconcile(true); },
      })));
      const list = h('div', { class: 'reads', dataset: { tile: ctx.id } });
      shown.forEach((r) => {
        const s = statusOf(r), d = r.data || {};
        const title = r.b
          ? h('a', { class: 'read-title', href: HB.normUrl(r.b) || null, target: '_blank', rel: 'noopener noreferrer', text: r.a || r.b, draggable: false,
            onclick: (e) => { if (HB.justDragged()) e.preventDefault(); else if (s === 'unread') setStatus(r, 'reading'); } })
          : h('span', { class: 'read-title', text: r.a });
        list.append(h('div', {
          class: 'read st-' + s, dataset: { id: r.id, color: r.colour || '' },
          oncontextmenu: (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, [
            { label: 'Edit…', onClick: () => edit(ctx, r) },
            ...ORDER.filter((x) => x !== s).map((x) => ({ label: 'Mark ' + x, onClick: () => setStatus(r, x) })),
            ...(HB.moveTargets('entries', r, ['reading']).length ? [{ label: 'Move to tile', children: HB.moveTargets('entries', r, ['reading']) }] : []),
            { sep: true }, { label: 'Delete', danger: true, onClick: () => S.remove('entries', r.id, { label: 'delete reading item' }) },
          ]); },
        },
        h('button', { class: 'read-state', text: ICON[s], title: s + ' — click to change', 'aria-label': 'Status: ' + s,
          onclick: () => setStatus(r, ORDER[(ORDER.indexOf(s) + 1) % 3]) }),
        h('div', { class: 'read-main' }, title,
          h('div', { class: 'muted small', text: [d.author, r.b ? host(r.b) : ''].filter(Boolean).join(' · ') }),
          d.note ? h('div', { class: 'small read-note', text: d.note }) : null, HB.tagChips(r)),
        h('button', { class: 'x', text: '×', title: 'Delete', 'aria-label': 'Delete', onclick: () => S.remove('entries', r.id, { label: 'delete reading item' }) })));
      });
      if (!shown.length) list.append(h('div', { class: 'empty small no-drag', text: all.length ? 'Nothing in this view.' : 'Nothing saved yet. Paste a link below.' }));
      body.append(seg, list, HB.addRow({ placeholder: 'Paste a link, or  Title | link', key: 'read-add', onAdd: (t) => add(ctx, t) }));
      HB.sortable(body, list, {
        group: 'reading', draggable: '[data-id]',
        onDrop: (evt) => HB.listDrop('entries', evt, (c) => ({ tile_id: Number(c.dataset.tile) })),
        onTrash: (item) => S.remove('entries', Number(item.dataset.id), { label: 'delete reading item' }),
      });
    }
  });
})();
