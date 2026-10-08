(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  /** Source line: Author, *Source*, p. 12 */
  function sourceText(q) {
    const d = q.data || {};
    return [d.author, q.b, d.year ? '(' + d.year + ')' : '', d.page ? 'p. ' + String(d.page).replace(/^p+\.?\s*/i, '') : ''].filter(Boolean).join(', ');
  }
  HB.quoteSource = sourceText;
  const citation = (q) => '“' + (q.a || '').trim() + '”' + (sourceText(q) ? ' — ' + sourceText(q) : '') + (q.data && q.data.url ? ' ' + q.data.url : '');

  async function edit(ctx, q) {
    const d = q ? q.data || {} : {};
    const v = await HB.ui.form({ title: q ? 'Edit quote' : 'New quote', fields: [
      { name: 'a', label: 'Quote', type: 'textarea', rows: 5, value: q ? q.a : '', required: true },
      { name: 'author', label: 'Author', value: d.author || '', max: 120 },
      { name: 'source', label: 'Source (book, article, talk…)', value: q ? q.b || '' : '', max: 300, placeholder: 'Title of the work' },
      { name: 'year', label: 'Year', value: d.year || '', max: 10 },
      { name: 'page', label: 'Page / location', value: d.page || '', max: 40, placeholder: '42 or 12–14' },
      { name: 'url', label: 'Link (optional)', value: d.url || '', type: 'url', validate: (x) => (x && !HB.normUrl(x) ? 'Use an http(s) address' : '') },
      { name: 'tags', label: 'Tags', value: q ? q.tags : '', placeholder: 'comma, separated' },
    ] });
    if (!v) return;
    const data = { author: v.author, year: v.year, page: v.page, url: v.url ? HB.normUrl(v.url) : '' };
    const tags = HB.tagsToString(HB.parseTags(v.tags));
    if (q) S.update('entries', q.id, { a: v.a, b: v.source, data, tags }, { label: 'edit quote' });
    else await HB.createEntry(ctx, 'quote', { a: v.a, b: v.source, data, tags });
  }

  function copy(q) {
    const t = citation(q);
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => HB.ui.toast('Copied with its source'), () => {
      const ta = h('textarea', { value: t }); document.body.append(ta); ta.select(); try { document.execCommand('copy'); HB.ui.toast('Copied with its source'); } catch (e) { /* ignore */ } ta.remove();
    });
  }

  const filters = {};

  HB.gadgets.define('quotes', class extends HB.Gadget {
    render(body, ctx) {
      const all = S.entriesOf(ctx.id, 'quote');
      const f = (filters[ctx.id] || '').toLowerCase();
      const shown = f ? all.filter((q) => [q.a, q.b, q.tags, (q.data || {}).author].join(' ').toLowerCase().includes(f)) : all;
      const list = h('div', { class: 'quotes', dataset: { tile: ctx.id } });
      shown.forEach((q) => {
        const src = sourceText(q);
        list.append(h('figure', {
          class: 'quote', dataset: { id: q.id, color: q.colour || '' },
          oncontextmenu: (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, [
            { label: 'Edit…', onClick: () => edit(ctx, q) },
            { label: 'Copy quote with source', onClick: () => copy(q) },
            { label: 'Colour & tags…', onClick: () => HB.editMeta('entries', q, { title: 'Quote colour and tags' }) },
            ...(HB.moveTargets('entries', q, ['quotes']).length ? [{ label: 'Move to tile', children: HB.moveTargets('entries', q, ['quotes']) }] : []),
            { sep: true }, { label: 'Delete', danger: true, onClick: () => S.remove('entries', q.id, { label: 'delete quote' }) },
          ]); },
        }, h('blockquote', { class: 'quote-text', text: q.a }),
        h('figcaption', { class: 'quote-src' }, src ? '— ' + src : h('span', { class: 'muted', text: '— no source yet' }),
          (q.data || {}).url ? h('a', { class: 'quote-link', href: (q.data || {}).url, target: '_blank', rel: 'noopener noreferrer', text: ' ↗', title: 'Open the source' }) : null),
        HB.tagChips(q),
        h('div', { class: 'quote-btns' },
          h('button', { class: 'btn small ghost', text: 'Copy', title: 'Copy quote with its source', onclick: () => copy(q) }),
          HB.readOnly ? null : h('button', { class: 'btn small ghost', text: 'Edit', onclick: () => edit(ctx, q) }),
          h('button', { class: 'x on', text: '×', title: 'Delete', 'aria-label': 'Delete quote', onclick: () => S.remove('entries', q.id, { label: 'delete quote' }) }))));
      });
      if (!all.length) list.append(h('div', { class: 'empty small no-drag', text: 'No quotes yet. Add one with its source.' }));
      const search = h('input', { type: 'text', class: 'quote-filter', placeholder: 'Filter quotes…', value: filters[ctx.id] || '', dataset: { key: 'qfilter' },
        oninput: HB.debounce((e) => { filters[ctx.id] = e.target.value; HB.board.reconcile(true); }, 200) });
      body.append(h('div', { class: 'file-bar' }, HB.readOnly ? null : h('button', { class: 'btn small primary', text: '+ Quote', onclick: () => edit(ctx, null) }), all.length > 3 ? search : null), list);
      HB.sortable(body, list, {
        group: 'quotes', draggable: '[data-id]',
        onDrop: (evt) => HB.listDrop('entries', evt, (c) => ({ tile_id: Number(c.dataset.tile) })),
        onTrash: (item) => S.remove('entries', Number(item.dataset.id), { label: 'delete quote' }),
      });
    }
    menu(tile, ctx) { return [{ label: 'Add quote…', onClick: () => edit(ctx, null) }]; }
  });
})();
