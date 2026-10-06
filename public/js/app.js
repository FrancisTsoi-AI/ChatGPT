(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const app = (HB.app = {
    scenarioId: null,

    // ---- scenarios / tabs --------------------------------------------------------------------
    pickInitial() {
      const list = S.scenarios();
      let id = null;
      try { id = Number(localStorage.getItem('hb:active')) || null; } catch (e) { /* ignore */ }
      if (!id) id = Number(S.setting('active_scenario', 0)) || null;
      return list.some((s) => s.id === id) ? id : (list[0] && list[0].id) || null;
    },

    showScenario(id) {
      if (!S.get('scenarios', id)) return;
      const changed = id !== this.scenarioId;
      this.scenarioId = id;
      try { localStorage.setItem('hb:active', String(id)); } catch (e) { /* ignore */ }
      if (changed && Number(S.setting('active_scenario', 0)) !== id) S.setSetting('active_scenario', String(id));
      HB.board.show(id);
      this.renderTabs();
    },

    renderTabs() {
      const nav = document.getElementById('tabs');
      const list = S.scenarios();
      if (!list.some((s) => s.id === this.scenarioId) && list.length) { this.showScenario(list[0].id); return; }
      const sig = JSON.stringify([list.map((s) => [s.id, s.name]), this.scenarioId]);
      if (nav._sig === sig) return;
      if (nav.querySelector('.inline-edit')) return; // do not disturb a rename in progress
      nav._sig = sig;
      if (nav._sortable) { nav._sortable.destroy(); nav._sortable = null; }
      nav.replaceChildren();
      list.forEach((s, i) => {
        const label = h('span', { class: 'tab-label', text: s.name });
        const tab = h('button', {
          class: 'tab' + (s.id === this.scenarioId ? ' active' : ''), role: 'tab', 'aria-selected': s.id === this.scenarioId, dataset: { id: s.id },
          title: (i < 9 ? 'Key ' + (i + 1) + ' · ' : '') + 'double-click to rename',
          onclick: () => { if (!HB.justDragged()) this.showScenario(s.id); },
          ondblclick: () => this.renameScenario(s.id, label),
          oncontextmenu: (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, this.scenarioMenu(s.id, label)); },
        }, label);
        nav.append(tab);
      });
      nav.append(h('button', { class: 'tab add', title: 'New scenario', 'aria-label': 'New scenario', text: '+', onclick: () => this.newScenario() }));
      nav._sortable = Sortable.create(nav, {
        animation: 150, draggable: '.tab:not(.add)', filter: '.add', forceFallback: true, fallbackOnBody: true, fallbackTolerance: 4,
        delay: 150, delayOnTouchOnly: true, direction: 'horizontal', preventOnFilter: false,
        onStart() { HB.drag.active++; },
        onEnd() {
          HB.drag.active = Math.max(0, HB.drag.active - 1);
          HB.drag.endedAt = Date.now();
          const ids = HB.$$('.tab[data-id]', nav).map((t) => Number(t.dataset.id));
          S.reorder('scenarios', ids);
          nav._sig = null;
          this.renderTabs();
        },
      });
    },

    scenarioMenu(id, label) {
      const list = S.scenarios();
      const i = list.findIndex((s) => s.id === id);
      return [
        { label: 'Rename', onClick: () => this.renameScenario(id, label) },
        { label: 'Move left', disabled: i <= 0, onClick: () => this.moveScenario(id, -1) },
        { label: 'Move right', disabled: i >= list.length - 1, onClick: () => this.moveScenario(id, 1) },
        { sep: true },
        { label: 'Delete scenario', danger: true, disabled: list.length <= 1, onClick: () => this.deleteScenario(id) },
      ];
    },

    renameScenario(id, label) {
      const s = S.get('scenarios', id);
      if (!s) return;
      const el = label || document.querySelector('.tab[data-id="' + id + '"] .tab-label');
      HB.ui.inlineEdit(el, { value: s.name, max: 80, onSave: (v) => { S.update('scenarios', id, { name: v }, { label: 'rename scenario' }); }, onCancel: () => { document.getElementById('tabs')._sig = null; this.renderTabs(); } });
    },

    moveScenario(id, dir) {
      const ids = S.scenarios().map((s) => s.id);
      const i = ids.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      S.reorder('scenarios', ids);
    },

    async newScenario() {
      const v = await HB.ui.form({ title: 'New scenario', fields: [{ name: 'name', label: 'Name', required: true, max: 80, placeholder: 'e.g. Home, Reading list' }] });
      if (!v) return;
      const row = await HB.safeCreate('scenarios', { name: v.name }, 'add scenario');
      if (row) this.showScenario(row.id);
    },

    async deleteScenario(id) {
      const s = S.get('scenarios', id);
      const n = S.tilesOf(id).length;
      if (!(await HB.ui.confirm({ title: 'Delete "' + s.name + '"?', message: 'It and its ' + n + ' tile(s) go to the trash and can be restored for 30 days.', confirm: 'Delete', danger: true }))) return;
      S.remove('scenarios', id, { label: 'delete scenario' });
    },

    // ---- theme -------------------------------------------------------------------------------
    applyTheme(t) {
      const root = document.documentElement;
      if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
      try { if (t === 'light' || t === 'dark') localStorage.setItem('hb:theme', t); else localStorage.removeItem('hb:theme'); } catch (e) { /* ignore */ }
    },
    setTheme(t) { this.applyTheme(t); S.setSetting('theme', t); },
    theme() { return S.setting('theme', 'auto'); },

    // ---- commands (menu + Ctrl+K) -------------------------------------------------------------
    commands() {
      const cmds = [];
      S.scenarios().forEach((s, i) => cmds.push({ label: 'Go to ' + s.name, hint: i < 9 ? 'scenario · key ' + (i + 1) : 'scenario', run: () => this.showScenario(s.id) }));
      Object.entries(HB.typeInfo).forEach(([t, i]) => cmds.push({ label: 'Add tile: ' + i.label, hint: i.hint, run: () => HB.board.addTile(t) }));
      cmds.push(
        { label: 'New scenario', hint: 'add a tab', run: () => this.newScenario() },
        { label: 'Undo', hint: 'Ctrl+Z', run: () => HB.history.undo() },
        { label: 'Redo', hint: 'Ctrl+Shift+Z', run: () => HB.history.redo() },
        { label: 'Open trash', hint: 'restore deleted items', run: () => HB.trash.open() },
        { label: 'Theme: light', hint: 'appearance', run: () => this.setTheme('light') },
        { label: 'Theme: dark', hint: 'appearance', run: () => this.setTheme('dark') },
        { label: 'Theme: follow system', hint: 'appearance', run: () => this.setTheme('auto') },
        { label: 'Backup: download JSON', hint: 'all data, no files', run: () => { location.href = 'export.php?format=json'; } },
        { label: 'Backup: download zip with files', hint: 'data + uploaded files', run: () => { location.href = 'export.php?format=zip'; } },
        { label: 'Sync now', hint: 'reload from server', run: () => this.syncNow() },
        { label: 'Keyboard shortcuts', hint: 'help', run: () => this.shortcuts() },
        { label: 'Sign out', hint: 'this device', run: () => this.logout() },
      );
      return cmds;
    },

    async syncNow() {
      await S.flush();
      await S.sync(true);
      HB.board.reconcile(true);
      HB.ui.toast('Synced');
    },

    shortcuts() {
      const rows = [['1 – 9', 'Switch scenario'], ['Ctrl/⌘ + K', 'Search and commands'], ['Ctrl/⌘ + Z', 'Undo'], ['Ctrl/⌘ + Shift + Z  or  Ctrl + Y', 'Redo'],
        ['Double-click a title / tab', 'Rename'], ['Right-click anything', 'Context menu'], ['Drag a tile by its title', 'Move it'], ['Drag any tile edge or corner', 'Resize it'],
        ['Drop on 🗑 Trash', 'Delete (restore within 30 days)'], ['Drop files anywhere', 'Upload']];
      HB.ui.modal({ title: 'Keyboard & mouse', content: h('table', { class: 'keys' }, rows.map((r) => h('tr', {}, h('th', { text: r[0] }), h('td', { text: r[1] })))), actions: [{ label: 'Close', primary: true }] });
    },

    async logout() {
      await S.flush();
      try { await HB.api.logout(); } catch (e) { /* ignore */ }
      S.clearCache();
      try { localStorage.removeItem('hb:active'); } catch (e) { /* ignore */ }
      location.reload();
    },

    addMenu(btn) {
      HB.ui.menuAt(btn, Object.entries(HB.typeInfo).map(([t, i]) => ({ label: i.icon + '  ' + i.label, hint: '', onClick: () => HB.board.addTile(t) })));
    },

    mainMenu(btn) {
      const theme = this.theme();
      HB.ui.menuAt(btn, [
        { label: 'Undo', hint: 'Ctrl+Z', disabled: !HB.history.canUndo(), onClick: () => HB.history.undo() },
        { label: 'Redo', hint: 'Ctrl+Shift+Z', disabled: !HB.history.canRedo(), onClick: () => HB.history.redo() },
        { sep: true },
        { label: 'Trash…', onClick: () => HB.trash.open() },
        { label: 'Theme', children: [['auto', 'Follow system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => ({ label: l, checked: theme === v, onClick: () => this.setTheme(v) })) },
        { label: 'Backup', children: [
          { label: 'Download data (JSON)', onClick: () => { location.href = 'export.php?format=json'; } },
          { label: 'Download data + files (zip)', onClick: () => { location.href = 'export.php?format=zip'; } },
        ] },
        { label: 'Sync now', onClick: () => this.syncNow() },
        { label: 'Keyboard & mouse help', onClick: () => this.shortcuts() },
        { sep: true },
        { label: 'Sign out', onClick: () => this.logout() },
      ]);
    },

    // ---- boot ---------------------------------------------------------------------------------
    start() {
      S.init();
      HB.board.init();
      HB.player.init();
      HB.upload.initDrop();
      HB.trash.init();

      const stateEl = document.getElementById('save-state');
      const labels = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved…', error: 'Offline: retrying' };
      let online = true;
      const paint = () => {
        stateEl.textContent = !online && S.status === 'saved' ? 'Offline' : labels[S.status];
        stateEl.dataset.state = !online && S.status === 'saved' ? 'error' : S.status;
      };
      HB.bus.on('status', paint);
      HB.bus.on('online', (o) => { online = o; paint(); });

      HB.bus.on('data', (d) => {
        if (d.kind === 'setting' || d.kind === 'sync') {
          const t = this.theme();
          if (t !== this._theme) { this._theme = t; this.applyTheme(t); }
        }
        this.renderTabs();
      });

      document.getElementById('btn-add').addEventListener('click', (e) => this.addMenu(e.currentTarget));
      document.getElementById('btn-menu').addEventListener('click', (e) => this.mainMenu(e.currentTarget));
      document.getElementById('btn-search').addEventListener('click', () => HB.search.open());
      document.addEventListener('keydown', (e) => this.onKey(e));

      const first = () => {
        this._theme = this.theme();
        if (this._theme !== 'auto') this.applyTheme(this._theme);
        this.showScenario(this.pickInitial());
      };
      if (S.ready) first();
      S.sync(true).then(() => {
        if (!S.ready) { HB.ui.toast('Could not reach the server. Check your connection and reload.', { type: 'error', timeout: 0 }); return; }
        if (!S.fromCache || !this.scenarioId) first(); else this.renderTabs();
        document.getElementById('board-wrap').classList.remove('loading');
      });
      if (!S.ready) document.getElementById('board-wrap').classList.add('loading');

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { S.sync(); HB.board.reconcile(true); }
      });
      window.addEventListener('focus', () => S.sync());
      window.addEventListener('online', () => { S.flush(); S.sync(); });
      setInterval(() => { if (document.visibilityState === 'visible') S.sync(); }, 30000);
    },

    onKey(e) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); HB.search.open(); return; }
      if (HB.isTyping() || HB.modalCount) return;
      if (mod && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? HB.history.redo() : HB.history.undo(); return; }
      if (mod && !e.altKey && e.key.toLowerCase() === 'y') { e.preventDefault(); HB.history.redo(); return; }
      if (!mod && !e.altKey && /^[1-9]$/.test(e.key)) {
        const s = S.scenarios()[Number(e.key) - 1];
        if (s) { e.preventDefault(); this.showScenario(s.id); }
      }
    },
  });

  document.addEventListener('DOMContentLoaded', () => app.start());
})();
