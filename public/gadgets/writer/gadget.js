(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;
  const E = HB.editor; // sanitizer, rich editor, code editor: js/editor.js (shared with the Writer folder)
  const LANGS = E.LANGS;
  const sanitizeToString = E.sanitizeToString;
  const download = E.download;

  const STARTER = '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <style>\n    body { font-family: system-ui, sans-serif; padding: 16px; }\n    button { padding: 6px 14px; }\n  </style>\n</head>\n<body>\n  <h1>Hello</h1>\n  <button id="b">Click me</button>\n  <p id="out"></p>\n  <script>\n    let n = 0;\n    document.getElementById(\'b\').onclick = () => {\n      document.getElementById(\'out\').textContent = \'Clicked \' + (++n) + \' times\';\n    };\n  </script>\n</body>\n</html>\n';
  const MODES = { rich: 'Rich text', web: 'HTML + JS', code: 'Code' };

  // ===== the gadget ===================================================================================
  HB.gadgets.define('writer', class extends HB.Gadget {
    static defaults() { return { mode: 'rich' }; }

    mode(ctx) { return MODES[(ctx || this.ctx).settings.mode] ? (ctx || this.ctx).settings.mode : 'rich'; }
    doc(ctx, mode) { return S.entriesOf((ctx || this.ctx).id, 'doc').find((e) => (e.data || {}).mode === mode) || null; }

    // redraw only when what is shown changes, and never while you are typing
    sig(ctx) { const m = this.mode(ctx), d = this.doc(ctx, m); return [m, ctx.settings.lang || '', ctx.settings.autorun !== false, d ? [d.id, d.a] : null]; }
    keep() {
      const a = document.activeElement;
      const inside = a && a.closest && a.closest('.tile[data-tile="' + this.tileId + '"]') && a.matches('.wr-rich, .wr-ta, .wr-source, .wr-fi');
      return !!this.timer || !!inside;
    }
    destroy() { if (this.timer) this.flush(); }

    /** Save the current mode's text (debounced; creates the row on first save). */
    saveSoon(value) {
      this.pending = value;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 700);
      if (this.status) this.status.textContent = 'Typing…';
    }
    async flush() {
      clearTimeout(this.timer);
      this.timer = null;
      if (this.pending === undefined) return;
      const ctx = this.ctx;
      if (!ctx) return;
      const mode = this.mode(ctx);
      const value = mode === 'rich' ? sanitizeToString(this.pending) : this.pending;
      this.pending = undefined;
      const row = this.doc(ctx, mode);
      if (row) { if (row.a !== value) S.update('entries', row.id, { a: value }, { record: false }); }
      else {
        if (!this.creating) {
          this.creating = S.create('entries', { tile_id: ctx.id, kind: 'doc', a: value, data: { mode } }, { record: false })
            .catch((e) => HB.ui.toast('Could not save: ' + e.message, { type: 'error' }));
        }
        await this.creating;
        this.creating = null;
        const r = this.doc(ctx, mode);
        if (r && r.a !== value) S.update('entries', r.id, { a: value }, { record: false });
      }
      HB.board.markRendered(this.tileId);
      if (this.status) this.status.textContent = 'Saved';
      if (this.afterSave) this.afterSave();
    }

    render(body, ctx) {
      const mode = this.mode(ctx);
      const row = this.doc(ctx, mode);
      this.status = h('span', { class: 'muted small wr-status', text: row ? 'Saved' : '' }); // rich text swaps in the editor's own
      const wrap = h('div', { class: 'wr wr-mode-' + mode });
      body.append(wrap);
      const tabs = h('div', { class: 'seg wr-modes' }, Object.entries(MODES).map(([k, v]) => h('button', {
        type: 'button', class: 'seg-btn' + (k === mode ? ' on' : ''), text: v, disabled: this.readOnly && k !== mode,
        onclick: async () => { if (k !== mode) { await this.flush(); this.save({ mode: k }, 'writer mode'); } },
      })));
      if (mode === 'rich') this.renderRich(wrap, ctx, row, tabs);
      else if (mode === 'web') this.renderWeb(wrap, ctx, row, tabs);
      else this.renderCode(wrap, ctx, row, tabs);
      wrap.addEventListener('focusout', (e) => { if (!wrap.contains(e.relatedTarget) && this.timer) this.flush(); });
    }

    // ---- rich text ----------------------------------------------------------------------------
    renderRich(wrap, ctx, row, tabs) {
      const rich = E.rich({
        value: row ? row.a : '', readOnly: this.readOnly,
        onChange: (html) => this.saveSoon(html),
        upload: async (file, progress) => {
          const f = await HB.upload.one(file, ctx.id, progress);
          S.addFileRows([f]);
          HB.board.markRendered(this.tileId);
          return 'file.php?id=' + f.id;
        },
      });
      this.status = rich.status;
      rich.status.textContent = row ? 'Saved' : '';
      HB.onCleanup(wrap.parentNode, () => rich.destroy());
      wrap.append(h('div', { class: 'wr-top' }, tabs), rich.el);
    }

    // ---- HTML + JS ----------------------------------------------------------------------------
    renderWeb(wrap, ctx, row, tabs) {
      const st = ctx.settings;
      const auto = st.autorun !== false;
      const frame = h('iframe', { class: 'wr-frame', title: 'Preview', referrerpolicy: 'no-referrer',
        sandbox: 'allow-scripts allow-modals allow-popups allow-forms allow-downloads' });
      const empty = h('div', { class: 'empty small wr-frame-empty', text: 'Write HTML (with <style> and <script>) and press Run.' });
      const run = async () => {
        await this.flush();
        const r = this.doc(this.ctx, 'web');
        if (!r) { empty.hidden = false; frame.hidden = true; return; }
        empty.hidden = true; frame.hidden = false;
        frame.src = HB.api.url('g/writer/run', { id: r.id, t: Date.now() }); // served sandboxed: scripts cannot touch Home Base
      };
      this.afterSave = auto ? run : null;
      const ed = E.code(row ? row.a : '', 'html', { readOnly: this.readOnly, onRun: run, placeholder: 'Type HTML here, or press Starter',
        onInput: (v) => this.saveSoon(v) });
      const tools = h('div', { class: 'wr-tools-plain' },
        h('button', { class: 'btn small primary', type: 'button', text: '▶ Run', title: 'Save and run (Ctrl+Enter)', onclick: run }),
        this.readOnly ? null : h('label', { class: 'wr-auto small' }, h('input', { type: 'checkbox', checked: auto,
          onchange: (e) => this.save({ autorun: e.target.checked }, 'auto-run') }), ' Auto-run'),
        this.readOnly ? null : h('button', { class: 'btn small', type: 'button', text: 'Starter page', onclick: () => {
          const go = () => { ed.ta.value = STARTER; ed.ta.dispatchEvent(new Event('input')); run(); };
          if (!ed.ta.value.trim()) { go(); return; }
          HB.ui.confirm({ title: 'Replace the code?', message: 'The current code is replaced by a small starter page.', confirm: 'Replace' }).then((ok) => { if (ok) go(); });
        } }),
        h('button', { class: 'btn small ghost', type: 'button', text: 'Open in new tab ↗', onclick: async () => {
          await this.flush(); const r = this.doc(this.ctx, 'web'); if (r) window.open(HB.api.url('g/writer/run', { id: r.id }), '_blank', 'noopener');
        } }),
        h('button', { class: 'btn small ghost', type: 'button', text: '⬇', title: 'Download .html', onclick: () => download((ctx.tile.title || 'page') + '.html', ed.ta.value, 'text/html') }));
      const panes = h('div', { class: 'wr-panes' }, this.readOnly ? null : ed.el, h('div', { class: 'wr-preview' }, frame, empty));
      wrap.append(h('div', { class: 'wr-top' }, tabs, this.status), tools, panes);
      if (row) run(); else { frame.hidden = true; }
    }

    // ---- code ----------------------------------------------------------------------------------
    renderCode(wrap, ctx, row, tabs) {
      const lang = LANGS[ctx.settings.lang] ? ctx.settings.lang : 'js';
      const ed = E.code(row ? row.a : '', lang, { readOnly: this.readOnly, onInput: (v) => this.saveSoon(v), placeholder: '// code' });
      const sel = h('select', { class: 'wr-lang', title: 'Language', disabled: this.readOnly,
        onchange: async (e) => { await this.flush(); this.save({ lang: e.target.value }, 'language'); } },
      Object.entries(LANGS).map(([k, v]) => h('option', { value: k, text: v.name, selected: k === lang })));
      const lines = h('span', { class: 'muted small', text: (ed.ta.value.match(/\n/g) || []).length + 1 + ' lines' });
      ed.ta.addEventListener('input', () => { lines.textContent = (ed.ta.value.match(/\n/g) || []).length + 1 + ' lines'; });
      const tools = h('div', { class: 'wr-tools-plain' }, sel,
        h('button', { class: 'btn small', type: 'button', text: 'Copy', onclick: () => navigator.clipboard.writeText(ed.ta.value).then(() => HB.ui.toast('Copied'), () => HB.ui.toast('Copy failed', { type: 'error' })) }),
        h('button', { class: 'btn small ghost', type: 'button', text: '⬇', title: 'Download', onclick: () => download((ctx.tile.title || 'code') + '.' + LANGS[lang].ext, ed.ta.value, 'text/plain') }),
        lines);
      wrap.append(h('div', { class: 'wr-top' }, tabs, this.status), tools, ed.el);
    }

    menu(tile, ctx) {
      const mode = this.mode(ctx);
      const folders = HB.readOnly ? [] : S.tilesOf(tile.scenario_id).filter((t) => t.type === 'library' && !(t.settings && t.settings.shared_from));
      const items = [
        { label: 'Mode', children: Object.entries(MODES).map(([k, v]) => ({ label: v, checked: k === mode,
          onClick: async () => { await this.flush(); this.save({ mode: k }, 'writer mode'); } })) },
        { label: 'Download', children: [
          { label: mode === 'rich' ? 'Web page (.html)' : 'File', onClick: () => this.download(ctx, mode, false) },
          mode === 'rich' ? { label: 'Plain text (.txt)', onClick: () => this.download(ctx, mode, true) } : null,
        ] },
      ];
      if (mode === 'rich') items.push({ label: 'Print / save as PDF…', onClick: async () => { await this.flush(); const r = this.doc(ctx, 'rich'); if (r) E.print(ctx.tile.title || 'Document', r.a); else HB.ui.toast('Nothing written yet'); } });
      if (mode !== 'web' && folders.length) {
        items.push({ sep: true }, { label: 'Move into a Writer folder', children: folders.map((f) => ({ label: f.title || 'Writer folder', onClick: () => this.moveInto(tile, ctx, mode, f) })) });
      }
      return items;
    }

    download(ctx, mode, text) {
      const r = this.doc(ctx, mode);
      if (!r) { HB.ui.toast('Nothing written yet'); return; }
      const name = E.fileName(ctx.tile.title || 'writer');
      if (mode === 'rich') { if (text) download(name + '.txt', E.toText(r.a), 'text/plain'); else download(name + '.html', E.page(name, r.a), 'text/html'); }
      else if (mode === 'web') download(name + '.html', r.a, 'text/html');
      else download(name + '.' + (LANGS[ctx.settings.lang] || LANGS.js).ext, r.a, 'text/plain');
    }

    /** Turn this Writer into a page of a Writer folder (its pictures go along), then remove the tile (trash keeps it 30 days). */
    async moveInto(tile, ctx, mode, folder) {
      await this.flush();
      const r = this.doc(ctx, mode);
      const ok = await HB.ui.confirm({ title: 'Move into "' + (folder.title || 'Writer folder') + '"?',
        message: 'This text becomes a page of that folder and this tile is removed (it stays in the trash for 30 days).', confirm: 'Move' });
      if (!ok) return;
      const siblings = S.entriesOf(folder.id, 'page');
      const named = tile.title && tile.title !== HB.typeInfo.writer.label; // a tile still called "Writer" gets the first line of its text as title
      const first = r && mode === 'rich' ? E.toText(r.a).split('\n')[0].slice(0, 60) : '';
      const page = await HB.safeCreate('entries', { tile_id: folder.id, kind: 'page', a: r ? r.a : '', b: (named ? tile.title : first || 'Untitled').slice(0, 120), num: 0,
        position: siblings.reduce((m, x) => Math.max(m, x.position + 1), 0), data: mode === 'code' ? { t: 'code', lang: ctx.settings.lang || 'js' } : { t: 'page' } }, 'move into folder');
      if (!page) return;
      HB.history.run('move into folder', () => {
        this.items('files').forEach((f) => S.update('files', f.id, { tile_id: folder.id }));
        S.remove('tiles', tile.id, { label: 'delete tile' });
      });
      HB.ui.toast('Moved into the folder');
    }
  });
})();
