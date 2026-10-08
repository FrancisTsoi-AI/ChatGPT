(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  // ===== safe HTML for rich text ===================================================================
  // Rich text is stored as HTML and shown inside Home Base, so it is rebuilt from a whitelist every time
  // it is saved or loaded: no scripts, no event handlers, no frames, links only to http(s)/mailto/tel.
  const ALLOWED = new Set(['P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP', 'MARK',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'IMG', 'HR',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'FONT']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH',
    'HEAD', 'TITLE', 'META', 'LINK', 'BASE', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'AUDIO', 'VIDEO', 'CANVAS', 'DIALOG']);
  const STYLE_OK = { color: 1, 'background-color': 1, 'text-align': 1, 'font-weight': 1, 'font-style': 1, 'text-decoration': 1, 'text-decoration-line': 1 };

  function safeUrl(u, img) {
    u = (u || '').trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (!img && /^(mailto:|tel:|#)/i.test(u)) return u;
    if (img && /^file\.php\?id=\d+$/.test(u)) return u;
    if (img && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(u)) return u;
    return '';
  }
  function cleanStyle(v) {
    return String(v).split(';').map((d) => {
      const i = d.indexOf(':');
      if (i < 0) return '';
      const k = d.slice(0, i).trim().toLowerCase(), val = d.slice(i + 1).trim();
      if (!STYLE_OK[k] || !val || val.length > 60 || /url\(|expression|javascript:|[<>\\]/i.test(val)) return '';
      return k + ': ' + val;
    }).filter(Boolean).join('; ');
  }
  function cleanInto(src, out) {
    src.childNodes.forEach((n) => {
      if (n.nodeType === 3) { out.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toUpperCase();
      if (DROP.has(tag)) return;
      if (!ALLOWED.has(tag)) { cleanInto(n, out); return; } // unknown wrapper: keep its text, lose the tag
      const el = document.createElement(tag === 'FONT' ? 'SPAN' : tag);
      if (tag === 'FONT' && n.getAttribute('color')) { const c = cleanStyle('color:' + n.getAttribute('color')); if (c) el.setAttribute('style', c); }
      if (tag === 'A') {
        const href = safeUrl(n.getAttribute('href'), false);
        if (href) { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      }
      if (tag === 'IMG') {
        const src = safeUrl(n.getAttribute('src'), true);
        if (!src) return;
        el.setAttribute('src', src);
        ['alt', 'width', 'height'].forEach((a) => { const v = n.getAttribute(a); if (v && /^[\w %.,-]{0,120}$/.test(v)) el.setAttribute(a, v); });
      }
      if (tag === 'TD' || tag === 'TH') ['colspan', 'rowspan'].forEach((a) => { const v = n.getAttribute(a); if (v && /^\d{1,2}$/.test(v)) el.setAttribute(a, v); });
      const st = n.getAttribute('style');
      if (st) { const c = cleanStyle(st); if (c) el.setAttribute('style', (el.getAttribute('style') ? el.getAttribute('style') + '; ' : '') + c); }
      cleanInto(n, el);
      out.appendChild(el);
    });
  }
  /** HTML string → safe DocumentFragment. DOMParser documents are inert: nothing runs, nothing loads. */
  function sanitize(html) {
    const doc = new DOMParser().parseFromString('<!doctype html><body>' + (html || ''), 'text/html');
    const frag = document.createDocumentFragment();
    cleanInto(doc.body, frag);
    return frag;
  }
  const sanitizeToString = (html) => { const d = document.createElement('div'); d.appendChild(sanitize(html)); return d.innerHTML; };
  HB.sanitizeHtml = sanitizeToString;

  // ===== code editor with live highlighting ===========================================================
  const LANGS = {
    text: { name: 'Plain text', ext: 'txt' },
    html: { name: 'HTML', ext: 'html' }, css: { name: 'CSS', ext: 'css' },
    js: { name: 'JavaScript', ext: 'js', kw: 'await async break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield' },
    python: { name: 'Python', ext: 'py', hash: true, kw: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield' },
    php: { name: 'PHP', ext: 'php', hash: true, kw: 'abstract and array as break case catch class const continue declare default do echo else elseif empty extends false final fn for foreach function global if implements include isset list match namespace new null or print private protected public readonly require return static switch throw true try use var while yield' },
    sql: { name: 'SQL', ext: 'sql', dash: true, ci: true, kw: 'add all alter and as asc between by case create default delete desc distinct drop else end exists foreign from group having if in index inner insert into is join key left like limit not null on or order outer primary references right select set table then union unique update values when where' },
    bash: { name: 'Shell', ext: 'sh', hash: true, kw: 'case cd do done echo elif else esac exit export fi for function if in local return then until while' },
    json: { name: 'JSON', ext: 'json', kw: 'true false null' },
    markdown: { name: 'Markdown', ext: 'md' },
  };
  function tokenRe(lang) {
    const L = LANGS[lang] || LANGS.text;
    if (lang === 'text' || lang === 'markdown') return null;
    const parts = [];
    if (lang === 'html') parts.push('(<!--[\\s\\S]*?-->)', '(<\\/?[A-Za-z][\\w-]*|\\/?>)', '(\\s[A-Za-z_:][\\w:.-]*(?==))');
    else if (L.hash) parts.push('(#[^\\n]*)');
    else if (L.dash) parts.push('(--[^\\n]*)');
    if (!['html', 'json'].includes(lang) && !L.dash && !L.hash) parts.push('(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)');
    if (lang === 'css') parts.push('(\\/\\*[\\s\\S]*?\\*\\/)', '([.#]?[A-Za-z_-][\\w-]*(?=\\s*\\{)|[a-z-]+(?=\\s*:))');
    parts.push('("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)', '(\\b\\d+(?:\\.\\d+)?\\b)');
    if (L.kw) parts.push('(\\b(?:' + L.kw.split(' ').join('|') + ')\\b)');
    return new RegExp(parts.join('|'), 'g' + (L.ci ? 'i' : ''));
  }
  function classFor(lang, m) {
    const t = m[0];
    if (/^(\/\/|\/\*|#|--|<!--)/.test(t) && !(lang === 'css' && /^[.#][\w-]/.test(t))) return 'c';
    if (/^["'`]/.test(t)) return 's';
    if (/^\d/.test(t)) return 'n';
    if (lang === 'html' && /^<|^\/?>$/.test(t)) return 't';
    if (lang === 'html' || lang === 'css') return /^\s/.test(t) || /^[a-z-]+$/.test(t) ? 'a' : 't';
    return 'k';
  }
  function highlight(text, lang) {
    const re = tokenRe(lang);
    if (!re) return [document.createTextNode(text)];
    const out = [];
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
      out.push(h('span', { class: 'wr-' + classFor(lang, m), text: m[0] }));
      last = re.lastIndex;
      if (m[0] === '') re.lastIndex++;
    }
    if (last < text.length) out.push(document.createTextNode(text.slice(last)));
    return out;
  }

  function codeEditor(value, lang, o) {
    const code = h('code');
    const pre = h('pre', { class: 'wr-hl', 'aria-hidden': 'true' }, code);
    const ta = h('textarea', { class: 'wr-ta', spellcheck: false, value: value || '', autocomplete: 'off', autocapitalize: 'off',
      dataset: { key: 'wr-code' }, readOnly: !!o.readOnly, placeholder: o.placeholder || '', 'aria-label': 'Code' });
    const paint = () => code.replaceChildren(...highlight(ta.value + '\n', lang));
    ta.addEventListener('input', () => { paint(); o.onInput(ta.value); });
    ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && !o.readOnly) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && o.onRun) { e.preventDefault(); o.onRun(); }
      e.stopPropagation(); // keep 1-9 / Ctrl+Z for the editor, not the board
    });
    paint();
    return { el: h('div', { class: 'wr-code' }, pre, ta), ta };
  }

  function download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const STARTER = '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <style>\n    body { font-family: system-ui, sans-serif; padding: 16px; }\n    button { padding: 6px 14px; }\n  </style>\n</head>\n<body>\n  <h1>Hello</h1>\n  <button id="b">Click me</button>\n  <p id="out"></p>\n  <script>\n    let n = 0;\n    document.getElementById(\'b\').onclick = () => {\n      document.getElementById(\'out\').textContent = \'Clicked \' + (++n) + \' times\';\n    };\n  </script>\n</body>\n</html>\n';
  const MODES = { rich: 'Rich text', web: 'HTML + JS', code: 'Code' };
  const COLORS = ['#111827', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#9333ea', '#db2777', '#6b7280'];
  const MARKS = ['transparent', '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa'];

  // ===== the gadget ===================================================================================
  HB.gadgets.define('writer', class extends HB.Gadget {
    static defaults() { return { mode: 'rich' }; }

    mode(ctx) { return MODES[(ctx || this.ctx).settings.mode] ? (ctx || this.ctx).settings.mode : 'rich'; }
    doc(ctx, mode) { return S.entriesOf((ctx || this.ctx).id, 'doc').find((e) => (e.data || {}).mode === mode) || null; }

    // redraw only when what is shown changes, and never while you are typing
    sig(ctx) { const m = this.mode(ctx), d = this.doc(ctx, m); return [m, ctx.settings.lang || '', ctx.settings.autorun !== false, d ? [d.id, d.a] : null]; }
    keep() {
      const a = document.activeElement;
      const inside = a && a.closest && a.closest('.tile[data-tile="' + this.tileId + '"]') && a.matches('.wr-rich, .wr-ta');
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
      this.status = h('span', { class: 'muted small wr-status', text: row ? 'Saved' : '' });
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
      const ed = h('div', { class: 'wr-rich md', contenteditable: this.readOnly ? 'false' : 'true', spellcheck: true, role: 'textbox', 'aria-multiline': 'true',
        'aria-label': 'Rich text', dataset: { placeholder: 'Start writing… (select text for bold, headings, lists, links and colour)' } });
      ed.appendChild(sanitize(row ? row.a : ''));
      let range = null;
      const keep = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange(); };
      const back = () => { ed.focus(); if (range) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); } };
      const changed = () => { this.saveSoon(ed.innerHTML); updateCount(); };
      const exec = (cmd, val) => { back(); document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); keep(); changed(); };
      document.addEventListener('selectionchange', keep);
      HB.onCleanup(wrap.parentNode, () => document.removeEventListener('selectionchange', keep));
      ed.addEventListener('input', changed);
      ed.addEventListener('keydown', (e) => {
        e.stopPropagation(); // typing digits must not switch scenario
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); link(); }
      });
      // paste: keep formatting but only what is safe; images become uploads
      ed.addEventListener('paste', (e) => {
        if (this.readOnly) return;
        const dt = e.clipboardData;
        const imgs = Array.from(dt.files || []).filter((f) => /^image\//.test(f.type));
        if (imgs.length) { e.preventDefault(); imgs.forEach((f) => image(f)); return; }
        const html = dt.getData('text/html');
        if (html) { e.preventDefault(); keep(); back(); document.execCommand('insertHTML', false, sanitizeToString(html)); changed(); }
      });
      ed.addEventListener('drop', (e) => {
        const imgs = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter((f) => /^image\//.test(f.type));
        if (!imgs.length || this.readOnly) return;
        e.preventDefault(); // tells the page-wide upload handler to leave this drop alone
        imgs.forEach((f) => image(f));
      });

      const link = async () => {
        keep();
        const v = await HB.ui.form({ title: 'Link', fields: [{ name: 'url', label: 'Address', placeholder: 'https://…', required: true,
          validate: (x) => (HB.normUrl(x) ? '' : 'Enter a web address') }] });
        if (v) exec('createLink', HB.normUrl(v.url));
      };
      const image = async (file) => {
        if (!file) return;
        const t = HB.ui.toast('Uploading ' + file.name + '…', { timeout: 0, progress: true });
        try {
          const f = await HB.upload.one(file, ctx.id, (p) => t.progress(p / Math.max(1, file.size)));
          S.addFileRows([f]);
          HB.board.markRendered(this.tileId);
          exec('insertHTML', '<img src="file.php?id=' + f.id + '" alt="">');
          t.done('Image added');
        } catch (e) { t.close(); HB.ui.toast('Image upload failed: ' + e.message, { type: 'error' }); }
      };
      const pickImage = () => {
        keep();
        const i = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: () => { image(i.files[0]); i.remove(); } });
        document.body.append(i); i.click();
      };
      const btn = (text, title, fn, cls) => h('button', { type: 'button', class: 'wr-b ' + (cls || ''), text, title, 'aria-label': title,
        onmousedown: (e) => e.preventDefault(), onclick: fn });
      const swatchMenu = (list, cmd, title, icon) => {
        const b = btn(icon, title, () => {
          const r = b.getBoundingClientRect();
          const pop = h('div', { class: 'wr-swatches' }, list.map((c) => h('button', { type: 'button', class: 'wr-sw', title: c, style: { background: c },
            onmousedown: (e) => e.preventDefault(), onclick: () => { HB.ui.closeMenus(); exec(cmd, c); } })));
          HB.ui.popover(pop, r.left, r.bottom + 4);
        });
        return b;
      };
      const block = h('select', { class: 'wr-block', title: 'Paragraph style', onmousedown: keep,
        onchange: (e) => { exec('formatBlock', e.target.value); e.target.value = ''; } },
      h('option', { value: '', text: 'Style', disabled: true, selected: true }),
      [['p', 'Normal text'], ['h1', 'Title'], ['h2', 'Heading'], ['h3', 'Subheading'], ['blockquote', 'Quote'], ['pre', 'Code block']].map(([v, l]) => h('option', { value: v, text: l })));
      const tools = this.readOnly ? null : h('div', { class: 'wr-tools' },
        btn('↶', 'Undo (Ctrl+Z)', () => exec('undo')), btn('↷', 'Redo (Ctrl+Shift+Z)', () => exec('redo')), h('span', { class: 'wr-sep' }),
        block,
        btn('B', 'Bold (Ctrl+B)', () => exec('bold'), 'b'), btn('I', 'Italic (Ctrl+I)', () => exec('italic'), 'i'),
        btn('U', 'Underline (Ctrl+U)', () => exec('underline'), 'u'), btn('S', 'Strikethrough', () => exec('strikeThrough'), 's'),
        swatchMenu(COLORS, 'foreColor', 'Text colour', 'A'), swatchMenu(MARKS, 'hiliteColor', 'Highlight', '▆'), h('span', { class: 'wr-sep' }),
        btn('•', 'Bulleted list', () => exec('insertUnorderedList')), btn('1.', 'Numbered list', () => exec('insertOrderedList')),
        btn('⇤', 'Align left', () => exec('justifyLeft')), btn('↔', 'Centre', () => exec('justifyCenter')), btn('⇥', 'Align right', () => exec('justifyRight')),
        h('span', { class: 'wr-sep' }),
        btn('🔗', 'Link (Ctrl+K)', link), btn('🖼', 'Image (or paste / drop one)', pickImage),
        btn('▦', 'Table', () => exec('insertHTML', '<table><tbody><tr><th>Header</th><th>Header</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p></p>')),
        btn('―', 'Divider', () => exec('insertHorizontalRule')), btn('⌫', 'Clear formatting', () => { exec('removeFormat'); exec('unlink'); }));
      const count = h('span', { class: 'muted small' });
      const updateCount = () => { const t = ed.innerText.trim(); count.textContent = t ? t.split(/\s+/).length + ' words' : ''; };
      updateCount();
      wrap.append(h('div', { class: 'wr-top' }, tabs, count, this.status), tools, ed);
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
      const ed = codeEditor(row ? row.a : '', 'html', { readOnly: this.readOnly, onRun: run, placeholder: 'Type HTML here, or press Starter',
        onInput: (v) => this.saveSoon(v) });
      const tools = h('div', { class: 'wr-tools' },
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
      const ed = codeEditor(row ? row.a : '', lang, { readOnly: this.readOnly, onInput: (v) => this.saveSoon(v), placeholder: '// code' });
      const sel = h('select', { class: 'wr-lang', title: 'Language', disabled: this.readOnly,
        onchange: async (e) => { await this.flush(); this.save({ lang: e.target.value }, 'language'); } },
      Object.entries(LANGS).map(([k, v]) => h('option', { value: k, text: v.name, selected: k === lang })));
      const lines = h('span', { class: 'muted small', text: (ed.ta.value.match(/\n/g) || []).length + 1 + ' lines' });
      ed.ta.addEventListener('input', () => { lines.textContent = (ed.ta.value.match(/\n/g) || []).length + 1 + ' lines'; });
      const tools = h('div', { class: 'wr-tools' }, sel,
        h('button', { class: 'btn small', type: 'button', text: 'Copy', onclick: () => navigator.clipboard.writeText(ed.ta.value).then(() => HB.ui.toast('Copied'), () => HB.ui.toast('Copy failed', { type: 'error' })) }),
        h('button', { class: 'btn small ghost', type: 'button', text: '⬇', title: 'Download', onclick: () => download((ctx.tile.title || 'code') + '.' + LANGS[lang].ext, ed.ta.value, 'text/plain') }),
        lines);
      wrap.append(h('div', { class: 'wr-top' }, tabs, this.status), tools, ed.el);
    }

    menu(tile, ctx) {
      const mode = this.mode(ctx);
      return [
        { label: 'Mode', children: Object.entries(MODES).map(([k, v]) => ({ label: v, checked: k === mode,
          onClick: async () => { await this.flush(); this.save({ mode: k }, 'writer mode'); } })) },
        { label: 'Download', onClick: () => {
          const r = this.doc(ctx, mode);
          if (!r) { HB.ui.toast('Nothing written yet'); return; }
          const name = ctx.tile.title || 'writer';
          if (mode === 'rich') download(name + '.html', '<!doctype html><meta charset="utf-8"><title>' + name.replace(/[<&]/g, '') + '</title>\n' + r.a, 'text/html');
          else if (mode === 'web') download(name + '.html', r.a, 'text/html');
          else download(name + '.' + (LANGS[ctx.settings.lang] || LANGS.js).ext, r.a, 'text/plain');
        } },
      ];
    }
  });
})();
