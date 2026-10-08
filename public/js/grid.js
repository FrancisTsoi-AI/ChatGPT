(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const ROW = 72, MARGIN = 6;
  const SIZES = [['Small', 3, 3], ['Medium', 4, 4], ['Large', 6, 6], ['Wide', 8, 5], ['Full width', 12, 5]];

  const board = (HB.board = {
    el: null, grid: null, entries: new Map(), scenarioId: null, mobile: false,
    silent: 0, raf: 0, force: false, skipChange: false,

    init() {
      this.el = document.getElementById('board');
      const mq = window.matchMedia('(max-width: 899px)');
      this.mobile = mq.matches;
      mq.addEventListener('change', () => { this.mobile = mq.matches; this.rebuild(); });
      this.build();
      this.el.addEventListener('focusout', () => { if (this.needRender) this.reconcile(); });
      // on a share page the gadgets' own right-click menus (edit, delete…) are off; the browser's menu shows instead
      if (HB.readOnly) this.el.addEventListener('contextmenu', (e) => { if (!e.target.closest('.tile-head')) e.stopPropagation(); }, true);
      // double-click (or double-tap) on empty space: a new Writer right there
      const wrapEl = document.getElementById('board-wrap');
      const blank = (t) => !t.closest('.grid-stack-item, .tile-wrap, .tile, button, a, input, textarea, select, [contenteditable]');
      wrapEl.addEventListener('dblclick', (e) => { if (blank(e.target)) { e.preventDefault(); this.quickWriter(e.clientX, e.clientY); } });
      let lastTap = null;
      wrapEl.addEventListener('pointerup', (e) => {
        if (e.pointerType !== 'touch' || !blank(e.target)) { lastTap = null; return; }
        const now = Date.now();
        if (lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { lastTap = null; this.quickWriter(e.clientX, e.clientY); return; }
        lastTap = { t: now, x: e.clientX, y: e.clientY };
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.maxId && !HB.modalCount && !document.querySelector('.menu,.popover')) { e.preventDefault(); this.restoreMax(); }
      });
    },

    build() {
      this.el.className = this.mobile ? 'mobile-list' : 'grid-stack';
      if (this.mobile) {
        this.grid = null;
        if (HB.readOnly) return;
        HB.sortable({ _cleanups: [] }, this.el, {
          group: 'tiles-mobile', handle: '.tile-head', draggable: '.tile-wrap', filter: 'button,input,textarea',
          put: false,
          onTrash: (item) => S.remove('tiles', Number(item.dataset.tile)),
          onDrop: (evt) => {
            const ids = Array.from(this.el.children).filter((c) => c.dataset.tile).map((c) => Number(c.dataset.tile));
            HB.history.run('reorder tiles', () => ids.forEach((id, i) => {
              const t = S.get('tiles', id);
              if (t) S.update('tiles', id, { settings: Object.assign({}, t.settings, { m_order: i }) });
            }));
          },
        });
        return;
      }
      this.grid = GridStack.init({
        column: 12, cellHeight: ROW, margin: MARGIN, float: false, animate: true,
        disableOneColumnMode: true, handle: '.tile-head', staticGrid: !!HB.readOnly,
        draggable: { handle: '.tile-head' },
        resizable: { handles: 'n,e,s,w,ne,nw,se,sw' },
      }, this.el);
      this.grid.on('change', (e, nodes) => {
        if (this.silent || this.skipChange || !nodes) return;
        HB.history.run('move tile', () => {
          nodes.forEach((n) => {
            const id = Number(n.id);
            if (S.get('tiles', id)) S.update('tiles', id, { x: n.x, y: n.y, width: n.w, height: n.h }, { label: 'move tile' });
          });
        });
      });
      this.grid.on('dragstart resizestart', () => { HB.drag.active++; HB.trash.dragging(true); });
      this.grid.on('resizestop', () => { HB.drag.active = Math.max(0, HB.drag.active - 1); HB.trash.dragging(false); this.reconcile(); });
      this.grid.on('dragstop', (e, el) => {
        HB.drag.active = Math.max(0, HB.drag.active - 1);
        HB.drag.endedAt = Date.now();
        HB.trash.dragging(false);
        if (e && HB.trash.hit(e)) {
          this.skipChange = true;
          setTimeout(() => { this.skipChange = false; }, 50);
          S.remove('tiles', Number(el.getAttribute('gs-id')), { label: 'delete tile' });
        }
        this.reconcile();
      });
    },

    rebuild() {
      this.clear();
      if (this.grid) { this.grid.destroy(false); this.grid = null; }
      this.el.replaceChildren();
      this.build();
      this.reconcile(true);
    },

    clear() {
      if (this.maxId) this.restoreMax();
      this.entries.forEach((en) => { HB.runCleanups(en.body); HB.gadgets.drop(en.id); });
      this.entries.clear();
      if (this.grid) { this.silent++; this.grid.removeAll(true); this.silent--; } else this.el.replaceChildren();
    },

    show(sid) {
      if (this.scenarioId === sid && this.entries.size) { this.reconcile(); return; }
      this.scenarioId = sid;
      this.clear();
      this.reconcile(true);
      window.scrollTo(0, 0);
    },

    /** Make the DOM match the store (rAF-throttled). `force` rebuilds every tile body. */
    reconcile(force) {
      if (force) this.force = true;
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = 0; this._reconcile(); });
    },

    _reconcile() {
      if (!this.el || this.scenarioId === null) return;
      if (HB.drag.active) { this.needRender = true; return; }
      const force = this.force;
      this.force = false;
      this.needRender = false;
      const tiles = S.tilesOf(this.scenarioId);
      const ids = new Set(tiles.map((t) => t.id));
      for (const [id, en] of Array.from(this.entries)) if (!ids.has(id)) this.removeEntry(id, en);
      this.silent++;
      try {
        tiles.forEach((t) => {
          const en = this.entries.get(t.id);
          if (!en) this.addEntry(t); else this.updateEntry(en, t, force);
        });
        if (this.mobile) this.sortMobile(tiles);
      } finally { this.silent--; }
      document.getElementById('empty-hint').hidden = tiles.length > 0;
    },

    sortMobile(tiles) {
      const order = tiles.slice().sort((a, b) => {
        const ma = a.settings.m_order, mb = b.settings.m_order;
        if (ma !== undefined && mb !== undefined && ma !== mb) return ma - mb;
        return a.y - b.y || a.x - b.x || a.id - b.id;
      });
      order.forEach((t, i) => {
        const en = this.entries.get(t.id);
        if (en && this.el.children[i] !== en.el) this.el.insertBefore(en.el, this.el.children[i] || null);
      });
    },

    // -- tile chrome ---------------------------------------------------------------------------
    addEntry(tile) {
      const info = HB.typeInfo[tile.type] || { icon: '▫', label: tile.type };
      const titleEl = h('span', { class: 'tile-title', title: 'Double-click to rename' });
      const menuBtn = h('button', { class: 'tile-btn', 'aria-label': 'Tile menu', title: 'Tile menu', text: '⋯',
        onclick: (e) => { e.stopPropagation(); HB.ui.menuAt(menuBtn, this.tileMenu(tile.id)); } });
      const maxBtn = h('button', { class: 'tile-btn max-btn', 'aria-label': 'Enlarge tile', title: 'Enlarge / restore (Esc)', text: '⤢',
        onclick: (e) => { e.stopPropagation(); this.toggleMax(tile.id); } });
      const head = h('div', { class: 'tile-head' }, h('span', { class: 'tile-icon', text: info.icon }), titleEl, maxBtn, menuBtn);
      const body = h('div', { class: 'tile-body' });
      const content = h('div', { class: (this.mobile ? '' : 'grid-stack-item-content ') + 'tile', dataset: { type: tile.type, color: tile.colour || '', tile: tile.id } }, head, body);
      let item;
      if (this.mobile) {
        item = h('div', { class: 'tile-wrap', dataset: { tile: tile.id }, style: { height: tile.height * ROW + (tile.height - 1) * MARGIN + 'px' } }, content);
        this.el.append(item);
      } else {
        item = h('div', { class: 'grid-stack-item', 'gs-id': tile.id, 'gs-x': tile.x, 'gs-y': tile.y, 'gs-w': tile.width, 'gs-h': tile.height, 'gs-min-w': 1, 'gs-min-h': 1 }, content);
        this.el.append(item);
        this.grid.makeWidget(item);
      }
      const en = { id: tile.id, el: item, content, head, body, titleEl, sig: null };
      this.entries.set(tile.id, en);
      titleEl.addEventListener('dblclick', () => this.renameTile(tile.id));
      content.addEventListener('contextmenu', (e) => {
        if (e.defaultPrevented) return;
        e.preventDefault();
        HB.ui.menu(e.clientX, e.clientY, this.tileMenu(tile.id));
      });
      this.setChrome(en, tile);
      this.renderBody(en, tile);
    },

    setChrome(en, tile) {
      const label = tile.title || (HB.typeInfo[tile.type] || {}).label || tile.type;
      const shared = tile.settings && tile.settings.shared_from;
      if (en.titleEl.textContent !== label) en.titleEl.textContent = label;
      en.titleEl.classList.toggle('placeholder', !tile.title);
      en.content.dataset.color = tile.colour || '';
      en.content.classList.toggle('mirror', !!shared);
      en.content.dataset.w = tile.width;
      en.content.dataset.h = tile.height;
      en.head.title = shared ? 'Shared tile: edits change the original' : '';
    },

    updateEntry(en, tile, force) {
      this.setChrome(en, tile);
      if (this.mobile) en.el.style.height = tile.height * ROW + (tile.height - 1) * MARGIN + 'px';
      else {
        const n = en.el.gridstackNode;
        if (n && (n.x !== tile.x || n.y !== tile.y || n.w !== tile.width || n.h !== tile.height)) {
          this.grid.update(en.el, { x: tile.x, y: tile.y, w: tile.width, h: tile.height });
        }
      }
      this.renderBody(en, tile, force);
    },

    renderBody(en, tile, force) {
      const sig = HB.tileSig(tile);
      if (!force && sig === en.sig) return;
      const gadget = HB.gadgets.instance(tile);
      let keep = false;
      try { keep = !force && !!gadget && gadget.keep(HB.tileCtx(tile)); } catch (e) { console.error(e); }
      if (keep) return; // e.g. a note being typed in
      const body = en.body;
      const active = document.activeElement;
      if (!force && active && body.contains(active) && active.classList.contains('inline-edit')) { this.needRender = true; return; }
      let focus = null;
      if (active && body.contains(active) && active.dataset && active.dataset.key) {
        focus = { key: active.dataset.key, value: active.value, s: active.selectionStart, e: active.selectionEnd };
      }
      const scroll = body.scrollTop;
      HB.runCleanups(body);
      body.replaceChildren();
      const ctx = HB.tileCtx(tile);
      if (!gadget) body.append(HB.gadgetMissing(tile));
      else if (!ctx.src) HB.missingSource(body, tile);
      else { try { gadget.render(body, ctx); } catch (e) { console.error(e); body.append(h('div', { class: 'empty', text: 'This tile failed to draw.' })); } }
      body.scrollTop = scroll;
      if (focus) {
        const el = body.querySelector('[data-key="' + focus.key + '"]');
        if (el) { el.value = focus.value; el.focus({ preventScroll: true }); try { el.setSelectionRange(focus.s, focus.e); } catch (e) { /* not text */ } }
      }
      en.sig = sig;
      HB.bus.emit('rendered', tile.id);
    },

    /** Rebuild one tile's body now (a gadget whose async work finished). */
    redrawTile(id) {
      const en = this.entries.get(id), t = S.get('tiles', id);
      if (en && t) this.renderBody(en, t, true);
    },

    /** A tile that just saved its own change says "I am up to date", so it is not redrawn under the user's hands. */
    markRendered(id) {
      const en = this.entries.get(id), t = S.get('tiles', id);
      if (en && t) en.sig = HB.tileSig(t);
    },

    // -- enlarge / restore -------------------------------------------------------------------
    maxId: null,
    toggleMax(id) {
      if (this.maxId === id) { this.restoreMax(); return; }
      if (this.maxId) this.restoreMax();
      const en = this.entries.get(id);
      if (!en) return;
      this.maxId = id;
      en.content.classList.add('max');
      document.body.classList.add('has-max');
      const back = h('div', { id: 'max-back', class: 'max-back', onclick: () => this.restoreMax() });
      document.getElementById('layer').append(back);
      if (this.grid) { this.grid.enableMove(false); this.grid.enableResize(false); }
      const btn = HB.$('.max-btn', en.head);
      if (btn) { btn.textContent = '⤡'; btn.title = 'Restore (Esc)'; }
      window.dispatchEvent(new Event('resize'));
    },
    restoreMax() {
      const en = this.entries.get(this.maxId);
      this.maxId = null;
      const back = document.getElementById('max-back');
      if (back) back.remove();
      document.body.classList.remove('has-max');
      if (this.grid) { this.grid.enableMove(true); this.grid.enableResize(true); }
      if (en) {
        en.content.classList.remove('max');
        const btn = HB.$('.max-btn', en.head);
        if (btn) { btn.textContent = '⤢'; btn.title = 'Enlarge / restore (Esc)'; }
      }
      window.dispatchEvent(new Event('resize'));
    },
    /** Grow or shrink a tile by one grid step (keeps its position). */
    step(id, d) {
      const t = S.get('tiles', id);
      if (!t) return;
      const w = Math.max(1, Math.min(12, t.width + d)), hh = Math.max(1, t.height + d);
      S.update('tiles', id, { width: w, height: hh }, { label: d > 0 ? 'enlarge tile' : 'shrink tile' });
    },

    removeEntry(id, en) {
      if (this.maxId === id) this.restoreMax();
      HB.runCleanups(en.body);
      HB.gadgets.drop(id);
      this.entries.delete(id);
      this.silent++;
      if (this.grid) this.grid.removeWidget(en.el, true); else en.el.remove();
      this.silent--;
    },

    // -- actions -------------------------------------------------------------------------------
    renameTile(id) {
      if (HB.readOnly) return;
      const en = this.entries.get(id);
      const tile = S.get('tiles', id);
      if (!en || !tile) return;
      HB.ui.inlineEdit(en.titleEl, { value: tile.title, max: 120, allowEmpty: true, onSave: (v) => S.update('tiles', id, { title: v }, { label: 'rename tile' }), onCancel: () => this.reconcile(true) });
    },

    /** Add a Writer at the grid cell under a screen point (it may float up into free space). */
    async quickWriter(cx, cy) {
      if (HB.readOnly || this.scenarioId === null || !HB.gadgets.has('writer')) return;
      const size = HB.gadgets.size('writer');
      let x = 0, y = this.nextY();
      if (this.grid) {
        const r = this.el.getBoundingClientRect();
        x = Math.max(0, Math.min(12 - size.w, Math.floor(((cx - r.left) / r.width) * 12 - size.w / 2)));
        y = Math.max(0, Math.floor((cy - r.top) / ROW));
      }
      const row = await this.addTile('writer', { x, y });
      if (!row) return;
      for (let i = 0; i < 40; i++) { // wait for it to be drawn, then put the caret in it
        const ed = document.querySelector('.tile[data-tile="' + row.id + '"] .wr-rich');
        if (ed) { ed.focus(); return; }
        await new Promise((r) => setTimeout(r, 50));
      }
    },

    nextY() { return S.tilesOf(this.scenarioId).reduce((m, t) => Math.max(m, t.y + t.height), 0); },

    async addTile(type, extra) {
      if (!HB.gadgets.has(type)) { HB.ui.toast('The “' + type + '” gadget is not installed or switched off (⋯ → Gadgets).', { type: 'error' }); return null; }
      const size = HB.gadgets.size(type);
      const info = HB.typeInfo[type];
      const row = await HB.safeCreate('tiles', Object.assign({
        scenario_id: this.scenarioId, type, x: 0, y: this.nextY(), width: size.w, height: size.h, title: info.label,
        settings: HB.gadgets.defaults(type),
      }, extra || {}), 'add tile');
      if (row) { this.reconcile(true); setTimeout(() => this.flash(row.id), 80); }
      return row;
    },

    flash(id) {
      const en = this.entries.get(id);
      if (!en) return;
      en.content.classList.add('flash');
      en.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => en.content.classList.remove('flash'), 1400);
    },

    /** Tile under a screen point (for file drops). */
    tileAt(x, y) {
      const el = document.elementFromPoint(x, y);
      const c = el && el.closest('.tile');
      return c ? S.get('tiles', Number(c.dataset.tile)) : null;
    },

    tileMenu(id) {
      const tile = S.get('tiles', id);
      if (!tile) return [];
      if (HB.readOnly) return [{ label: this.maxId === id ? 'Restore from enlarged' : 'Enlarge to fill the screen', hint: 'Esc', onClick: () => this.toggleMax(id) }];
      const gadget = HB.gadgets.instance(tile);
      const ctx = HB.tileCtx(tile);
      const others = S.scenarios().filter((s) => s.id !== tile.scenario_id);
      const items = [
        { label: 'Rename', onClick: () => this.renameTile(id) },
        { header: 'Colour' },
        { swatches: { value: tile.colour, onPick: (c) => S.update('tiles', id, { colour: c }, { label: 'tile colour' }) } },
      ];
      let own = [];
      try { own = gadget && ctx.src ? gadget.menu(tile, ctx) : []; } catch (e) { console.error(e); }
      if (own && own.length) items.push({ sep: true }, ...own);
      items.push({ sep: true });
      items.push({ label: this.maxId === id ? 'Restore from enlarged' : 'Enlarge to fill the screen', hint: 'Esc', onClick: () => this.toggleMax(id) });
      items.push({ label: 'Bigger', hint: '+1 step', onClick: () => this.step(id, 1) }, { label: 'Smaller', hint: '−1 step', onClick: () => this.step(id, -1) });
      items.push({ label: 'Size', children: SIZES.map(([n, w, hh]) => ({
        label: n + ' (' + w + '×' + hh + ')',
        onClick: () => S.update('tiles', id, { width: w, height: hh }, { label: 'resize tile' }),
      })) });
      if (others.length) {
        items.push({ label: 'Move to scenario', children: others.map((s) => ({
          label: s.name,
          onClick: () => S.update('tiles', id, { scenario_id: s.id, x: 0, y: 1000 }, { label: 'move tile' }),
        })) });
        if (tile.type !== 'clock' && !ctx.shared) {
          items.push({ label: 'Also show in…', hint: 'shared', children: others.map((s) => ({
            label: s.name, onClick: () => this.mirrorTo(tile, s.id),
          })) });
        }
      }
      items.push({ sep: true }, { label: 'Delete tile', danger: true, onClick: () => S.remove('tiles', id, { label: 'delete tile' }) });
      return items;
    },

    async mirrorTo(tile, sid) {
      const y = S.tilesOf(sid).reduce((m, t) => Math.max(m, t.y + t.height), 0);
      const row = await HB.safeCreate('tiles', {
        scenario_id: sid, type: tile.type, x: 0, y, width: tile.width, height: tile.height, title: tile.title,
        colour: tile.colour, settings: { shared_from: tile.id },
      }, 'share tile');
      if (row) HB.ui.toast('Shared: it now also appears in ' + S.get('scenarios', sid).name + ' (edits change both).');
    },
  });

  HB.defaultBuckets = () => [
    { id: 'urgent', name: 'Urgent' }, { id: 'later', name: 'Later' }, { id: 'brainoff', name: 'Brain-off' }, { id: 'none', name: 'No category' },
  ];

  HB.bus.on('data', () => { if (HB.board.el) HB.board.reconcile(); });
})();
