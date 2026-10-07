(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;
  const E = HB.editor; // rich editor + code editor, shared with the Writer (js/editor.js)

  const kindOf = (r) => (r.data && r.data.t) || 'page';
  const ICON = { folder: '📁', folderOpen: '📂', page: '📄', code: '⌨️' };
  const lsKey = (id) => 'hb:lib:' + id;

  /**
   * Writer folder: a tile that holds many documents. Rows are `entries` of kind `page`:
   *   a = the text (cleaned HTML, or code)   b = title   num = parent folder id (0 = top)   position = order among siblings
   *   data = { t: 'page' | 'code' | 'folder', lang?, open? }
   */
  HB.gadgets.define('library', class extends HB.Gadget {
    static defaults() { return {}; }

    // ---- data -------------------------------------------------------------------------------------
    rows(ctx) { return S.entriesOf((ctx || this.ctx).id, 'page'); }
    /** Rows grouped by parent (orphans, whose folder is gone, count as top level). */
    tree(ctx) {
      const rows = this.rows(ctx), ids = new Set(rows.map((r) => r.id)), kids = new Map();
      rows.forEach((r) => { const p = ids.has(r.num) && r.num !== r.id ? r.num : 0; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(r); });
      return { rows, kids, byId: new Map(rows.map((r) => [r.id, r])), of: (p) => kids.get(p) || [] };
    }
    /** Pages in the order they appear in the tree. */
    flat(t) { const out = []; const walk = (p) => t.of(p).forEach((r) => { if (kindOf(r) === 'folder') walk(r.id); else out.push(r); }); walk(0); return out; }
    descendants(t, id) { const out = []; const walk = (p) => t.of(p).forEach((r) => { out.push(r); if (kindOf(r) === 'folder') walk(r.id); }); walk(id); return out; }
    path(t, row) { const out = []; let p = t.byId.get(row.num), n = 0; while (p && n++ < 20) { out.unshift(p.b || 'Folder'); p = t.byId.get(p.num); } return out; }

    current(t) {
      let r = this.cur && t.byId.get(this.cur);
      if (!r || kindOf(r) === 'folder') {
        let saved = 0;
        try { saved = Number(localStorage.getItem(lsKey(this.tileId))) || 0; } catch (e) { /* ignore */ }
        r = (saved && t.byId.get(saved)) || null;
        if (!r || kindOf(r) === 'folder') r = this.flat(t)[0] || null;
      }
      this.cur = r ? r.id : null;
      return r;
    }
    select(id) {
      this.cur = id;
      try { localStorage.setItem(lsKey(this.tileId), String(id)); } catch (e) { /* ignore */ }
    }
    /** Called by Ctrl+K: show this page. */
    async openEntry(id) {
      const t = this.tree();
      const r = t.byId.get(id);
      if (!r || kindOf(r) === 'folder') return;
      await this.flush();
      for (let p = t.byId.get(r.num), n = 0; p && n++ < 20; p = t.byId.get(p.num)) if (!(p.data || {}).open) S.update('entries', p.id, { data: Object.assign({}, p.data, { open: true }) }, { record: false });
      this.select(id);
      this.redraw();
    }

    // ---- redraw control ---------------------------------------------------------------------------
    sig(ctx) {
      const t = this.tree(ctx), cur = this.current(t);
      return [t.rows.map((r) => [r.id, r.b, r.num, r.position, kindOf(r), (r.data || {}).open ? 1 : 0, (r.data || {}).lang || '']), cur ? [cur.id, cur.a] : null];
    }
    keep() {
      const a = document.activeElement;
      const inside = a && a.closest && a.closest('.tile[data-tile="' + this.tileId + '"]') && a.matches('.wr-rich, .wr-ta, .wr-source, .wr-fi, .lib-title');
      return !!this.pend || !!inside;
    }
    destroy() { if (this.pend) this.flush(); }

    /** Save what is being typed (debounced). `what` = {id, a} or {id, b}. */
    saveSoon(id, patch) {
      this.pend = Object.assign(this.pend && this.pend.id === id ? this.pend : { id }, patch);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 700);
      if (this.status) this.status.textContent = 'Typing…';
    }
    async flush() {
      clearTimeout(this.timer);
      this.timer = null;
      const p = this.pend;
      this.pend = null;
      if (!p) return;
      const row = S.get('entries', p.id);
      if (!row) return;
      const patch = {};
      if (p.a !== undefined) { const v = kindOf(row) === 'code' ? p.a : E.sanitizeToString(p.a); if (v !== row.a) patch.a = v; }
      if (p.b !== undefined) { const v = p.b.trim().slice(0, 120) || 'Untitled'; if (v !== row.b) patch.b = v; }
      if (Object.keys(patch).length) S.update('entries', p.id, patch, { record: false });
      HB.board.markRendered(this.tileId);
      if (this.status) this.status.textContent = 'Saved';
    }

    // ---- actions ----------------------------------------------------------------------------------
    async add(kind, parent) {
      if (this.readOnly) return;
      await this.flush();
      const t = this.tree();
      const sibs = t.of(parent || 0);
      const titles = { page: 'Untitled', code: 'Untitled code', folder: 'New folder' };
      const data = kind === 'folder' ? { t: 'folder', open: true } : kind === 'code' ? { t: 'code', lang: 'js' } : { t: 'page' };
      const row = await HB.safeCreate('entries', { tile_id: this.id, kind: 'page', a: '', b: titles[kind], num: parent || 0,
        position: sibs.reduce((m, r) => Math.max(m, r.position + 1), 0), data }, 'add ' + kind);
      if (!row) return;
      const par = parent && t.byId.get(parent);
      if (par && !(par.data || {}).open) S.update('entries', par.id, { data: Object.assign({}, par.data, { open: true }) }, { record: false });
      if (kind === 'folder') { this.renameFolder = row.id; this.redraw(); return; }
      this.select(row.id);
      this.focusTitle = true;
      this.redraw();
    }
    async remove(id) {
      const t = this.tree(), row = t.byId.get(id);
      if (!row) return;
      const all = [row].concat(kindOf(row) === 'folder' ? this.descendants(t, id) : []);
      if (all.length > 1) {
        const ok = await HB.ui.confirm({ title: 'Delete "' + (row.b || 'folder') + '"?', message: 'The folder and its ' + (all.length - 1) + ' item(s) go to the trash and can be restored for 30 days.', confirm: 'Delete', danger: true });
        if (!ok) return;
      }
      await this.flush();
      HB.history.run('delete', () => all.forEach((r) => S.remove('entries', r.id, { label: 'delete' })));
      if (all.some((r) => r.id === this.cur)) this.cur = null;
    }
    moveTo(id, parent) {
      const t = this.tree(), row = t.byId.get(id);
      if (!row || (row.num || 0) === parent) return;
      const sibs = t.of(parent);
      S.update('entries', id, { num: parent, position: sibs.reduce((m, r) => Math.max(m, r.position + 1), 0) }, { label: 'move' });
    }
    async duplicate(id) {
      await this.flush();
      const row = S.get('entries', id);
      if (!row) return;
      const copy = await HB.safeCreate('entries', { tile_id: this.id, kind: 'page', a: row.a, b: (row.b + ' (copy)').slice(0, 120), num: row.num || 0, position: row.position + 1, data: Object.assign({}, row.data) }, 'duplicate');
      if (copy) { this.select(copy.id); this.redraw(); }
    }
    download(row) {
      const name = E.fileName(row.b || 'page');
      if (kindOf(row) === 'code') E.download(name + '.' + (E.LANGS[(row.data || {}).lang] || E.LANGS.js).ext, row.a, 'text/plain');
      else E.download(name + '.html', E.page(name, row.a), 'text/html');
    }
    downloadAll() {
      const t = this.tree();
      let html = '';
      const walk = (p, d) => t.of(p).forEach((r) => {
        const title = String(r.b || '').replace(/[<&>]/g, '');
        if (kindOf(r) === 'folder') { html += '<h' + Math.min(d + 1, 3) + '>📁 ' + title + '</h' + Math.min(d + 1, 3) + '>'; walk(r.id, d + 1); }
        else if (kindOf(r) === 'code') html += '<h' + Math.min(d + 2, 4) + '>' + title + '</h' + Math.min(d + 2, 4) + '><pre>' + String(r.a).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) + '</pre>';
        else html += '<h' + Math.min(d + 2, 4) + '>' + title + '</h' + Math.min(d + 2, 4) + '>' + E.sanitizeToString(r.a);
      });
      walk(0, 0);
      E.download(E.fileName(this.tile.title || 'Writer folder') + '.html', E.page(this.tile.title || 'Writer folder', html), 'text/html');
    }
    setOpenAll(open) {
      const t = this.tree();
      HB.history.run(open ? 'expand all' : 'collapse all', () => t.rows.filter((r) => kindOf(r) === 'folder' && !!(r.data || {}).open !== open)
        .forEach((r) => S.update('entries', r.id, { data: Object.assign({}, r.data, { open }) }, { record: false })));
    }

    // ---- menus ------------------------------------------------------------------------------------
    addMenu(parent) {
      return [
        { label: '📄 New page', onClick: () => this.add('page', parent) },
        { label: '⌨️ New code page', onClick: () => this.add('code', parent) },
        { label: '📁 New folder', onClick: () => this.add('folder', parent) },
      ];
    }
    rowMenu(row, labelEl) {
      const t = this.tree(), isFolder = kindOf(row) === 'folder';
      const blocked = new Set([row.id].concat(isFolder ? this.descendants(t, row.id).map((r) => r.id) : []));
      const targets = [{ label: 'Top level', checked: !(row.num || 0), onClick: () => this.moveTo(row.id, 0) }];
      const walk = (p, d) => t.of(p).forEach((r) => {
        if (kindOf(r) !== 'folder' || blocked.has(r.id)) return;
        targets.push({ label: '  '.repeat(d) + '📁 ' + (r.b || 'Folder'), checked: row.num === r.id, onClick: () => this.moveTo(row.id, r.id) });
        walk(r.id, d + 1);
      });
      walk(0, 1);
      const items = [];
      if (isFolder) items.push(...this.addMenu(row.id).map((x) => Object.assign(x, { label: x.label + ' here' })), { sep: true });
      items.push({ label: 'Rename', onClick: () => (isFolder ? this.rename(row, labelEl) : this.pickTitle(row)) });
      if (!isFolder) items.push({ label: 'Duplicate', onClick: () => this.duplicate(row.id) }, { label: 'Download', onClick: () => this.download(row) });
      items.push({ label: 'Move to', children: targets }, { sep: true }, { label: isFolder ? 'Delete folder' : 'Delete page', danger: true, onClick: () => this.remove(row.id) });
      return items;
    }
    rename(row, el) {
      HB.ui.inlineEdit(el, { value: row.b, max: 120, onSave: (v) => S.update('entries', row.id, { b: v }, { label: 'rename' }), onCancel: () => this.redraw() });
    }
    pickTitle(row) {
      if (this.cur !== row.id) { this.select(row.id); this.focusTitle = true; this.redraw(); return; }
      const i = this.bodyEl && this.bodyEl.querySelector('.lib-title');
      if (i) { i.focus(); i.select(); }
    }

    menu() {
      if (this.readOnly) return [];
      return [
        ...this.addMenu(0),
        { sep: true },
        { label: 'Expand all folders', onClick: () => this.setOpenAll(true) },
        { label: 'Collapse all folders', onClick: () => this.setOpenAll(false) },
        { label: 'Download everything (.html)', onClick: () => this.downloadAll() },
      ];
    }

    // ---- drawing ----------------------------------------------------------------------------------
    render(body, ctx) {
      this.bodyEl = body;
      const t = this.tree(ctx), cur = this.current(t);
      const ro = this.readOnly;
      const wrap = h('div', { class: 'lib' + (this.sideOpen ? ' side-open' : '') + (this.sideHidden ? ' side-off' : '') });
      body.append(wrap);

      // sidebar: tree of folders and pages
      const list = h('ul', { class: 'lib-list', dataset: { parent: 0 } });
      const filter = h('input', { type: 'search', class: 'lib-filter', placeholder: 'Filter…', 'aria-label': 'Filter pages', autocomplete: 'off', value: this.filterText || '',
        onkeydown: (e) => e.stopPropagation(), oninput: () => { this.filterText = filter.value; applyFilter(); } });
      const lists = [list];
      const rowEl = (r) => {
        const kind = kindOf(r), folder = kind === 'folder', open = !!(r.data || {}).open;
        const label = h('span', { class: 'lib-label', text: r.b || (folder ? 'Folder' : 'Untitled'), title: r.b });
        const more = ro ? null : h('button', { type: 'button', class: 'lib-more', title: 'Menu', 'aria-label': 'Menu', text: '⋯', onclick: (e) => { e.stopPropagation(); HB.ui.menuAt(more, this.rowMenu(r, label)); } });
        const li = h('li', { class: 'lib-item' + (folder ? ' folder' : '') + (folder && open ? ' open' : ''), dataset: { id: r.id, kind } });
        const row = h('div', { class: 'lib-row' + (cur && cur.id === r.id ? ' active' : ''), role: 'button', tabindex: '0', title: r.b },
          h('span', { class: 'lib-chev', text: folder ? '▸' : '' }), h('span', { class: 'lib-ico', text: folder ? (open ? ICON.folderOpen : ICON.folder) : ICON[kind] || ICON.page }), label, more);
        const activate = async () => {
          if (HB.justDragged()) return;
          if (folder) {
            const now = !li.classList.contains('open');
            li.classList.toggle('open', now);
            row.querySelector('.lib-ico').textContent = now ? ICON.folderOpen : ICON.folder;
            if (!ro) { S.update('entries', r.id, { data: Object.assign({}, r.data, { open: now }) }, { record: false }); HB.board.markRendered(this.tileId); }
            return;
          }
          if (cur && cur.id === r.id) { this.sideOpen = false; wrap.classList.remove('side-open'); return; }
          await this.flush();
          this.select(r.id);
          this.sideOpen = false;
          this.redraw();
        };
        row.addEventListener('click', activate);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } e.stopPropagation(); });
        if (!ro) {
          row.addEventListener('dblclick', (e) => { e.preventDefault(); if (folder) this.rename(r, label); else this.pickTitle(r); });
          row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); HB.ui.menu(e.clientX, e.clientY, this.rowMenu(r, label)); });
        }
        li.append(row);
        if (folder) {
          const kids = h('ul', { class: 'lib-kids', dataset: { parent: r.id } });
          t.of(r.id).forEach((c) => kids.append(rowEl(c)));
          lists.push(kids);
          li.append(kids);
        }
        if (this.renameFolder === r.id) { this.renameFolder = null; setTimeout(() => { if (label.isConnected) this.rename(r, label); }, 30); }
        return li;
      };
      t.of(0).forEach((r) => list.append(rowEl(r)));
      if (!t.rows.length) list.append(h('li', { class: 'lib-none muted small', text: ro ? 'Nothing here yet.' : 'No pages yet. Press + New.' }));
      const applyFilter = () => {
        const q = filter.value.trim().toLowerCase();
        wrap.classList.toggle('filtering', !!q);
        const test = (li) => {
          const own = li.querySelector(':scope > .lib-row .lib-label').textContent.toLowerCase().includes(q);
          let any = false;
          li.querySelectorAll(':scope > .lib-kids > .lib-item').forEach((c) => { if (test(c)) any = true; });
          const show = !q || own || any;
          li.hidden = !show;
          return show;
        };
        list.querySelectorAll(':scope > .lib-item').forEach(test);
      };
      const addBtn = ro ? null : h('button', { type: 'button', class: 'btn small primary', text: '+ New', title: 'New page, code page or folder', onclick: (e) => HB.ui.menuAt(e.currentTarget, this.addMenu(0)) });
      const side = h('aside', { class: 'lib-side' }, h('div', { class: 'lib-side-top' }, addBtn, filter), h('div', { class: 'lib-tree' }, list));

      // main: the open page
      const main = h('section', { class: 'lib-main' });
      const toggle = h('button', { type: 'button', class: 'btn small ghost lib-toggle', title: 'Show or hide the page list', 'aria-label': 'Page list', text: '☰',
        onclick: () => { const narrow = wrap.clientWidth < 560; if (narrow) { this.sideOpen = !this.sideOpen; wrap.classList.toggle('side-open', this.sideOpen); } else { this.sideHidden = !this.sideHidden; wrap.classList.toggle('side-off', this.sideHidden); window.dispatchEvent(new Event('resize')); } } });
      if (!cur) {
        main.append(h('div', { class: 'lib-head' }, toggle),
          h('div', { class: 'empty lib-empty' }, h('p', { text: t.rows.length ? 'Pick a page on the left.' : 'This folder is empty.' }),
            ro ? null : h('div', { class: 'lib-empty-btns' }, h('button', { class: 'btn primary', type: 'button', text: '📄 New page', onclick: () => this.add('page', 0) }),
              h('button', { class: 'btn', type: 'button', text: '📁 New folder', onclick: () => this.add('folder', 0) }))));
      } else this.drawPage(main, ctx, cur, t, toggle, body);
      wrap.append(side, main);
      main.addEventListener('mousedown', (e) => { if (this.sideOpen && !e.target.closest('.lib-toggle')) { this.sideOpen = false; wrap.classList.remove('side-open'); } }, true); // a tap on the page closes the slide-over list

      // drag to reorder or move between folders; drag to the trash; nested lists share one group
      lists.forEach((l) => HB.sortable(body, l, {
        group: 'lib-' + this.tileId, draggable: '.lib-item', filter: 'input,button,.no-drag',
        onDrop: (evt) => {
          const id = Number(evt.item.dataset.id), to = Number(evt.to.dataset.parent) || 0;
          const blocked = new Set([id].concat(this.descendants(t, id).map((r) => r.id)));
          HB.listDrop('entries', evt, (c) => ({ num: Number(c.dataset.parent) || 0 }), () => {
            if (blocked.has(to)) { HB.ui.toast('A folder cannot go inside itself.'); return false; }
            return true;
          });
        },
        onTrash: (item) => this.remove(Number(item.dataset.id)),
      }));
      applyFilter();
    }

    drawPage(main, ctx, row, t, toggle, body) {
      const ro = this.readOnly, code = kindOf(row) === 'code';
      const crumbs = this.path(t, row);
      const title = ro ? h('h2', { class: 'lib-title ro', text: row.b }) : h('input', { type: 'text', class: 'lib-title', value: row.b, maxlength: 120, placeholder: 'Title', 'aria-label': 'Title', autocomplete: 'off',
        oninput: (e) => { this.saveSoon(row.id, { b: e.target.value }); const lab = this.bodyEl.querySelector('.lib-item[data-id="' + row.id + '"] > .lib-row .lib-label'); if (lab) lab.textContent = e.target.value.trim() || 'Untitled'; },
        onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const ed = main.querySelector('.wr-rich, .wr-ta'); if (ed) ed.focus(); } },
        onblur: () => { if (this.pend) this.flush(); } });
      const status = h('span', { class: 'muted small lib-status', text: '' });
      main.append(h('div', { class: 'lib-head' }, toggle, h('div', { class: 'lib-headtext' },
        crumbs.length ? h('div', { class: 'lib-crumbs muted small', text: crumbs.join(' › ') }) : null, title)));
      if (code) {
        const lang = E.LANGS[(row.data || {}).lang] ? row.data.lang : 'js';
        const ed = E.code(row.a, lang, { readOnly: ro, placeholder: '// code', onInput: (v) => this.saveSoon(row.id, { a: v }) });
        const sel = h('select', { class: 'wr-lang', title: 'Language', disabled: ro,
          onchange: async (e) => { await this.flush(); S.update('entries', row.id, { data: Object.assign({}, row.data, { lang: e.target.value }) }, { record: false }); this.redraw(); } },
        Object.entries(E.LANGS).map(([k, v]) => h('option', { value: k, text: v.name, selected: k === lang })));
        const lines = h('span', { class: 'muted small', text: (row.a.match(/\n/g) || []).length + 1 + ' lines' });
        ed.ta.addEventListener('input', () => { lines.textContent = (ed.ta.value.match(/\n/g) || []).length + 1 + ' lines'; });
        status.textContent = 'Saved';
        this.status = status;
        main.append(h('div', { class: 'wr-tools-plain' }, sel,
          h('button', { class: 'btn small', type: 'button', text: 'Copy', onclick: () => navigator.clipboard.writeText(ed.ta.value).then(() => HB.ui.toast('Copied'), () => HB.ui.toast('Copy failed', { type: 'error' })) }),
          h('button', { class: 'btn small ghost', type: 'button', text: '⬇', title: 'Download', onclick: () => this.download(Object.assign({}, row, { a: ed.ta.value })) }), lines, status), ed.el);
      } else {
        const rich = E.rich({
          value: row.a, readOnly: ro, onChange: (html) => this.saveSoon(row.id, { a: html }),
          upload: async (file, progress) => {
            const f = await HB.upload.one(file, ctx.id, progress);
            S.addFileRows([f]);
            HB.board.markRendered(this.tileId);
            return 'file.php?id=' + f.id;
          },
        });
        this.status = rich.status;
        rich.status.textContent = 'Saved';
        HB.onCleanup(body, () => rich.destroy());
        main.append(rich.el);
        if (!ro && !this.focusTitle) { /* the caret stays where the user left it: nothing to do */ }
      }
      if (this.focusTitle && !ro) { this.focusTitle = false; setTimeout(() => { const i = main.querySelector('.lib-title'); if (i && i.isConnected) { i.focus(); i.select(); } }, 30); }
    }
  });
})();
