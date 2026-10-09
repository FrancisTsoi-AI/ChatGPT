(function () {
  // Shared file-list pieces used by the Files, Music and other gadgets: preview dialog, list renderer, helpers.
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const url = (f, dl) => 'file.php?id=' + f.id + (dl ? '&dl=1' : '');
  HB.fileUrl = url;
  const isImage = (f) => /^image\//.test(f.type);
  // by type, or by name for files the browser or server could not type (some phones send "application/octet-stream")
  const AUDIO_EXT = /\.(mp3|mpga|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i;
  const isAudio = (f) => /^audio\//.test(f.type) || AUDIO_EXT.test(f.original_name || f.name || '');
  HB.AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.weba';
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

  /** Folder tree of a Files tile: folders are `entries` rows (kind folder, a = name, num = parent folder id, 0 = top). */
  HB.folderCur = {}; // content tile id -> folder id that is open (in memory only)
  function folderTools(ctx) {
    const folders = ctx.items('entries').filter((e) => e.kind === 'folder');
    const byId = {};
    folders.forEach((f) => { byId[f.id] = f; });
    const parentOf = (f) => (byId[f.num] && f.num !== f.id ? f.num : 0); // a missing parent counts as the top level
    const byName = (a, b) => a.a.localeCompare(b.a, undefined, { numeric: true, sensitivity: 'base' }) || a.id - b.id;
    const chain = (id) => { const out = []; for (let n = 0; id && byId[id] && n < 50; n++, id = parentOf(byId[id])) out.unshift(byId[id]); return out; };
    return {
      folders, byId, parentOf, chain,
      kids: (id) => folders.filter((f) => parentOf(f) === id).sort(byName),
      pathOf: (id) => chain(id).map((f) => f.a).join(' / '),
      /** Folder a file really sits in (a deleted folder's files show at the top level). */
      folderOf: (f) => (byId[f.folder_id] ? f.folder_id : 0),
    };
  }

  /** Menu children "Top level / A / A / B…" for moving something; `skip(folder)` leaves some out. */
  function folderTargets(fx, current, skip, onPick) {
    const out = [];
    if (current !== 0) out.push({ label: '📁 Top level', onClick: () => onPick(0) });
    const walk = (parent, depth) => fx.kids(parent).forEach((f) => {
      if (skip && skip(f)) return;
      if (f.id !== current) out.push({ label: '\u2003'.repeat(depth) + '📁 ' + f.a, onClick: () => onPick(f.id) });
      walk(f.id, depth + 1);
    });
    walk(0, 0);
    return out;
  }

  function menu(f, fx) {
    const items = [
      { label: 'Open / preview', onClick: () => HB.preview(f) },
      { label: 'Download', onClick: () => { location.href = url(f, true); } },
      { label: 'Rename', onClick: () => { const el = document.querySelector('.file[data-id="' + f.id + '"] .file-name'); if (el) el.dispatchEvent(new Event('rename')); } },
      { label: 'Colour & tags…', onClick: () => HB.editMeta('files', f, { title: 'File colour and tags' }) },
    ];
    if (fx) {
      const dirs = folderTargets(fx, fx.folderOf(f), null, (id) => S.update('files', f.id, { folder_id: id }, { label: 'move file' }));
      if (dirs.length) items.push({ label: 'Move to folder', children: dirs });
    }
    const to = HB.moveTargets('files', f, ['files', 'music']).filter((m) => true);
    if (to.length) items.push({ label: 'Move to tile', children: to });
    items.push({ sep: true }, { label: 'Delete', danger: true, onClick: () => S.remove('files', f.id, { label: 'delete file' }) });
    return items;
  }

  function fileEl(f, view, fx) {
    const name = h('span', { class: 'file-name', text: f.original_name, title: 'Click to open' });
    const thumb = isImage(f)
      ? h('img', { class: 'thumb', src: url(f), loading: 'lazy', alt: '', draggable: false })
      : h('span', { class: 'thumb icon', text: icon(f) });
    const el = h('div', {
      class: 'file', dataset: { id: f.id, color: f.colour || '', audio: isAudio(f) ? '1' : '0' },
      oncontextmenu: (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, menu(f, fx)); },
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

  /** One folder row. It is also a drop target: drag a file onto it to move the file in. */
  function folderEl(ctx, fd, fx, go, dropOpts, body, tree) {
    const own = fx.folders.filter((x) => fx.parentOf(x) === fd.id).length;
    const nFiles = ctx.items('files').filter((f) => fx.folderOf(f) === fd.id).length;
    const name = h('span', { class: 'file-name', text: fd.a, title: 'Open folder' });
    const count = (nFiles ? nFiles + (nFiles === 1 ? ' file' : ' files') : '') + (own ? (nFiles ? ' · ' : '') + own + (own === 1 ? ' folder' : ' folders') : '');
    const rename = () => HB.ui.inlineEdit(name, { value: fd.a, max: 255, onSave: (v) => S.update('entries', fd.id, { a: v }, { label: 'rename folder' }), onCancel: () => HB.board.reconcile(true) });
    const el = h('div', {
      class: 'file folder' + (tree ? ' tree-head' + (tree.selected ? ' selected' : '') : ''), dataset: { folder: fd.id, tile: ctx.id },
      oncontextmenu: (e) => {
        e.preventDefault();
        const moves = folderTargets(fx, fx.parentOf(fd), (t) => t.id === fd.id || fx.chain(t.id).some((c) => c.id === fd.id),
          (id) => S.update('entries', fd.id, { num: id }, { label: 'move folder' }));
        HB.ui.menu(e.clientX, e.clientY, [
          { label: tree ? (tree.open ? 'Collapse' : 'Expand') : 'Open', onClick: () => (tree ? tree.toggle(fd.id) : go(fd.id)) },
          { label: 'Rename', onClick: rename },
          ...(moves.length ? [{ label: 'Move to folder', children: moves }] : []),
          { sep: true }, { label: 'Delete folder (files move up)', danger: true, onClick: () => removeFolder(ctx, fd, fx) },
        ]);
      },
      onclick: (e) => { if (e.target.closest('button,input') || HB.justDragged()) return; if (tree) tree.select(fd.id); else go(fd.id); },
    },
    tree ? h('button', { type: 'button', class: 'tree-twist', text: tree.open ? '▾' : '▸', title: tree.open ? 'Collapse' : 'Expand', 'aria-label': tree.open ? 'Collapse folder' : 'Expand folder', onclick: () => tree.toggle(fd.id) }) : null,
    h('span', { class: 'thumb icon', text: tree && tree.open ? '📂' : '📁' }),
    h('div', { class: 'file-info' }, name, h('div', { class: 'file-meta', text: count || 'Empty' })),
    h('button', { class: 'x', title: 'Delete folder (its files move up)', 'aria-label': 'Delete folder', text: '×', onclick: () => removeFolder(ctx, fd, fx) }));
    name.addEventListener('rename', rename);
    name.addEventListener('dblclick', (e) => { e.stopPropagation(); rename(); });
    HB.sortable(body, el, dropOpts);
    return el;
  }

  /** Tree view: which folders are expanded (kept per Files tile, remembered in this browser). */
  HB.folderOpen = {};
  const openKey = (id) => 'hb:fopen:' + id;
  function openSet(id) {
    if (!HB.folderOpen[id]) {
      let v = {};
      try { v = JSON.parse(localStorage.getItem(openKey(id)) || '{}') || {}; } catch (e) { v = {}; }
      HB.folderOpen[id] = v;
    }
    return HB.folderOpen[id];
  }
  function saveOpen(id) { try { localStorage.setItem(openKey(id), JSON.stringify(HB.folderOpen[id] || {})); } catch (e) { /* private window: stays in memory */ } }
  /** Menu actions: open or close every folder of a tile (id = content tile id, tileId = displayed tile). */
  HB.fileTree = {
    expandAll(id, tileId) { const o = openSet(id); S.entriesOf(id, 'folder').forEach((f) => { o[f.id] = true; }); saveOpen(id); HB.board.redrawTile(tileId); },
    collapseAll(id, tileId) { HB.folderOpen[id] = {}; saveOpen(id); HB.board.redrawTile(tileId); },
  };

  /** Delete a folder: what is inside (files and sub-folders) moves up one level, so nothing is lost. */
  function removeFolder(ctx, fd, fx) {
    const up = fx.parentOf(fd);
    HB.history.run('delete folder', () => {
      ctx.items('files').filter((f) => f.folder_id === fd.id).forEach((f) => S.update('files', f.id, { folder_id: up }));
      fx.folders.filter((x) => x.num === fd.id).forEach((x) => S.update('entries', x.id, { num: up }));
      S.remove('entries', fd.id, { label: 'delete folder' });
    });
    if ((HB.folderCur[ctx.id] || 0) === fd.id) HB.folderCur[ctx.id] = up;
  }

  /** opt.folders: show the folder tree (Files tile). Without it this is the flat list the Music tile uses. */
  /** Hierarchy view: every folder is expandable in place, several can be open at once. */
  function treeEl(ctx, fx, all, cur, dropOpts, body) {
    const open = openSet(ctx.id);
    const redraw = () => HB.board.redrawTile(ctx.tile.id);
    const act = {
      toggle: (id) => { if (open[id]) delete open[id]; else open[id] = true; saveOpen(ctx.id); redraw(); },
      select: (id) => { HB.folderCur[ctx.id] = id; if (!open[id]) { open[id] = true; saveOpen(ctx.id); } redraw(); },
    };
    const filesBox = (id) => {
      const box = h('div', { class: 'files list tree-files', dataset: { tile: ctx.id, folder: id } });
      all.filter((f) => fx.folderOf(f) === id).forEach((f) => box.append(fileEl(f, 'list', fx)));
      HB.sortable(body, box, {
        group: 'files', draggable: '[data-id]',
        onDrop: (evt) => HB.listDrop('files', evt, (c) => ({ tile_id: Number(c.dataset.tile), folder_id: Number(c.dataset.folder || 0) })),
        onTrash: dropOpts.onTrash,
      });
      return box;
    };
    const branch = (parent) => {
      const wrap = h('div', { class: 'tree-kids' });
      fx.kids(parent).forEach((fd) => {
        const isOpen = !!open[fd.id];
        wrap.append(folderEl(ctx, fd, fx, null, dropOpts, body, { open: isOpen, selected: fd.id === cur, toggle: act.toggle, select: act.select }));
        if (isOpen) wrap.append(branch(fd.id));
      });
      wrap.append(filesBox(parent));
      return wrap;
    };
    const root = h('div', { class: 'file folder tree-head tree-root' + (cur === 0 ? ' selected' : ''), dataset: { folder: 0, tile: ctx.id }, onclick: (e) => { if (!HB.justDragged()) { HB.folderCur[ctx.id] = 0; redraw(); } } },
      h('span', { class: 'thumb icon', text: '🗂' }),
      h('div', { class: 'file-info' }, h('span', { class: 'file-name', text: 'All files' }), h('div', { class: 'file-meta', text: all.length + (all.length === 1 ? ' file' : ' files') + (fx.folders.length ? ' · ' + fx.folders.length + (fx.folders.length === 1 ? ' folder' : ' folders') : '') })));
    HB.sortable(body, root, dropOpts);
    return h('div', { class: 'tree' }, root, branch(0));
  }

  HB.fileTileRender = function (body, ctx, opt) {
    opt = opt || {};
    const view = ctx.settings.view === 'grid' ? 'grid' : 'list';
    const fx = opt.folders ? folderTools(ctx) : null;
    const tree = !!(fx && ctx.settings.tree);
    let cur = fx ? HB.folderCur[ctx.id] || 0 : 0;
    if (fx && cur && !fx.byId[cur]) cur = HB.folderCur[ctx.id] = 0; // the open folder was deleted
    const go = (id) => { HB.folderCur[ctx.id] = id; HB.board.redrawTile(ctx.tile.id); };
    const all = ctx.items('files').filter((f) => !opt.audioOnly || isAudio(f));
    const files = fx ? all.filter((f) => fx.folderOf(f) === cur) : all;
    const dropOpts = {
      group: 'files', draggable: '[data-id]', sort: false,
      onDrop: (evt) => HB.listDrop('files', evt, (c) => ({ tile_id: Number(c.dataset.tile), folder_id: Number(c.dataset.folder || 0) })),
      onTrash: (item) => S.remove('files', Number(item.dataset.id), { label: 'delete file' }),
    };
    const list = h('div', { class: 'files ' + view, dataset: { tile: ctx.id, folder: cur } });
    files.forEach((f) => list.append(fileEl(f, view, fx)));
    if (!files.length) list.append(h('div', { class: 'empty small no-drag', text: cur ? 'This folder is empty. Drop files here or press Upload.' : 'Drop files here or press Upload.' }));
    const input = h('input', { type: 'file', multiple: true, hidden: true, onchange: () => { HB.upload.files(Array.from(input.files), ctx.id); input.value = ''; } });
    const bar = h('div', { class: 'file-bar' },
      h('button', { class: 'btn small btn-upload', text: '⬆ Upload', onclick: () => input.click() }), input,
      fx ? h('button', { class: 'btn small ghost btn-folder', text: '📁 New folder', title: 'New folder' + (cur ? ' in ' + fx.pathOf(cur) : ''), onclick: async () => {
        const v = await HB.ui.form({ title: 'New folder' + (cur ? ' in ' + fx.pathOf(cur) : ''), submit: 'Create', fields: [{ name: 'name', label: 'Folder name', value: '', placeholder: 'e.g. Receipts' }] });
        const name = v && String(v.name || '').trim();
        if (name) HB.createEntry(ctx, 'folder', { a: name.slice(0, 255), num: cur });
      } }) : null,
      fx ? h('button', { class: 'btn small ghost btn-tree', text: tree ? '☰ List' : '🌳 Tree', title: tree ? 'Back to one folder at a time' : 'Show all folders as a tree: open several at once',
        onclick: () => HB.setTileSettings(ctx.id, { tree: !tree }) }) : null,
      h('span', { class: 'muted small', text: tree ? 'Uploads → ' + (cur ? fx.pathOf(cur) : 'All files') : files.length + (files.length === 1 ? ' file' : ' files') }));
    body.append(bar);
    if (tree) { body.append(treeEl(ctx, fx, all, cur, dropOpts, body)); return; }
    if (fx && cur) { // breadcrumb: every step is a drop target too
      const crumb = (id, label, last) => {
        const c = h('button', { type: 'button', class: 'crumb' + (last ? ' here' : ''), text: label, dataset: { folder: id, tile: ctx.id }, disabled: last, onclick: () => { if (!HB.justDragged()) go(id); } });
        if (!last) HB.sortable(body, c, dropOpts);
        return c;
      };
      const trail = fx.chain(cur);
      const nav = h('div', { class: 'crumbs' }, crumb(0, '📁 All files', false));
      trail.forEach((f, i) => nav.append(h('span', { class: 'sep', text: '›' }), crumb(f.id, f.a, i === trail.length - 1)));
      body.append(nav);
    }
    if (fx) {
      const subs = fx.kids(cur);
      if (subs.length) {
        const row = h('div', { class: 'files folders ' + view });
        subs.forEach((fd) => row.append(folderEl(ctx, fd, fx, go, dropOpts, body)));
        body.append(row);
      }
    }
    body.append(list);
    HB.sortable(body, list, {
      group: 'files', draggable: '[data-id]',
      put: (to, from, item) => to.el.dataset.accept !== 'audio' || item.dataset.audio === '1',
      onDrop: (evt) => HB.listDrop('files', evt, (c) => ({ tile_id: Number(c.dataset.tile), folder_id: Number(c.dataset.folder || 0) })),
      onTrash: dropOpts.onTrash,
    });
  };
})();
