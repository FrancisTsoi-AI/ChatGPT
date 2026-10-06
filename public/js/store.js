(function () {
  const HB = window.HB;
  const CACHE_KEY = 'hb:cache:v1';
  const TREE = { scenarios: ['tiles'], tiles: ['links', 'tasks', 'files', 'thoughts', 'entries'] };
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---- undo / redo (in-session only) -------------------------------------------------------
  const history = (HB.history = {
    stack: [], idx: 0, group: null, busy: false,
    push(entry) {
      if (this.busy) return;
      if (this.group) { this.group.push(entry); return; }
      this.stack.length = this.idx;
      this.stack.push(entry);
      if (this.stack.length > 100) this.stack.shift();
      this.idx = this.stack.length;
      HB.bus.emit('history');
    },
    /** Run fn; everything it changes becomes one undo step. */
    run(label, fn) {
      if (this.group) return fn();
      this.group = [];
      let out;
      try { out = fn(); } finally {
        const g = this.group; this.group = null;
        if (g.length) {
          this.push({
            label,
            undo: async () => { for (const e of g.slice().reverse()) await e.undo(); },
            redo: async () => { for (const e of g) await e.redo(); },
          });
        }
      }
      return out;
    },
    canUndo() { return this.idx > 0; },
    canRedo() { return this.idx < this.stack.length; },
    async undo() {
      if (!this.canUndo()) { HB.ui.toast('Nothing to undo'); return; }
      const e = this.stack[--this.idx];
      this.busy = true;
      try { await e.undo(); } finally { this.busy = false; }
      HB.ui.toast('Undid: ' + e.label);
      HB.bus.emit('history');
    },
    async redo() {
      if (!this.canRedo()) { HB.ui.toast('Nothing to redo'); return; }
      const e = this.stack[this.idx++];
      this.busy = true;
      try { await e.redo(); } finally { this.busy = false; }
      HB.ui.toast('Redid: ' + e.label);
      HB.bus.emit('history');
    },
  });

  // ---- store -------------------------------------------------------------------------------
  const S = (HB.store = {
    data: { scenarios: [], tiles: [], links: [], tasks: [], files: [], thoughts: [], entries: [], settings: {}, limits: {} },
    ready: false, fromCache: false,
    rev: 0, ops: [], chain: Promise.resolve(), timer: null, retryMs: 0,
    status: 'saved', syncing: false, sig: '', removed: {},

    // -- reading --
    get(type, id) { return this.data[type].find((r) => r.id === id) || null; },
    scenarios() { return this.data.scenarios.slice().sort((a, b) => a.position - b.position || a.id - b.id); },
    tilesOf(sid) { return this.data.tiles.filter((t) => t.scenario_id === sid).sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id); },
    itemsOf(type, tileId) {
      const rows = this.data[type].filter((r) => r.tile_id === tileId);
      if (type === 'thoughts') return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id));
      return rows.sort((a, b) => a.position - b.position || a.id - b.id);
    },
    /** Entries of one kind (cards, quotes, ...) in a tile, in position order. */
    entriesOf(tileId, kind) {
      return this.data.entries.filter((r) => r.tile_id === tileId && r.kind === kind).sort((a, b) => a.position - b.position || a.id - b.id);
    },
    /** The tile that owns the content: a shared mirror points at another tile (null if that one is gone). */
    contentTile(tile) {
      const from = tile.settings && tile.settings.shared_from;
      if (!from) return tile;
      return this.get('tiles', from);
    },
    setting(key, dflt) { const v = this.data.settings[key]; return v === undefined || v === null ? dflt : v; },

    // -- lifecycle --
    init() {
      try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (c && Array.isArray(c.scenarios) && c.scenarios.length) {
          Object.assign(this.data, c);
          this.ready = this.fromCache = true;
        }
      } catch (e) { /* no cache */ }
    },
    clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ } },
    _cache: HB.debounce(function () {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(S.data)); } catch (e) { /* quota: skip */ }
    }, 400),
    _touch() { this.rev++; this._cache(); },
    _setStatus(s) { if (s !== this.status) { this.status = s; HB.bus.emit('status', s); } },

    /** Re-read everything from the server (tab focus, every 30 s, after restores). */
    async sync(force) {
      if (this.syncing) return;
      if (!force && (this.ops.length || HB.drag.active || this.status === 'saving')) return;
      this.syncing = true;
      const rev = this.rev;
      try {
        const st = await HB.api.state();
        if (rev !== this.rev || this.ops.length) return; // a local change happened meanwhile; next sync catches up
        delete st.server_time;
        const sig = JSON.stringify(st);
        const first = !this.ready;
        if (sig !== this.sig || first) {
          this.sig = sig;
          this.data = st;
          this.ready = true;
          this._cache();
          HB.bus.emit('data', { kind: 'sync' });
        }
        if (this.status === 'error') this._setStatus('saved');
        HB.bus.emit('online', true);
      } catch (e) {
        HB.bus.emit('online', false);
      } finally { this.syncing = false; }
    },

    // -- saving --
    _queue(op) {
      if (op.op === 'update') {
        for (let i = this.ops.length - 1; i >= 0; i--) {
          const o = this.ops[i];
          if (o.type === op.type && o.id === op.id) {
            if (o.op === 'update') { Object.assign(o.data, op.data); this._schedule(1000); return; }
            break;
          }
        }
      }
      this.ops.push(op);
      this._schedule(op.op === 'update' || op.op === 'setting' ? 1000 : 250);
    },
    _schedule(ms) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), ms);
      this._setStatus('unsaved');
    },
    flush() { return this._send([]).then(() => {}, () => {}); },
    /** Send pending ops plus `extra` in one transaction; returns the results of `extra`. */
    _send(extra) {
      const run = async () => {
        clearTimeout(this.timer);
        const batch = this.ops.splice(0);
        const all = batch.concat(extra);
        if (!all.length) { if (!this.ops.length) this._setStatus('saved'); return []; }
        this._setStatus('saving');
        try {
          const res = await HB.api.batch(all);
          this.retryMs = 0;
          this._setStatus(this.ops.length ? 'unsaved' : 'saved');
          HB.bus.emit('saved', all);
          return res.results.slice(batch.length);
        } catch (e) {
          if (e.status >= 400 && e.status < 500 && ![401, 403, 408, 429].includes(e.status)) {
            // The server refused this batch: drop it and realign with the server's truth.
            HB.ui.toast('A change could not be saved: ' + e.message, { type: 'error' });
            this._setStatus(this.ops.length ? 'unsaved' : 'saved');
            setTimeout(() => this.sync(true), 50);
            throw e;
          }
          this.ops.unshift(...batch); // network trouble or server error: keep, retry with backoff
          this.retryMs = Math.min(30000, (this.retryMs || 2000) * 2);
          this._setStatus('error');
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.flush(), this.retryMs);
          if (extra.length) throw e;
          return [];
        }
      };
      const p = this.chain.then(run);
      this.chain = p.catch(() => {});
      return p;
    },
    /** Best effort when the page is being closed. */
    flushOnLeave() {
      if (!this.ops.length) return;
      try { HB.api.batch(this.ops.slice(), true).catch(() => {}); } catch (e) { /* ignore */ }
    },
    hasPending() { return this.ops.length > 0 || this.status === 'saving'; },

    // -- writing (all optimistic except create) --
    update(type, id, patch, opt) {
      const row = this.get(type, id);
      if (!row) return;
      const before = {}, change = {};
      for (const k of Object.keys(patch)) {
        if (!same(row[k], patch[k])) { before[k] = clone(row[k]); change[k] = clone(patch[k]); }
      }
      if (!Object.keys(change).length) return;
      Object.assign(row, clone(change));
      this._queue({ op: 'update', type, id, data: clone(change) });
      if (!opt || opt.record !== false) {
        history.push({
          label: (opt && opt.label) || 'edit',
          undo: () => this.update(type, id, before, { record: false }),
          redo: () => this.update(type, id, change, { record: false }),
        });
      }
      this._touch();
      HB.bus.emit('data', { kind: 'update', type, id });
    },

    /** Set `position` (0..n) in the given order, plus optional extra fields for every moved id. */
    reorder(type, ids, extra) {
      history.run('reorder', () => {
        ids.forEach((id, i) => this.update(type, id, Object.assign({ position: i }, extra && extra[id] ? extra[id] : {})));
      });
    },

    async create(type, data, opt) {
      const [res] = await this._send([{ op: 'create', type, data: clone(data) }]);
      const row = res.row;
      this.data[type].push(row);
      this._touch();
      HB.bus.emit('data', { kind: 'create', type, id: row.id });
      if (!opt || opt.record !== false) {
        const id = row.id;
        history.push({
          label: (opt && opt.label) || 'add',
          undo: () => this.remove(type, id, { record: false }),
          redo: () => this.restore(type, id),
        });
      }
      return row;
    },

    /** Create several rows in one request (one undo step). */
    async createMany(type, list, opt) {
      if (!list.length) return [];
      const res = await this._send(list.map((data) => ({ op: 'create', type, data: clone(data) })));
      const rows = res.map((r) => r.row);
      rows.forEach((r) => this.data[type].push(r));
      this._touch();
      HB.bus.emit('data', { kind: 'create', type });
      if (!opt || opt.record !== false) {
        const ids = rows.map((r) => r.id);
        history.push({
          label: (opt && opt.label) || 'add',
          undo: () => { ids.forEach((id) => this.remove(type, id, { record: false })); },
          redo: () => { ids.forEach((id) => this.restore(type, id)); },
        });
      }
      return rows;
    },

    _detach(type, id) {
      const out = [];
      const row = this.get(type, id);
      if (!row) return out;
      this.data[type] = this.data[type].filter((r) => r.id !== id);
      out.push([type, row]);
      const kids = TREE[type] || [];
      kids.forEach((kt) => {
        const col = type === 'scenarios' ? 'scenario_id' : 'tile_id';
        this.data[kt].filter((r) => r[col] === id).forEach((k) => { out.push(...this._detach(kt, k.id)); });
      });
      return out;
    },

    remove(type, id, opt) {
      if (type === 'scenarios' && this.data.scenarios.length <= 1) { HB.ui.toast('You cannot delete the last scenario', { type: 'error' }); return; }
      const tree = this._detach(type, id);
      if (!tree.length) return;
      this.removed[type + ':' + id] = tree;
      this._queue({ op: 'delete', type, id });
      if (!opt || opt.record !== false) {
        history.push({
          label: (opt && opt.label) || 'delete',
          undo: () => this.restore(type, id),
          redo: () => this.remove(type, id, { record: false }),
        });
      }
      this._touch();
      HB.bus.emit('data', { kind: 'remove', type, id });
    },

    /** Undo of a delete: put the detached rows back and tell the server. */
    restore(type, id) {
      const tree = this.removed[type + ':' + id];
      if (!tree) { return this.restoreRemote(type, id); }
      delete this.removed[type + ':' + id];
      tree.forEach(([t, r]) => this.data[t].push(r));
      this._queue({ op: 'restore', type, id });
      this._touch();
      HB.bus.emit('data', { kind: 'restore', type, id });
    },

    /** Restore something from the trash dialog (works after a reload). */
    async restoreRemote(type, id) {
      await this._send([{ op: 'restore', type, id }]);
      await this.sync(true);
    },
    async purgeRemote(items) {
      await this._send(items.map((i) => ({ op: 'purge', type: i.type, id: i.id })));
    },

    setSetting(key, value) {
      this.data.settings[key] = value;
      this._queue({ op: 'setting', key, value });
      this._touch();
      HB.bus.emit('data', { kind: 'setting', key });
    },

    addFileRows(rows) {
      rows.forEach((r) => { if (!this.get('files', r.id)) this.data.files.push(r); });
      this._touch();
      HB.bus.emit('data', { kind: 'create', type: 'files' });
    },
  });

  window.addEventListener('pagehide', () => { S.flushOnLeave(); });
  window.addEventListener('beforeunload', (e) => {
    if (S.hasPending()) { e.preventDefault(); e.returnValue = ''; }
  });
})();
