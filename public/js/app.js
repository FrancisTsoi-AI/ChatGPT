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
      if (!HB.readOnly) {
        try { localStorage.setItem('hb:active', String(id)); } catch (e) { /* ignore */ }
        if (changed && Number(S.setting('active_scenario', 0)) !== id) S.setSetting('active_scenario', String(id));
      }
      HB.board.show(id);
      this.renderTabs();
    },

    /** Share page: what is shared, until when. */
    shareBadge() {
      const el = document.getElementById('share-badge'), sh = S.data.share;
      if (!el || !sh) return;
      el.textContent = 'Shared · read-only' + (sh.expires_at ? ' · until ' + new Date(sh.expires_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
    },

    // ---- scenario groups: a folder of tabs that can be minimised and maximised ------------------------
    // Stored in the setting `scenario_groups` = {"groups":[{"id","name","collapsed"}],"of":{"<scenario id>":"<group id>"}}.
    groupData() {
      const raw = S.setting('scenario_groups', '');
      if (this._gRaw === raw && this._gData) return this._gData;
      let d = null;
      try { d = JSON.parse(raw); } catch (e) { /* no groups yet */ }
      if (!d || !Array.isArray(d.groups)) d = { groups: [], of: {} };
      if (!d.of || typeof d.of !== 'object' || Array.isArray(d.of)) d.of = {};
      d.groups = d.groups.filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string');
      this._gRaw = raw; this._gData = d;
      return d;
    },
    /** Save a changed copy of groupData(); groups nobody belongs to are dropped. */
    saveGroups(d) {
      Object.keys(d.of).forEach((k) => { if (!d.groups.some((g) => g.id === d.of[k])) delete d.of[k]; });
      d.groups = d.groups.filter((g) => Object.values(d.of).includes(g.id));
      S.setSetting('scenario_groups', JSON.stringify(d));
      const nav = document.getElementById('tabs');
      if (nav) nav._sig = null;
      this.renderTabs();
    },
    editGroups(fn) { const d = JSON.parse(JSON.stringify(this.groupData())); fn(d); this.saveGroups(d); },
    /** What the tab bar shows, left to right: single tabs and groups (a group sits where its first scenario is). */
    displayItems() {
      const d = this.groupData(), gm = new Map(d.groups.map((g) => [g.id, g]));
      const list = S.scenarios(), gid = (s) => (gm.has(d.of[s.id]) ? d.of[s.id] : null);
      const out = [], seen = new Set();
      list.forEach((s) => {
        const id = gid(s);
        if (!id) out.push({ tab: s });
        else if (!seen.has(id)) { seen.add(id); out.push({ group: gm.get(id), members: list.filter((x) => gid(x) === id) }); }
      });
      return out;
    },
    /** Scenarios in the order the tabs show them (keys 1-9 follow this). */
    orderedScenarios() { return this.displayItems().flatMap((i) => (i.tab ? [i.tab] : i.members)); },
    toggleGroup(gid, collapsed) {
      this.editGroups((d) => { const g = d.groups.find((x) => x.id === gid); if (g) g.collapsed = collapsed === undefined ? !g.collapsed : collapsed; });
    },
    setAllGroups(collapsed) { this.editGroups((d) => d.groups.forEach((g) => { g.collapsed = collapsed; })); },
    setGroup(sid, gid) { this.editGroups((d) => { if (gid) d.of[sid] = gid; else delete d.of[sid]; }); },
    async newGroup(firstId) {
      const v = await HB.ui.form({ title: 'New group of scenarios', fields: [{ name: 'name', label: 'Group name', required: true, max: 40, placeholder: 'e.g. Study, Work, Personal' }], submit: 'Create' });
      if (!v) return null;
      const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      this.editGroups((d) => { d.groups.push({ id, name: v.name, collapsed: false }); if (firstId) d.of[firstId] = id; });
      return id;
    },
    renameGroup(gid, el) {
      const g = this.groupData().groups.find((x) => x.id === gid);
      if (!g || HB.readOnly) return;
      HB.ui.inlineEdit(el, { value: g.name, max: 40, onSave: (v) => this.editGroups((d) => { const x = d.groups.find((y) => y.id === gid); if (x) x.name = v; }),
        onCancel: () => { document.getElementById('tabs')._sig = null; this.renderTabs(); } });
    },
    /** Move a whole group one step left or right among the tabs. */
    moveGroup(gid, dir) {
      const items = this.displayItems();
      const i = items.findIndex((x) => x.group && x.group.id === gid), j = i + dir;
      if (i < 0 || j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
      S.reorder('scenarios', items.flatMap((x) => (x.tab ? [x.tab] : x.members)).map((x) => x.id));
    },
    groupMenu(gid, labelEl) {
      const items = this.displayItems(), i = items.findIndex((x) => x.group && x.group.id === gid);
      const g = i >= 0 ? items[i].group : null;
      if (!g) return [];
      return [
        { label: g.collapsed ? 'Maximise: show its tabs' : 'Minimise: hide its tabs', onClick: () => this.toggleGroup(gid) },
        { label: 'Rename', onClick: () => this.renameGroup(gid, labelEl) },
        { label: 'New scenario in this group', onClick: () => this.newScenario(gid) },
        { sep: true },
        { label: 'Move left', disabled: i <= 0, onClick: () => this.moveGroup(gid, -1) },
        { label: 'Move right', disabled: i >= items.length - 1, onClick: () => this.moveGroup(gid, 1) },
        { sep: true },
        { label: 'Minimise all groups', onClick: () => this.setAllGroups(true) },
        { label: 'Maximise all groups', onClick: () => this.setAllGroups(false) },
        { sep: true },
        { label: 'Ungroup (the scenarios stay)', danger: true, onClick: () => this.editGroups((d) => { Object.keys(d.of).forEach((k) => { if (d.of[k] === gid) delete d.of[k]; }); }) },
      ];
    },

    renderTabs() {
      const nav = document.getElementById('tabs');
      const list = S.scenarios();
      if (!list.some((s) => s.id === this.scenarioId) && list.length) { this.showScenario(list[0].id); return; }
      const sig = JSON.stringify([list.map((s) => [s.id, s.name]), this.scenarioId, S.setting('scenario_groups', '')]);
      if (nav._sig === sig) return;
      if (nav.querySelector('.inline-edit')) return; // do not disturb a rename in progress
      nav._sig = sig;
      (nav._sortables || []).forEach((x) => x.destroy());
      nav._sortables = [];
      nav.replaceChildren();
      let n = 0;
      const tabEl = (s) => {
        const i = n++;
        const label = h('span', { class: 'tab-label', text: s.name });
        return h('button', {
          class: 'tab' + (s.id === this.scenarioId ? ' active' : ''), role: 'tab', 'aria-selected': s.id === this.scenarioId, dataset: { id: s.id },
          title: (i < 9 ? 'Key ' + (i + 1) + ' · ' : '') + 'double-click to rename',
          onclick: () => { if (!HB.justDragged()) this.showScenario(s.id); },
          ondblclick: () => { if (!HB.readOnly) this.renameScenario(s.id, label); },
          oncontextmenu: (e) => { if (HB.readOnly) return; e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, this.scenarioMenu(s.id, label)); },
        }, label);
      };
      this.displayItems().forEach((it) => {
        if (it.tab) { nav.append(tabEl(it.tab)); return; }
        const g = it.group, label = h('span', { class: 'tab-glabel', text: g.name });
        const chip = h('button', {
          class: 'tab-gchip', type: 'button', 'aria-expanded': !g.collapsed, title: (g.collapsed ? 'Maximise' : 'Minimise') + ' this group · double-click to rename',
          onclick: () => { if (!HB.justDragged()) this.toggleGroup(g.id); },
          ondblclick: (e) => { e.preventDefault(); this.renameGroup(g.id, label); },
          oncontextmenu: (e) => { if (HB.readOnly) return; e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, this.groupMenu(g.id, label)); },
        }, h('span', { class: 'tab-gcaret', text: g.collapsed ? '▸' : '▾' }), label, g.collapsed ? h('span', { class: 'tab-gcount', text: it.members.length }) : null);
        nav.append(h('div', { class: 'tab-group' + (g.collapsed ? ' collapsed' : ''), dataset: { gid: g.id } }, chip,
          h('div', { class: 'tab-group-in', dataset: { gid: g.id } }, it.members.map(tabEl))));
      });
      if (HB.readOnly) return; // share page: one tab, nothing to add, rename or reorder
      nav.append(h('button', { class: 'tab add', title: 'New scenario', 'aria-label': 'New scenario', text: '+', onclick: () => this.newScenario() }));
      const common = {
        animation: 150, forceFallback: true, fallbackOnBody: true, fallbackTolerance: 4, delay: 150, delayOnTouchOnly: true,
        direction: 'horizontal', preventOnFilter: false, filter: '.add',
        onStart() { HB.drag.active++; },
        onEnd: (evt) => {
          HB.drag.active = Math.max(0, HB.drag.active - 1);
          HB.drag.endedAt = Date.now();
          const ids = HB.$$('.tab[data-id]', nav).map((t) => Number(t.dataset.id));
          const moved = evt.item.classList.contains('tab') ? Number(evt.item.dataset.id) : null;
          const to = evt.to.dataset.gid || '';
          S.reorder('scenarios', ids);
          this.editGroups((d) => { if (moved) { if (to) d.of[moved] = to; else delete d.of[moved]; } }); // a tab dropped into a group joins it; dropped outside, it leaves
        },
      };
      nav._sortables.push(Sortable.create(nav, Object.assign({}, common, { draggable: '.tab:not(.add), .tab-group', group: { name: 'scenario-tabs' } })));
      HB.$$('.tab-group-in', nav).forEach((el) => nav._sortables.push(Sortable.create(el, Object.assign({}, common, {
        draggable: '.tab', group: { name: 'scenario-tabs', put: (to, from, item) => item.classList.contains('tab') },
      }))));
    },

    scenarioMenu(id, label) {
      const items = this.orderedScenarios();
      const i = items.findIndex((s) => s.id === id);
      const d = this.groupData(), cur = d.of[id];
      return [
        { label: 'Rename', onClick: () => this.renameScenario(id, label) },
        { label: 'Group', children: [
          { label: 'No group', checked: !d.groups.some((g) => g.id === cur), onClick: () => this.setGroup(id, null) },
          ...d.groups.map((g) => ({ label: g.name, checked: cur === g.id, onClick: () => this.setGroup(id, g.id) })),
          { sep: true },
          { label: 'New group…', onClick: () => this.newGroup(id) },
        ] },
        { label: 'Move left', disabled: i <= 0, onClick: () => this.moveScenario(id, -1) },
        { label: 'Move right', disabled: i >= items.length - 1, onClick: () => this.moveScenario(id, 1) },
        { sep: true },
        { label: 'Delete scenario', danger: true, disabled: items.length <= 1, onClick: () => this.deleteScenario(id) },
      ];
    },

    renameScenario(id, label) {
      const s = S.get('scenarios', id);
      if (!s) return;
      const el = label || document.querySelector('.tab[data-id="' + id + '"] .tab-label');
      HB.ui.inlineEdit(el, { value: s.name, max: 80, onSave: (v) => { S.update('scenarios', id, { name: v }, { label: 'rename scenario' }); }, onCancel: () => { document.getElementById('tabs')._sig = null; this.renderTabs(); } });
    },

    moveScenario(id, dir) {
      const ids = this.orderedScenarios().map((s) => s.id);
      const i = ids.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      S.reorder('scenarios', ids);
    },

    async newScenario(gid) {
      const v = await HB.ui.form({ title: 'New scenario', fields: [{ name: 'name', label: 'Name', required: true, max: 80, placeholder: 'e.g. Home, Reading list' }] });
      if (!v) return;
      const row = await HB.safeCreate('scenarios', { name: v.name }, 'add scenario');
      if (row && gid && this.groupData().groups.some((g) => g.id === gid)) this.editGroups((d) => { d.of[row.id] = gid; });
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
      this.orderedScenarios().forEach((s, i) => cmds.push({ label: 'Go to ' + s.name, hint: i < 9 ? 'scenario · key ' + (i + 1) : 'scenario', run: () => this.showScenario(s.id) }));
      HB.gadgets.types().forEach((t) => { const i = HB.typeInfo[t]; cmds.push({ label: 'Add tile: ' + i.label, hint: i.hint, run: () => HB.board.addTile(t) }); });
      cmds.push(
        { label: 'New scenario', hint: 'add a tab', run: () => this.newScenario() },
        { label: 'Group this scenario…', hint: 'a folder of tabs you can minimise', run: () => this.newGroup(this.scenarioId) },
        { label: 'Minimise all scenario groups', hint: 'tab bar', run: () => this.setAllGroups(true) },
        { label: 'Maximise all scenario groups', hint: 'tab bar', run: () => this.setAllGroups(false) },
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
        { label: 'Sign out on all devices', hint: 'security', run: () => this.logoutAll() },
        { label: 'Delete this scenario', hint: 'goes to the trash', run: () => this.deleteScenario(this.scenarioId) },
        { label: 'Share this scenario', hint: 'link + password', run: () => HB.shares.open(this.scenarioId) },
        { label: 'Gadgets: install, update, switch off or delete', hint: 'plug-ins', run: () => HB.gadgetAdmin.open() },
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
        ['Double-click a title / tab', 'Rename'], ['Click a tab group\'s name', 'Minimise / maximise its tabs'], ['Right-click anything', 'Context menu'], ['Drag a tile by its title', 'Move it'], ['Drag any tile edge or corner', 'Resize it'],
        ['Drop on 🗑 Trash', 'Delete (restore within 30 days)'], ['Drop files anywhere', 'Upload']];
      HB.ui.modal({ title: 'Keyboard & mouse', content: h('table', { class: 'keys' }, rows.map((r) => h('tr', {}, h('th', { text: r[0] }), h('td', { text: r[1] })))), actions: [{ label: 'Close', primary: true }] });
    },

    async logoutAll() {
      const v = await HB.ui.form({ title: 'Sign out on all devices', submit: 'Sign out everywhere', danger: true, fields: [
        { name: 'keep', label: 'Keep this device signed in', type: 'checkbox', value: false,
          hint: 'Every other phone, laptop and browser will need the passphrase again. Share links are not affected.' },
      ] });
      if (!v) return;
      await S.flush();
      try {
        const r = await HB.api.logoutAll(v.keep);
        if (v.keep) { document.querySelector('meta[name=csrf]').content = r.csrf; HB.ui.toast('All other devices are signed out.'); return; }
      } catch (e) { HB.ui.toast('Could not sign out everywhere: ' + e.message, { type: 'error' }); return; }
      S.clearCache();
      try { localStorage.removeItem('hb:active'); } catch (e) { /* ignore */ }
      location.reload();
    },

    async logout() {
      await S.flush();
      try { await HB.api.logout(); } catch (e) { /* ignore */ }
      S.clearCache();
      try { localStorage.removeItem('hb:active'); } catch (e) { /* ignore */ }
      location.reload();
    },

    addMenu(btn) {
      const items = [];
      let group = null;
      HB.gadgets.types().forEach((t) => {
        const i = HB.typeInfo[t];
        if (i.group !== group) { group = i.group; items.push({ header: group }); }
        items.push({ label: i.icon + '  ' + i.label, onClick: () => HB.board.addTile(t) });
      });
      if (!items.length) items.push({ label: 'No gadgets are installed', disabled: true });
      items.push({ sep: true }, { label: 'Install or manage gadgets…', onClick: () => HB.gadgetAdmin.open() });
      HB.ui.menuAt(btn, items);
    },

    mainMenu(btn) {
      const theme = this.theme();
      HB.ui.menuAt(btn, [
        { label: 'Undo', hint: 'Ctrl+Z', disabled: !HB.history.canUndo(), onClick: () => HB.history.undo() },
        { label: 'Redo', hint: 'Ctrl+Shift+Z', disabled: !HB.history.canRedo(), onClick: () => HB.history.redo() },
        { sep: true },
        { label: 'Trash…', onClick: () => HB.trash.open() },
        { label: 'Gadgets…', hint: 'add · remove', onClick: () => HB.gadgetAdmin.open() },
        { label: 'Share this scenario…', onClick: () => HB.shares.open(this.scenarioId) },
        { label: 'All share links…', onClick: () => HB.shares.open(null) },
        { label: 'This scenario', children: [
          { label: 'Rename…', onClick: () => this.renameScenario(this.scenarioId) },
          { label: 'New scenario…', onClick: () => this.newScenario() },
          { label: 'Put in a group…', hint: 'minimise a set of tabs', onClick: () => this.newGroup(this.scenarioId) },
          ...(this.groupData().groups.length ? [{ label: 'Minimise all groups', onClick: () => this.setAllGroups(true) }, { label: 'Maximise all groups', onClick: () => this.setAllGroups(false) }] : []),
          { label: 'Delete this scenario…', danger: true, disabled: S.scenarios().length <= 1, onClick: () => this.deleteScenario(this.scenarioId) },
        ] },
        { label: 'Theme', children: [['auto', 'Follow system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => ({ label: l, checked: theme === v, onClick: () => this.setTheme(v) })) },
        { label: 'Backup', children: [
          { label: 'Download data (JSON)', onClick: () => { location.href = 'export.php?format=json'; } },
          { label: 'Download data + files (zip)', onClick: () => { location.href = 'export.php?format=zip'; } },
        ] },
        { label: 'Sync now', onClick: () => this.syncNow() },
        { label: 'Keyboard & mouse help', onClick: () => this.shortcuts() },
        { sep: true },
        { label: 'Sign out', onClick: () => this.logout() },
        { label: 'Sign out on all devices…', danger: true, onClick: () => this.logoutAll() },
      ]);
    },

    // ---- boot ---------------------------------------------------------------------------------
    start() {
      S.init();
      HB.board.init();
      if (!HB.readOnly) { HB.upload.initDrop(); HB.trash.init(); }

      const stateEl = document.getElementById('save-state');
      const labels = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved…', error: 'Offline: retrying' };
      let online = true;
      const paint = () => {
        if (!stateEl) return;
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

      const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      on('btn-add', (e) => this.addMenu(e.currentTarget));
      on('btn-menu', (e) => this.mainMenu(e.currentTarget));
      on('btn-search', () => HB.search.open());
      on('btn-theme', () => { // share page: light / dark for this browser only
        const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
        this.applyTheme(dark ? 'light' : 'dark');
      });
      if (HB.readOnly) HB.bus.on('data', () => this.shareBadge());
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
      if (HB.readOnly) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); HB.search.open(); return; }
      if (HB.isTyping() || HB.modalCount) return;
      if (mod && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? HB.history.redo() : HB.history.undo(); return; }
      if (mod && !e.altKey && e.key.toLowerCase() === 'y') { e.preventDefault(); HB.history.redo(); return; }
      if (!mod && !e.altKey && /^[1-9]$/.test(e.key)) {
        const s = this.orderedScenarios()[Number(e.key) - 1];
        if (s) { e.preventDefault(); this.showScenario(s.id); }
      }
    },
  });

  document.addEventListener('DOMContentLoaded', () => app.start());
})();
