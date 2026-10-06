(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const url = (f, dl) => 'file.php?id=' + f.id + (dl ? '&dl=1' : '');
  HB.fileUrl = url;
  const isImage = (f) => /^image\//.test(f.type);
  const isAudio = (f) => /^audio\//.test(f.type);
  HB.isAudio = isAudio;

  function icon(f) {
    if (isImage(f)) return '🖼';
    if (isAudio(f)) return '🎵';
    if (/^video\//.test(f.type)) return '🎬';
    if (f.type === 'application/pdf') return '📕';
    if (/^text\//.test(f.type)) return '📄';
    if (/zip|compressed|tar|rar|7z/.test(f.type)) return '🗜';
    return '📎';
  }

  /** Preview dialog for images, PDF, audio, video and text; everything else offers a download. */
  HB.preview = async function (f) {
    const box = h('div', { class: 'preview' });
    if (isImage(f)) box.append(h('img', { src: url(f), alt: f.original_name }));
    else if (f.type === 'application/pdf') box.append(h('iframe', { src: url(f), title: f.original_name }));
    else if (isAudio(f)) box.append(h('audio', { src: url(f), controls: true, autoplay: true }));
    else if (/^video\//.test(f.type)) box.append(h('video', { src: url(f), controls: true, autoplay: true }));
    else if (f.type === 'text/plain' && f.size < 400000) {
      const pre = h('pre', { class: 'preview-text', text: 'Loading…' });
      box.append(pre);
      fetch(url(f), { credentials: 'same-origin' }).then((r) => r.text()).then((t) => { pre.textContent = t; }).catch(() => { pre.textContent = 'Could not load the text.'; });
    } else box.append(h('p', { class: 'muted', text: 'No preview for this file type.' }));
    box.append(h('p', { class: 'muted small', text: HB.size(f.size) + ' · ' + f.type }));
    HB.ui.modal({
      title: f.original_name, content: box, wide: true,
      onClose: () => { box.querySelectorAll('audio,video').forEach((m) => m.pause()); },
      actions: [{ label: 'Close' }, { label: 'Download', primary: true, onClick: () => { location.href = url(f, true); } }],
    });
  };

  function menu(f) {
    const items = [
      { label: 'Open / preview', onClick: () => HB.preview(f) },
      { label: 'Download', onClick: () => { location.href = url(f, true); } },
      { label: 'Rename', onClick: () => { const el = document.querySelector('.file[data-id="' + f.id + '"] .file-name'); if (el) el.dispatchEvent(new Event('rename')); } },
      { label: 'Colour & tags…', onClick: () => HB.editMeta('files', f, { title: 'File colour and tags' }) },
    ];
    const to = HB.moveTargets('files', f, ['files', 'music']).filter((m) => true);
    if (to.length) items.push({ label: 'Move to tile', children: to });
    items.push({ sep: true }, { label: 'Delete', danger: true, onClick: () => S.remove('files', f.id, { label: 'delete file' }) });
    return items;
  }

  function fileEl(f, view) {
    const name = h('span', { class: 'file-name', text: f.original_name, title: 'Click to open' });
    const thumb = isImage(f)
      ? h('img', { class: 'thumb', src: url(f), loading: 'lazy', alt: '', draggable: false })
      : h('span', { class: 'thumb icon', text: icon(f) });
    const el = h('div', {
      class: 'file', dataset: { id: f.id, color: f.colour || '', audio: isAudio(f) ? '1' : '0' },
      oncontextmenu: (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, menu(f)); },
    },
    h('a', { class: 'file-open', href: url(f), draggable: false,
      onclick: (e) => { e.preventDefault(); if (!HB.justDragged()) HB.preview(f); } }, thumb),
    h('div', { class: 'file-info' }, name, h('div', { class: 'file-meta', text: HB.size(f.size) + ' · ' + HB.fmtDateTime(f.created_at) }), HB.tagChips(f)),
    h('a', { class: 'btn icon ghost dl', href: url(f, true), title: 'Download', 'aria-label': 'Download ' + f.original_name, text: '⬇', draggable: false }),
    h('button', { class: 'x', title: 'Delete', 'aria-label': 'Delete file', text: '×', onclick: () => S.remove('files', f.id, { label: 'delete file' }) }));
    name.addEventListener('click', () => { if (!HB.justDragged()) HB.preview(f); });
    name.addEventListener('rename', () => HB.ui.inlineEdit(name, { value: f.original_name, max: 255, onSave: (v) => S.update('files', f.id, { original_name: v }, { label: 'rename file' }), onCancel: () => HB.board.reconcile(true) }));
    name.addEventListener('dblclick', (e) => { e.stopPropagation(); name.dispatchEvent(new Event('rename')); });
    return el;
  }

  HB.fileTileRender = function (body, ctx, opt) {
    opt = opt || {};
    const view = ctx.settings.view === 'grid' ? 'grid' : 'list';
    const files = ctx.items('files').filter((f) => !opt.audioOnly || isAudio(f));
    const list = h('div', { class: 'files ' + view, dataset: { tile: ctx.id } });
    files.forEach((f) => list.append(fileEl(f, view)));
    if (!files.length) list.append(h('div', { class: 'empty small no-drag', text: 'Drop files here or press Upload.' }));
    const input = h('input', { type: 'file', multiple: true, hidden: true, onchange: () => { HB.upload.files(Array.from(input.files), ctx.id); input.value = ''; } });
    const bar = h('div', { class: 'file-bar' },
      h('button', { class: 'btn small', text: '⬆ Upload', onclick: () => input.click() }), input,
      h('span', { class: 'muted small', text: files.length + (files.length === 1 ? ' file' : ' files') }));
    body.append(bar, list);
    HB.sortable(body, list, {
      group: 'files', draggable: '[data-id]',
      put: (to, from, item) => to.el.dataset.accept !== 'audio' || item.dataset.audio === '1',
      onDrop: (evt) => HB.listDrop('files', evt, (c) => ({ tile_id: Number(c.dataset.tile) })),
      onTrash: (item) => S.remove('files', Number(item.dataset.id), { label: 'delete file' }),
    });
  };

  HB.registerTile('files', {
    w: 4, h: 5,
    render(body, ctx) { HB.fileTileRender(body, ctx); },
    menu(tile, ctx) {
      const grid = ctx.settings.view === 'grid';
      return [
        { label: 'Upload files…', onClick: () => { const i = document.querySelector('.tile[data-tile="' + tile.id + '"] input[type=file]'); if (i) i.click(); } },
        { label: 'Thumbnail view', checked: grid, onClick: () => HB.setTileSettings(ctx.id, { view: grid ? 'list' : 'grid' }) },
      ];
    },
  });
})();
