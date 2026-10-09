(function () {
  const HB = window.HB;
  const h = HB.h;

  /**
   * HB.editor: the document editor shared by the Writer and the Writer folder.
   *   HB.editor.rich(opts)  rich-text editor (toolbar, balloons, find & replace, source view, own undo stack)
   *   HB.editor.code(value, lang, opts)  code editor with colour highlighting
   *   HB.editor.sanitize / sanitizeToString / toText / download / print / LANGS
   * Rich text is stored as HTML and rebuilt from a whitelist every time it is loaded or saved (see "sanitizer").
   */
  const ed = (HB.editor = {});

  // ===== sanitizer =====================================================================================
  const ALLOWED = new Set(['P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP', 'MARK',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'IMG', 'HR',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'FONT']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH',
    'HEAD', 'TITLE', 'META', 'LINK', 'BASE', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'AUDIO', 'VIDEO', 'CANVAS', 'DIALOG']);
  const CSS_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}(\.\d+)?%?\s*(,\s*\d{1,3}(\.\d+)?%?\s*){2,3}\)|[a-z]{3,25}|transparent)$/i;
  const STYLE_RULES = {
    color: CSS_COLOR,
    'background-color': CSS_COLOR,
    'text-align': /^(left|right|center|justify)$/i,
    'font-weight': /^(normal|bold|bolder|lighter|[1-9]00)$/i,
    'font-style': /^(normal|italic|oblique)$/i,
    'text-decoration': /^(none|(underline|line-through|overline)( (underline|line-through|overline))*)$/i,
    'text-decoration-line': /^(none|(underline|line-through|overline)( (underline|line-through|overline))*)$/i,
    'font-size': /^(inherit|\d{1,3}(\.\d{1,2})?(px|pt|em|rem|%))$/i,
    'font-family': /^[\w \-,'"]{1,80}$/,
    'line-height': /^(\d{1,2}(\.\d{1,2})?|\d{1,3}(\.\d{1,2})?(px|em|%))$/i,
    'margin-left': /^\d{1,3}(\.\d{1,2})?(px|em|rem)$/i,
  };

  function safeUrl(u, img) {
    u = (u || '').trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (!img && /^(mailto:|tel:|#)/i.test(u)) return u;
    if (img && /^file\.php\?id=\d+$/.test(u)) return u;
    if (img && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(u)) return u;
    return '';
  }
  // column widths and row heights (set by dragging a table edge) are kept on table parts only
  const SIZE_RULE = /^\d{1,4}(\.\d{1,2})?(px|%)$/;
  const SIZED = new Set(['TABLE', 'TR', 'TD', 'TH']);
  function cleanStyle(v, tag) {
    return String(v).split(';').map((d) => {
      const i = d.indexOf(':');
      if (i < 0) return '';
      const k = d.slice(0, i).trim().toLowerCase();
      const val = d.slice(i + 1).trim().replace(/\s*!important$/i, '');
      const rule = (k === 'width' || k === 'height') && SIZED.has(tag) ? SIZE_RULE : STYLE_RULES[k];
      if (!rule || !val || val.length > 80 || !rule.test(val)) return '';
      return k + ': ' + val;
    }).filter(Boolean).join('; ');
  }
  function cleanInto(src, out) {
    src.childNodes.forEach((n) => {
      if (n.nodeType === 3) { out.appendChild(document.createTextNode(n.nodeValue.replace(/\u200b/g, ''))); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toUpperCase();
      if (DROP.has(tag)) return;
      if (!ALLOWED.has(tag)) { cleanInto(n, out); return; } // unknown wrapper: keep its text, lose the tag
      const el = document.createElement(tag === 'FONT' ? 'SPAN' : tag);
      if (tag === 'FONT') {
        const st = [];
        if (n.getAttribute('color')) st.push('color:' + n.getAttribute('color'));
        if (n.getAttribute('face')) st.push('font-family:' + n.getAttribute('face'));
        const c = cleanStyle(st.join(';'));
        if (c) el.setAttribute('style', c);
      }
      if (tag === 'A') {
        const href = safeUrl(n.getAttribute('href'), false);
        if (href) { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      }
      if (tag === 'IMG') {
        const src = safeUrl(n.getAttribute('src'), true);
        if (!src) return;
        el.setAttribute('src', src);
        const alt = n.getAttribute('alt');
        if (alt && /^[^<>]{0,200}$/.test(alt)) el.setAttribute('alt', alt);
        const w = n.getAttribute('width');
        if (w && /^\d{1,4}(%|px)?$/.test(w)) el.setAttribute('width', w);
        const al = n.getAttribute('data-align');
        if (al && /^(left|center|right)$/.test(al)) el.setAttribute('data-align', al);
      }
      if (tag === 'UL' && /(^|\s)todo(\s|$)/.test(n.getAttribute('class') || '')) el.setAttribute('class', 'todo');
      if (tag === 'LI' && n.hasAttribute('data-done')) el.setAttribute('data-done', '1');
      if (tag === 'TD' || tag === 'TH') ['colspan', 'rowspan'].forEach((a) => { const v = n.getAttribute(a); if (v && /^\d{1,2}$/.test(v)) el.setAttribute(a, v); });
      const st = n.getAttribute('style');
      if (st) { const c = cleanStyle(st, tag); if (c) el.setAttribute('style', (el.getAttribute('style') ? el.getAttribute('style') + '; ' : '') + c); }
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
  ed.sanitize = sanitize;
  ed.sanitizeToString = sanitizeToString;
  HB.sanitizeHtml = sanitizeToString;

  /** Plain text of a stored HTML document (for search results, plain-text download, word counts). */
  ed.toText = (html) => {
    const d = document.createElement('div');
    d.appendChild(sanitize(html));
    d.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
    d.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre,tr,hr').forEach((b) => b.append('\n'));
    return d.textContent.replace(/\n{3,}/g, '\n\n').trim();
  };

  ed.download = function (name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const safeName = (s) => String(s || 'document').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'document';
  ed.fileName = safeName;

  /** A complete HTML page for a stored rich document (download, print). */
  ed.page = (title, html) => '<!doctype html><html><head><meta charset="utf-8"><title>' + String(title || '').replace(/[<&>]/g, '') + '</title>'
    + '<style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 20px;color:#111}img{max-width:100%;height:auto}'
    + 'table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}th{background:#f3f4f6}blockquote{border-left:3px solid #ccc;margin:0 0 .6em;padding-left:12px;color:#555}'
    + 'pre{background:#f3f4f6;padding:8px 10px;border-radius:6px;overflow:auto}ul.todo{list-style:none;padding-left:4px}ul.todo li[data-done]{text-decoration:line-through;color:#777}'
    + 'ul.todo li:before{content:"\\2610  "}ul.todo li[data-done]:before{content:"\\2611  "}img[data-align=center]{display:block;margin:auto}img[data-align=right]{float:right}img[data-align=left]{float:left}</style>'
    + '</head><body>' + html + '</body></html>';

  /** Print (or "Save as PDF") a stored rich document through a hidden frame. */
  ed.print = function (title, html) {
    const f = h('iframe', { style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' }, 'aria-hidden': 'true' });
    document.body.append(f);
    const d = f.contentDocument;
    d.open(); d.write(ed.page(title, sanitizeToString(html))); d.close();
    const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { HB.ui.toast('Printing failed', { type: 'error' }); } setTimeout(() => f.remove(), 4000); };
    if (d.readyState === 'complete') setTimeout(go, 150); else f.onload = () => setTimeout(go, 150);
  };

  // ===== code editor with live highlighting =============================================================
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
  ed.LANGS = LANGS;
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

  /** o = { readOnly, placeholder, onInput(value), onRun() } → { el, ta } */
  ed.code = function (value, lang, o) {
    const code = h('code');
    const pre = h('pre', { class: 'wr-hl', 'aria-hidden': 'true' }, code);
    const ta = h('textarea', { class: 'wr-ta', spellcheck: false, value: value || '', autocomplete: 'off', autocapitalize: 'off',
      dataset: { key: 'wr-code' }, readOnly: !!o.readOnly, placeholder: o.placeholder || '', 'aria-label': 'Code' });
    const paint = () => code.replaceChildren(...highlight(ta.value + '\n', lang));
    ta.addEventListener('input', () => { paint(); if (o.onInput) o.onInput(ta.value); });
    ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && !o.readOnly) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && o.onRun) { e.preventDefault(); o.onRun(); }
      e.stopPropagation(); // keep 1-9 / Ctrl+Z for the editor, not the board
    });
    paint();
    return { el: h('div', { class: 'wr-code' }, pre, ta), ta };
  };

  // ===== icons ============================================================================================
  const NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    undo: 'M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3', redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
    bullets: 'M9 6h12 M9 12h12 M9 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
    left: 'M3 6h18 M3 12h12 M3 18h16', center: 'M3 6h18 M6 12h12 M4 18h16', right: 'M3 6h18 M9 12h12 M5 18h16', justify: 'M3 6h18 M3 12h18 M3 18h18',
    indent: 'M3 6h18 M11 12h10 M3 18h18 M3 8.5l3.5 3.5L3 15.5z', outdent: 'M3 6h18 M11 12h10 M3 18h18 M7 8.5 3.5 12 7 15.5z',
    link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
    image: 'M3 5h18v14H3z M8.5 10.5h.01 M21 16l-5-5-8 8',
    table: 'M3 4h18v16H3z M3 10h18 M3 15h18 M9 4v16 M15 4v16',
    quote: 'M7 7h4v4c0 3-1 4-4 5 M15 7h4v4c0 3-1 4-4 5',
    code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5', source: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16', codeblock: 'M4 4h16v16H4z M10 9l-3 3 3 3 M14 9l3 3-3 3',
    hr: 'M3 12h18 M8 7l4-3 4 3 M8 17l4 3 4-3',
    find: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-5-5',
    more: 'M5 12h.01 M12 12h.01 M19 12h.01', down: 'M6 9l6 6 6-6',
    spacing: 'M8 4v16 M4 8l4-4 4 4 M4 16l4 4 4-4 M15 6h6 M15 12h6 M15 18h6',
    trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
    open: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
    close: 'M6 6l12 12 M18 6L6 18',
  };
  const icon = (name) => {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '16'); s.setAttribute('height', '16'); s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', ICONS[name]);
    s.append(p);
    return s;
  };
  ed.icon = icon;

  // ===== palettes / lists ================================================================================
  const hsl = (hh, s, l) => {
    s /= 100; l /= 100;
    const k = (n) => (n + hh / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return '#' + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('');
  };
  const PALETTE = ['#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#ffffff']
    .concat([[0, 74], [24, 80], [45, 85], [140, 60], [175, 70], [200, 75], [225, 75], [265, 70], [300, 60], [335, 70]].map((x) => hsl(x[0], x[1], 38)))
    .concat([[0, 74], [24, 80], [45, 85], [140, 60], [175, 70], [200, 75], [225, 75], [265, 70], [300, 60], [335, 70]].map((x) => hsl(x[0], x[1], 55)))
    .concat([[0, 74], [24, 80], [45, 85], [140, 60], [175, 70], [200, 75], [225, 75], [265, 70], [300, 60], [335, 70]].map((x) => hsl(x[0], x[1], 76)))
    .concat([[0, 74], [24, 80], [45, 85], [140, 60], [175, 70], [200, 75], [225, 75], [265, 70], [300, 60], [335, 70]].map((x) => hsl(x[0], x[1], 90)));
  const FONTS = [['Default', 'inherit'], ['Sans-serif', 'Arial, Helvetica, sans-serif'], ['Serif', 'Georgia, "Times New Roman", serif'],
    ['Monospace', '"Courier New", Courier, monospace'], ['Verdana', 'Verdana, Geneva, sans-serif'], ['Trebuchet', '"Trebuchet MS", sans-serif'],
    ['Handwriting', '"Comic Sans MS", cursive']];
  const SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
  const SPACING = [['Single', '1.2'], ['Normal', '1.55'], ['Relaxed', '1.8'], ['Double', '2.2']];
  const BLOCKS = [['p', 'Paragraph'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['blockquote', 'Quote'], ['pre', 'Code block']];
  const SPECIAL = ('© ® ™ § ¶ † ‡ • … – — ‘ ’ “ ” « » ‹ › ° ± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ ∏ ∫ ∂ ∆ π Ω µ α β γ δ ε θ λ σ φ ψ ω ← → ↑ ↓ ↔ ⇒ ⇔ ✓ ✗ ★ ☆ ♥ ♦ ♣ ♠ ♪ ☺ ¼ ½ ¾ ¹ ² ³ € £ ¥ ¢ ₹ ₩ ฿ ₫ é è ê ë á à â ä ã å ç ñ ó ò ô ö õ ø ú ù û ü í ì î ï ß æ œ ý').split(' ');
  const BLOCK_SEL = 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre';

  // ===== the rich-text editor ============================================================================
  /**
   * opts = { value, readOnly, onChange(html), upload(file) → Promise<url>, placeholder }
   * → { el, body (the editable), focus(), getHTML(), setHTML(html), status (element to put "Saved" in), destroy() }
   */
  ed.rich = function (opts) {
    const readOnly = !!opts.readOnly;
    const body = h('div', { class: 'wr-rich md', contenteditable: readOnly ? 'false' : 'true', spellcheck: true, role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Document' });
    body.style.setProperty('--ph', JSON.stringify(opts.placeholder || 'Start writing…  (try # for a heading, - for a list, [] for a to-do list)'));
    const source = h('textarea', { class: 'wr-source', spellcheck: false, hidden: true, 'aria-label': 'HTML source' });
    const balloon = h('div', { class: 'wr-balloon', hidden: true });
    const handle = h('div', { class: 'wr-handle', hidden: true, title: 'Drag to resize' });
    const stage = h('div', { class: 'wr-stage' }, body, source, balloon, handle);
    const count = h('span', { class: 'wr-count muted small' });
    const status = h('span', { class: 'wr-status muted small' });
    const foot = h('div', { class: 'wr-foot' }, count, status);
    const root = h('div', { class: 'wr-ed' + (readOnly ? ' readonly' : '') });
    const cleanups = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };

    // -- content in: cleaned, loose text wrapped in paragraphs
    const load = (html) => {
      body.replaceChildren(sanitize(html));
      let run = null;
      Array.from(body.childNodes).forEach((n) => {
        const inline = n.nodeType === 3 || (n.nodeType === 1 && !/^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|PRE|TABLE|HR)$/.test(n.tagName));
        if (inline && !(n.nodeType === 3 && !n.nodeValue.trim() && !run)) { if (!run) { run = h('p'); body.insertBefore(run, n); } run.append(n); } else run = null;
      });
      if (!body.firstChild) body.append(h('p', {}, h('br')));
    };
    const isEmpty = () => !body.querySelector('img,table,hr,li') && !body.textContent.trim();
    const updateEmpty = () => body.classList.toggle('is-empty', isEmpty());
    load(opts.value || '');
    updateEmpty();

    // -- selection helpers
    const sel = () => getSelection();
    const inBody = (n) => !!n && body.contains(n);
    const anchorEl = () => { const s = sel(); if (!s.rangeCount || !inBody(s.anchorNode)) return null; const n = s.anchorNode; return n.nodeType === 1 ? n : n.parentElement; };
    const closestIn = (css) => { const el = anchorEl(); const m = el && el.closest(css); return m && body.contains(m) && m !== body ? m : null; };
    let saved = null; // last selection inside the editor (toolbar popups steal focus)
    const keepSel = () => { const s = sel(); if (s.rangeCount && inBody(s.anchorNode) && inBody(s.focusNode)) saved = s.getRangeAt(0).cloneRange(); };
    const back = (force) => { // bring the caret back after a popup took the focus (when the editor still has it, the live selection is right)
      if (!force && document.activeElement === body) return;
      body.focus({ preventScroll: true });
      if (saved) { const s = sel(); s.removeAllRanges(); s.addRange(saved); }
    };
    const withSel = (fn) => { // run a DOM change that moves nodes without losing the caret
      const s = sel();
      const a = s.rangeCount ? [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset] : null;
      fn();
      if (a && inBody(a[0]) && inBody(a[2])) { try { s.setBaseAndExtent(a[0], Math.min(a[1], a[0].nodeType === 3 ? a[0].length : a[0].childNodes.length), a[2], Math.min(a[3], a[2].nodeType === 3 ? a[2].length : a[2].childNodes.length)); } catch (e) { /* ignore */ } }
    };
    const pathOf = (node) => { const p = []; while (node && node !== body) { p.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node)); node = node.parentNode; } return p; };
    const nodeAt = (p) => { let n = body; for (const i of p) n = n && n.childNodes[i]; return n; };
    const len = (n) => (n.nodeType === 3 ? n.length : n.childNodes.length);
    const getSel = () => { const s = sel(); if (!s.rangeCount || !inBody(s.anchorNode) || !inBody(s.focusNode)) return null; return { a: pathOf(s.anchorNode), ao: s.anchorOffset, f: pathOf(s.focusNode), fo: s.focusOffset }; };
    const setSel = (st) => {
      if (!st) return;
      const a = nodeAt(st.a), f = nodeAt(st.f);
      if (!a || !f) return;
      try { sel().setBaseAndExtent(a, Math.min(st.ao, len(a)), f, Math.min(st.fo, len(f))); } catch (e) { /* ignore */ }
    };

    // -- our own undo stack (works for every change, also the ones made by script)
    let hist = [{ html: body.innerHTML, sel: null }], pos = 0, snapTimer = 0;
    const commit = () => {
      clearTimeout(snapTimer); snapTimer = 0;
      const html = body.innerHTML;
      if (html === hist[pos].html) return;
      hist.splice(pos + 1);
      hist.push({ html, sel: getSel() });
      if (hist.length > 300) hist.shift();
      pos = hist.length - 1;
    };
    const apply = (st) => { body.innerHTML = st.html; body.focus({ preventScroll: true }); setSel(st.sel); changed(false); };
    const undo = () => { commit(); if (pos > 0) { pos--; apply(hist[pos]); } };
    const redo = () => { commit(); if (pos < hist.length - 1) { pos++; apply(hist[pos]); } };

    // -- change notification
    let countTimer = 0;
    const updateCount = () => {
      clearTimeout(countTimer);
      countTimer = setTimeout(() => {
        const t = body.innerText.trim();
        const w = t ? t.split(/\s+/).length : 0;
        count.textContent = w ? w.toLocaleString() + ' word' + (w === 1 ? '' : 's') + ' · ' + t.length.toLocaleString() + ' characters' : '';
      }, 200);
    };
    // Chrome can leave a list (or paragraph) inside a <p>; saved and reloaded that becomes a mess, so lift such blocks out
    const BLOCKY = 'ul,ol,p,h1,h2,h3,h4,h5,h6,blockquote,pre,table,hr,div';
    const fixNesting = () => {
      for (let guard = 0; guard < 30; guard++) {
        const bad = Array.from(body.querySelectorAll('p')).find((p) => Array.from(p.children).some((c) => c.matches(BLOCKY)));
        if (!bad) return;
        withSel(() => {
          const parent = bad.parentNode, out = [];
          let run = null;
          Array.from(bad.childNodes).forEach((n) => {
            if (n.nodeType === 1 && n.matches(BLOCKY)) { run = null; out.push(n); return; }
            if (!run) { if (n.nodeType === 3 && !n.nodeValue.trim()) return; run = h('p'); out.push(run); }
            run.append(n);
          });
          out.forEach((n) => parent.insertBefore(n, bad));
          bad.remove();
        });
      }
    };
    const changed = (record = true, structural = true) => {
      if (structural) fixNesting();
      if (record) { clearTimeout(snapTimer); snapTimer = setTimeout(commit, 350); }
      updateEmpty(); updateCount(); refresh();
      if (opts.onChange) opts.onChange(body.innerHTML);
    };
    const getHTML = () => sanitizeToString(source.hidden ? body.innerHTML : source.value);

    // -- commands
    const exec = (cmd, val, css) => {
      back();
      try { document.execCommand('styleWithCSS', false, !!css); } catch (e) { /* old browsers */ }
      document.execCommand(cmd, false, val);
      keepSel(); changed();
    };
    const mutate = (fn) => { back(); withSel(fn); keepSel(); changed(); };
    const blocksInSel = () => {
      const s = sel();
      if (!s.rangeCount || !inBody(s.anchorNode)) return [];
      const r = s.getRangeAt(0);
      return Array.from(body.querySelectorAll(BLOCK_SEL)).filter((b) => r.intersectsNode(b) && !b.querySelector(BLOCK_SEL));
    };
    const setBlock = (tag) => {
      back();
      const cur = closestIn('h1,h2,h3,h4,h5,h6,blockquote,pre');
      const want = cur && cur.tagName.toLowerCase() === tag ? 'p' : tag;
      if (want === 'p' && cur && cur.tagName === 'BLOCKQUOTE') { document.execCommand('outdent'); }
      else document.execCommand('formatBlock', false, want);
      keepSel(); changed();
    };
    const toggleQuote = () => {
      back();
      const q = closestIn('blockquote');
      if (q) mutate(() => { while (q.firstChild) q.parentNode.insertBefore(q.firstChild, q); q.remove(); });
      else { document.execCommand('formatBlock', false, 'blockquote'); keepSel(); changed(); }
    };
    const inlineCode = () => {
      back();
      const c = closestIn('code');
      if (c && c.parentElement.tagName !== 'PRE') { mutate(() => { while (c.firstChild) c.parentNode.insertBefore(c.firstChild, c); c.remove(); }); return; }
      const s = sel();
      if (s.isCollapsed || !s.rangeCount) return;
      wrapCode(s.getRangeAt(0), s.toString(), true);
      keepSel(); changed();
    };
    /** Replace a range by <code>text</code>; the caret ends up after it (after an invisible space so typing leaves the code). */
    const wrapCode = (range, text, select) => {
      const code = h('code', { text });
      range.deleteContents(); range.insertNode(code);
      const after = document.createTextNode('\u200b');
      code.after(after);
      const r = document.createRange();
      if (select) r.selectNodeContents(code); else { r.setStart(after, 1); r.collapse(true); }
      sel().removeAllRanges(); sel().addRange(r);
    };
    /** After making a list: bullets and to-do items never share one <ul>, even when the browser merged the new items into a list next door. */
    const settleListKind = (wantTodo) => {
      const ul = closestIn('ul'), s = sel();
      if (!ul || !s.rangeCount || ul.classList.contains('todo') === wantTodo) return;
      const r = s.getRangeAt(0), kids = Array.from(ul.children);
      const lis = kids.filter((li) => r.intersectsNode(li));
      if (!lis.length) return;
      const from = kids.indexOf(lis[0]), to = kids.indexOf(lis[lis.length - 1]);
      if (from === 0 && to === kids.length - 1) { ul.classList.toggle('todo', wantTodo); return; }
      withSel(() => {
        const mid = h('ul', { class: wantTodo ? 'todo' : null });
        lis.forEach((li) => mid.append(li));
        ul.after(mid);
        const rest = kids.slice(to + 1);
        if (rest.length) { const tail = h('ul', { class: ul.classList.contains('todo') ? 'todo' : null }); rest.forEach((li) => tail.append(li)); mid.after(tail); }
      });
    };
    const list = (kind) => { // kind: ul | ol | todo
      back();
      const cur = closestIn('ul,ol');
      if (kind === 'todo') {
        if (cur && cur.tagName === 'UL' && cur.classList.contains('todo')) { exec('insertUnorderedList'); return; }
        if (cur && cur.tagName === 'UL') { mutate(() => cur.classList.add('todo')); return; }
        exec('insertUnorderedList');
        settleListKind(true); changed();
        return;
      }
      if (kind === 'ul' && cur && cur.classList.contains('todo')) { mutate(() => cur.classList.remove('todo')); return; }
      exec(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
      if (kind === 'ul') { settleListKind(false); changed(); }
    };
    const indent = (d) => {
      back();
      if (closestIn('li')) { exec(d > 0 ? 'indent' : 'outdent'); return; }
      mutate(() => blocksInSel().forEach((b) => {
        const cur = parseFloat(b.style.marginLeft) || 0;
        const next = Math.max(0, Math.min(20, cur + d * 2));
        if (next) b.style.marginLeft = next + 'em'; else b.style.removeProperty('margin-left');
        if (!b.getAttribute('style')) b.removeAttribute('style');
      }));
    };
    const spacing = (v) => mutate(() => blocksInSel().forEach((b) => { b.style.lineHeight = v; }));
    const fontSize = (px) => {
      back();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('fontSize', false, '7');
      body.querySelectorAll('font[size="7"], span[style*="xxx-large"], span[style*="-webkit-xxx-large"]').forEach((el) => {
        if (el.tagName === 'FONT') { const sp = h('span'); sp.style.fontSize = px ? px + 'px' : 'inherit'; while (el.firstChild) sp.append(el.firstChild); el.replaceWith(sp); } else el.style.fontSize = px ? px + 'px' : 'inherit';
      });
      // nested spans from an earlier size: the inner one wins, drop the outer ones' size so the markup stays flat
      body.querySelectorAll('span[style*="font-size"] span[style*="font-size"]').forEach((inner) => { const o = inner.parentElement; if (o && o.childNodes.length === 1) o.style.removeProperty('font-size'); });
      keepSel(); changed();
    };
    const toLink = async () => {
      keepSel();
      const a = closestIn('a');
      const s = sel();
      const v = await HB.ui.form({ title: a ? 'Edit link' : 'Link', fields: [
        { name: 'url', label: 'Address', placeholder: 'https://…', required: true, value: a ? a.getAttribute('href') : '', validate: (x) => (HB.normUrl(x) ? '' : 'Enter a web address') },
        ...(!a && saved && saved.collapsed ? [{ name: 'text', label: 'Text to show', placeholder: 'optional' }] : []),
      ], submit: 'Apply' });
      back(true);
      if (!v) return;
      const url = HB.normUrl(v.url);
      if (a) { const r = document.createRange(); r.selectNodeContents(a); s.removeAllRanges(); s.addRange(r); keepSel(); exec('createLink', url); return; }
      if (saved && saved.collapsed) {
        const link = h('a', { href: url, text: v.text || url });
        exec('insertHTML', link.outerHTML);
        return;
      }
      exec('createLink', url);
    };
    const unlink = () => { back(); const a = closestIn('a'); if (a) { const r = document.createRange(); r.selectNodeContents(a); sel().removeAllRanges(); sel().addRange(r); } exec('unlink'); };

    // -- images
    const addImage = async (file) => {
      if (!file || !opts.upload) return;
      const t = HB.ui.toast('Uploading ' + file.name + '…', { timeout: 0, progress: true });
      try {
        const url = await opts.upload(file, (p) => t.progress(p / Math.max(1, file.size)));
        exec('insertHTML', '<img src="' + url + '" alt="">');
        t.done('Image added');
      } catch (e) { t.close(); HB.ui.toast('Image upload failed: ' + e.message, { type: 'error' }); }
    };
    const pickImage = () => {
      keepSel();
      const i = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: () => { addImage(i.files[0]); i.remove(); } });
      document.body.append(i); i.click();
    };
    const imageByUrl = async () => {
      keepSel();
      const v = await HB.ui.form({ title: 'Image from a web address', fields: [{ name: 'url', label: 'Image address', placeholder: 'https://…/picture.png', required: true,
        validate: (x) => (/^https?:\/\//i.test(x) ? '' : 'Start with http:// or https://') }], submit: 'Insert' });
      back(true);
      if (v) exec('insertHTML', '<img src="' + v.url.replace(/"/g, '%22') + '" alt="">');
    };

    // -- tables
    const cellInfo = () => {
      const cell = closestIn('td,th');
      if (!cell) return null;
      const row = cell.parentElement, table = cell.closest('table');
      return { cell, row, table, col: Array.prototype.indexOf.call(row.children, cell), rows: Array.from(table.rows) };
    };
    const newCell = (tag) => h(tag || 'td', {}, h('br'));
    const tableOp = (op) => {
      const t = cellInfo();
      if (!t) return;
      back();
      const focusCell = (c) => { if (!c) return; const r = document.createRange(); r.selectNodeContents(c); r.collapse(true); sel().removeAllRanges(); sel().addRange(r); };
      let target = t.cell;
      if (op === 'rowBefore' || op === 'rowAfter') {
        const nr = h('tr', {}, Array.from(t.row.children).map((c) => newCell(op === 'rowAfter' && c.tagName === 'TH' && t.row.rowIndex === 0 ? 'td' : c.tagName.toLowerCase() === 'th' && op === 'rowBefore' ? 'th' : 'td')));
        t.row.parentNode.insertBefore(nr, op === 'rowBefore' ? t.row : t.row.nextSibling);
        target = nr.children[Math.min(t.col, nr.children.length - 1)];
      } else if (op === 'colBefore' || op === 'colAfter') {
        const i = op === 'colBefore' ? t.col : t.col + 1;
        t.rows.forEach((r) => { const ref = r.children[i] || null; const tag = r.children[Math.min(t.col, r.children.length - 1)].tagName.toLowerCase(); r.insertBefore(newCell(tag), ref); });
        target = t.row.children[i];
      } else if (op === 'delRow') {
        if (t.rows.length <= 1) { t.table.remove(); target = null; } else { const nx = t.row.nextElementSibling || t.row.previousElementSibling; t.row.remove(); target = nx.children[Math.min(t.col, nx.children.length - 1)]; }
      } else if (op === 'delCol') {
        if (t.row.children.length <= 1) { t.table.remove(); target = null; } else { t.rows.forEach((r) => { if (r.children[t.col]) r.children[t.col].remove(); }); target = t.row.children[Math.min(t.col, t.row.children.length - 1)]; }
      } else if (op === 'delTable') { t.table.remove(); target = null; }
      else if (op === 'header') {
        const first = t.rows[0];
        const toTh = !Array.from(first.children).every((c) => c.tagName === 'TH');
        Array.from(first.children).forEach((c) => { const n = h(toTh ? 'th' : 'td'); while (c.firstChild) n.append(c.firstChild); if (c.colSpan > 1) n.colSpan = c.colSpan; c.replaceWith(n); });
        target = t.cell.isConnected ? t.cell : first.children[0];
      }
      if (!body.firstChild) body.append(h('p', {}, h('br')));
      focusCell(target); keepSel(); changed();
    };
    const insertTable = (r, c) => {
      let x = '<table data-wr-new="1"><tbody><tr>' + '<th><br></th>'.repeat(c) + '</tr>';
      for (let i = 1; i < r; i++) x += '<tr>' + '<td><br></td>'.repeat(c) + '</tr>';
      exec('insertHTML', x + '</tbody></table><p><br></p>');
      const t = body.querySelector('table[data-wr-new]');
      if (t) { t.removeAttribute('data-wr-new'); const rg = document.createRange(); rg.selectNodeContents(t.rows[0].cells[0]); rg.collapse(true); sel().removeAllRanges(); sel().addRange(rg); keepSel(); refresh(); }
    };

    // -- popups
    const dropdown = (anchor, el) => { const r = anchor.getBoundingClientRect(); HB.ui.popover(el, r.left, r.bottom + 4); };
    const noFocus = (e) => e.preventDefault();
    const listPop = (anchor, items) => {
      const pop = h('div', { class: 'wr-pop' }, items.map((it) => h('button', { type: 'button', class: 'wr-pop-item' + (it.on ? ' on' : ''), style: it.style || null, text: it.label,
        onmousedown: noFocus, onclick: () => { HB.ui.closeMenus(); it.run(); } })));
      dropdown(anchor, pop);
    };
    const palettePop = (anchor, cmd, none) => {
      const set = (c) => { HB.ui.closeMenus(); exec(cmd, c, true); };
      const custom = h('input', { type: 'color', class: 'wr-colorinput', title: 'Any colour', onmousedown: keepSel, onchange: (e) => set(e.target.value) });
      const pop = h('div', { class: 'wr-pal' },
        h('div', { class: 'wr-pal-grid' }, PALETTE.map((c) => h('button', { type: 'button', class: 'wr-sw', title: c, style: { background: c }, onmousedown: noFocus, onclick: () => set(c) }))),
        h('div', { class: 'wr-pal-foot' },
          h('button', { type: 'button', class: 'btn small ghost', text: none, onmousedown: noFocus, onclick: () => { HB.ui.closeMenus(); exec(cmd, cmd === 'foreColor' ? '#111827' : 'transparent', true); if (cmd === 'foreColor') exec('removeFormat'); } }),
          h('label', { class: 'wr-pal-custom small muted' }, 'Custom ', custom)));
      dropdown(anchor, pop);
    };
    const tablePop = (anchor) => {
      keepSel();
      const info = cellInfo();
      const grid = h('div', { class: 'wr-tgrid' });
      const label = h('div', { class: 'small muted wr-tlabel', text: 'Insert table' });
      const R = 6, C = 8;
      for (let r = 1; r <= R; r++) for (let c = 1; c <= C; c++) {
        grid.append(h('button', { type: 'button', class: 'wr-tcell', 'aria-label': r + ' × ' + c, onmousedown: noFocus,
          onmouseenter: () => { label.textContent = r + ' × ' + c; grid.querySelectorAll('.wr-tcell').forEach((x, i) => x.classList.toggle('on', Math.floor(i / C) < r && i % C < c)); },
          onclick: () => { HB.ui.closeMenus(); insertTable(r, c); } }));
      }
      const op = (label2, k, danger) => h('button', { type: 'button', class: 'wr-pop-item' + (danger ? ' danger' : ''), text: label2, onmousedown: noFocus, onclick: () => { HB.ui.closeMenus(); tableOp(k); } });
      const pop = h('div', { class: 'wr-pop wr-tpop' }, grid, label, info ? h('div', { class: 'wr-tops' },
        op('Row above', 'rowBefore'), op('Row below', 'rowAfter'), op('Column left', 'colBefore'), op('Column right', 'colAfter'),
        op('Header row on/off', 'header'), op('Delete row', 'delRow', true), op('Delete column', 'delCol', true), op('Delete table', 'delTable', true)) : null);
      dropdown(anchor, pop);
    };
    const specialPop = (anchor) => {
      keepSel();
      const pop = h('div', { class: 'wr-special' }, SPECIAL.map((c) => h('button', { type: 'button', class: 'wr-sp', text: c, title: c, onmousedown: noFocus, onclick: () => { HB.ui.closeMenus(); exec('insertText', c); } })));
      dropdown(anchor, pop);
    };

    // -- toolbar
    const toggles = [];
    const btn = (content, title, fn, o) => {
      o = o || {};
      const b = h('button', { type: 'button', class: 'wr-b ' + (o.cls || ''), title, 'aria-label': title.replace(/ \(.*\)/, ''), onmousedown: noFocus, onclick: (e) => fn(e, b) }, typeof content === 'string' && ICONS[content] ? icon(content) : content);
      if (o.state) toggles.push([b, o.state]);
      return b;
    };
    const dd = (labelFn, title, fn, cls) => {
      const lab = h('span', { class: 'wr-dd-l' });
      const b = h('button', { type: 'button', class: 'wr-dd ' + (cls || ''), title, 'aria-label': title, onmousedown: noFocus, onclick: (e) => { keepSel(); fn(b, e); } }, lab, icon('down'));
      toggles.push([null, () => { lab.textContent = labelFn(); }]);
      return b;
    };
    const q = (cmd) => () => { try { return document.queryCommandState(cmd); } catch (e) { return false; } };
    const blockTag = () => { const c = closestIn('h1,h2,h3,h4,h5,h6,blockquote,pre'); return c ? c.tagName.toLowerCase() : 'p'; };
    const styleOf = (prop) => { const el = anchorEl(); return el ? getComputedStyle(el)[prop] : ''; };
    const alignNow = () => { const b = blocksInSel()[0] || anchorEl(); const a = b ? getComputedStyle(b).textAlign : 'left'; return a === 'start' ? 'left' : a === 'end' ? 'right' : a; };
    const alignBtn = (() => {
      const b = btn('left', 'Alignment', () => {
        keepSel();
        const cur = alignNow();
        listPop(b, [['left', 'Align left', 'justifyLeft'], ['center', 'Centre', 'justifyCenter'], ['right', 'Align right', 'justifyRight'], ['justify', 'Justify', 'justifyFull']]
          .map(([k, l, c]) => ({ label: l, on: cur === k, run: () => exec(c, null, true) })));
      });
      toggles.push([null, () => { const a = alignNow(); b.replaceChildren(icon(ICONS[a] ? a : 'left')); }]);
      return b;
    })();
    const sep = () => h('span', { class: 'wr-sep' });
    const group = (...kids) => h('span', { class: 'wr-grp' }, ...kids);

    const tools = readOnly ? null : h('div', { class: 'wr-tools' });
    const toolsIn = readOnly ? null : h('div', { class: 'wr-tools-in', role: 'toolbar', 'aria-label': 'Formatting' },
      group(btn('undo', 'Undo (Ctrl+Z)', undo), btn('redo', 'Redo (Ctrl+Shift+Z)', redo)),
      sep(),
      group(
        dd(() => (BLOCKS.find((x) => x[0] === blockTag()) || BLOCKS[0])[1], 'Paragraph style', (b) => {
          const cur = blockTag();
          listPop(b, BLOCKS.map(([t, l]) => ({ label: l, on: t === cur, style: t[0] === 'h' ? { fontWeight: 700, fontSize: (1.3 - Number(t[1]) * 0.07) + 'em' } : t === 'pre' ? { fontFamily: 'ui-monospace, monospace' } : null, run: () => setBlock(t) })));
        }, 'wr-dd-block'),
        dd(() => { const f = FONTS.find((x) => styleOf('fontFamily').toLowerCase().replace(/["']/g, '').startsWith(x[1].toLowerCase().replace(/["']/g, '').split(',')[0])); return f && f[1] !== 'inherit' ? f[0] : 'Font'; }, 'Font', (b) => {
          listPop(b, FONTS.map(([l, v]) => ({ label: l, style: { fontFamily: v }, run: () => exec('fontName', v, true) })));
        }, 'wr-dd-font'),
        dd(() => { const px = Math.round(parseFloat(styleOf('fontSize')) || 14); return String(px); }, 'Font size', (b) => {
          listPop(b, [{ label: 'Default', run: () => fontSize(null) }].concat(SIZES.map((s) => ({ label: String(s), run: () => fontSize(s) }))));
        }, 'wr-dd-size')),
      sep(),
      group(
        btn('B', 'Bold (Ctrl+B)', () => exec('bold'), { cls: 'b', state: q('bold') }), btn('I', 'Italic (Ctrl+I)', () => exec('italic'), { cls: 'i', state: q('italic') }),
        btn('U', 'Underline (Ctrl+U)', () => exec('underline'), { cls: 'u', state: q('underline') }), btn('S', 'Strikethrough (Ctrl+Shift+X)', () => exec('strikeThrough'), { cls: 's', state: q('strikeThrough') }),
        btn('code', 'Inline code', inlineCode, { state: () => !!closestIn('code') && closestIn('code').parentElement.tagName !== 'PRE' }),
        btn(h('span', {}, 'x', h('sub', { text: '2' })), 'Subscript', () => exec('subscript'), { state: q('subscript') }),
        btn(h('span', {}, 'x', h('sup', { text: '2' })), 'Superscript', () => exec('superscript'), { state: q('superscript') })),
      sep(),
      group(
        btn(h('span', { class: 'wr-aa' }, 'A'), 'Text colour', (e, b) => { keepSel(); palettePop(b, 'foreColor', 'Default colour'); }),
        btn(h('span', { class: 'wr-hi' }, 'ab'), 'Highlight', (e, b) => { keepSel(); palettePop(b, 'hiliteColor', 'No highlight'); })),
      sep(),
      group(alignBtn,
        btn('bullets', 'Bulleted list (Ctrl+Shift+8)', () => list('ul'), { state: () => { const l = closestIn('ul,ol'); return !!l && l.tagName === 'UL' && !l.classList.contains('todo'); } }),
        btn('1.', 'Numbered list (Ctrl+Shift+7)', () => list('ol'), { state: () => { const l = closestIn('ul,ol'); return !!l && l.tagName === 'OL'; } }),
        btn('☑', 'To-do list (Ctrl+Shift+9)', () => list('todo'), { state: () => { const l = closestIn('ul'); return !!l && l.classList.contains('todo'); } }),
        btn('outdent', 'Decrease indent', () => indent(-1)), btn('indent', 'Increase indent', () => indent(1)),
        btn('spacing', 'Line spacing', (e, b) => { keepSel(); listPop(b, SPACING.map(([l, v]) => ({ label: l, run: () => spacing(v) }))); })),
      sep(),
      group(
        btn('link', 'Link (Ctrl+K)', toLink, { state: () => !!closestIn('a') }),
        btn('image', 'Image: upload, paste or drop one', (e, b) => {
          keepSel();
          listPop(b, [{ label: 'Upload from this device…', run: pickImage }, { label: 'From a web address…', run: imageByUrl }]);
        }),
        btn('table', 'Table', (e, b) => tablePop(b), { state: () => !!closestIn('table') }),
        btn('quote', 'Quote', toggleQuote, { state: () => !!closestIn('blockquote') }),
        btn('codeblock', 'Code block', () => setBlock('pre'), { state: () => blockTag() === 'pre' }),
        btn('hr', 'Horizontal line', () => exec('insertHorizontalRule')),
        btn('Ω', 'Special characters', (e, b) => specialPop(b)),
        btn('🙂', 'Emoji', (e, b) => { keepSel(); const r = b.getBoundingClientRect(); HB.emoji.open(r.left, r.bottom + 4, (em) => { back(true); exec('insertText', em); }); })),
      sep(),
      group(
        btn('find', 'Find and replace (Ctrl+F)', () => toggleFind(true)),
        btn('source', 'Edit HTML source', () => toggleSource(), { cls: 'src' }),
        btn('Tx', 'Clear formatting (Ctrl+\\)', () => { exec('removeFormat'); exec('unlink'); mutate(() => blocksInSel().forEach((b) => { b.removeAttribute('style'); })); })));
    if (tools) {
      const more = h('button', { type: 'button', class: 'wr-more', title: 'More tools', 'aria-label': 'More tools', onmousedown: noFocus, onclick: () => tools.classList.toggle('open') }, icon('more'));
      tools.append(toolsIn, more);
      root.append(tools);
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => { tools.classList.toggle('has-more', tools.classList.contains('open') || toolsIn.scrollHeight > 38); });
        ro.observe(toolsIn);
        cleanups.push(() => ro.disconnect());
      }
    }
    let refreshQueued = false;
    function refresh() {
      if (refreshQueued || readOnly) return;
      refreshQueued = true;
      requestAnimationFrame(() => {
        refreshQueued = false;
        if (!root.isConnected) return;
        toggles.forEach(([b, f]) => { let v; try { v = f(); } catch (e) { v = false; } if (b) b.classList.toggle('on', !!v); });
        balloonUpdate();
      });
    }

    // -- find & replace
    const findBar = readOnly ? null : h('div', { class: 'wr-find', hidden: true });
    let marks = [], cur = -1, hl = null;
    const findIn = (needle, cs) => {
      const out = [];
      if (!needle) return out;
      const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const n = cs ? needle : needle.toLowerCase();
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        const text = cs ? t.nodeValue : t.nodeValue.toLowerCase();
        for (let i = text.indexOf(n); i >= 0; i = text.indexOf(n, i + n.length)) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + needle.length); out.push(r); }
      }
      return out;
    };
    const paintFind = () => {
      if (window.CSS && CSS.highlights && window.Highlight) { if (marks.length) CSS.highlights.set('wr-find', new Highlight(...marks)); else CSS.highlights.delete('wr-find'); }
    };
    const goTo = (i) => {
      if (!marks.length) { cur = -1; return; }
      cur = (i + marks.length) % marks.length;
      const r = marks[cur];
      const s = sel(); s.removeAllRanges(); s.addRange(r.cloneRange());
      const rect = r.getBoundingClientRect(), br = body.getBoundingClientRect();
      if (rect.top < br.top + 8 || rect.bottom > br.bottom - 8) body.scrollTop += rect.top - br.top - br.height / 3;
      info.textContent = (cur + 1) + ' of ' + marks.length;
    };
    const runFind = (keepIdx) => {
      marks = findIn(fInput.value, fCase.checked);
      info.textContent = fInput.value ? (marks.length ? marks.length + ' found' : 'No matches') : '';
      paintFind();
      if (marks.length && !keepIdx) goTo(0); else if (!marks.length) cur = -1;
    };
    const replaceOne = () => {
      if (cur < 0 || !marks[cur]) { runFind(); return; }
      const r = marks[cur];
      back(); const s = sel(); s.removeAllRanges(); s.addRange(r);
      document.execCommand('insertText', false, rInput.value);
      changed(); const idx = cur; runFind(true); goTo(Math.min(idx, marks.length - 1));
    };
    const replaceAll = () => {
      runFind(true);
      const all = marks.slice().reverse();
      if (!all.length) return;
      back();
      all.forEach((r) => { const s = sel(); s.removeAllRanges(); s.addRange(r); document.execCommand('insertText', false, rInput.value); });
      changed(); runFind(); info.textContent = all.length + ' replaced';
    };
    const fInput = readOnly ? null : h('input', { type: 'text', placeholder: 'Find', class: 'wr-fi', 'aria-label': 'Find', autocomplete: 'off',
      oninput: () => runFind(), onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); goTo(cur + (e.shiftKey ? -1 : 1)); } if (e.key === 'Escape') toggleFind(false); } });
    const rInput = readOnly ? null : h('input', { type: 'text', placeholder: 'Replace with', class: 'wr-fi', 'aria-label': 'Replace with', autocomplete: 'off',
      onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } if (e.key === 'Escape') toggleFind(false); } });
    const fCase = readOnly ? null : h('input', { type: 'checkbox', onchange: () => runFind() });
    const info = h('span', { class: 'small muted wr-find-info' });
    if (findBar) {
      findBar.append(fInput, rInput, h('button', { type: 'button', class: 'btn small', text: '↑', title: 'Previous', onclick: () => goTo(cur - 1) }),
        h('button', { type: 'button', class: 'btn small', text: '↓', title: 'Next', onclick: () => goTo(cur + 1) }),
        h('button', { type: 'button', class: 'btn small', text: 'Replace', onclick: replaceOne }), h('button', { type: 'button', class: 'btn small', text: 'All', title: 'Replace all', onclick: replaceAll }),
        h('label', { class: 'small muted wr-find-case' }, fCase, ' Aa'), info,
        h('button', { type: 'button', class: 'btn small ghost wr-find-x', title: 'Close', 'aria-label': 'Close find', onclick: () => toggleFind(false) }, icon('close')));
      root.append(findBar);
    }
    function toggleFind(open) {
      if (!findBar) return;
      if (open) {
        keepSel();
        findBar.hidden = false;
        const t = saved && !saved.collapsed ? saved.toString() : '';
        if (t && t.length < 80 && !/\n/.test(t)) fInput.value = t;
        fInput.focus(); fInput.select(); runFind();
      } else {
        findBar.hidden = true; marks = []; cur = -1; paintFind(); info.textContent = '';
        back(true);
      }
    }

    // -- HTML source view
    function toggleSource() {
      if (readOnly) return;
      if (source.hidden) {
        keepSel();
        source.value = body.innerHTML.replace(/<(\/?)(p|div|h[1-6]|ul|ol|li|blockquote|pre|table|tbody|thead|tr|hr)([ >])/gi, '\n<$1$2$3').replace(/^\n/, '');
        source.hidden = false; body.hidden = true; root.classList.add('src-on');
        source.focus();
      } else {
        const clean = sanitizeToString(source.value);
        source.hidden = true; body.hidden = false; root.classList.remove('src-on');
        if (clean !== body.innerHTML) { load(clean); changed(); commit(); }
        body.focus();
      }
    }
    source.addEventListener('input', () => { if (opts.onChange) opts.onChange(source.value); });
    source.addEventListener('keydown', (e) => e.stopPropagation());

    // -- balloon: link / image helpers
    let selImg = null;
    const bbtn = (content, title, fn, o) => h('button', { type: 'button', class: 'wr-bb' + (o && o.on ? ' on' : ''), title, 'aria-label': title, onmousedown: noFocus, onclick: fn }, content);
    function placeBalloon(rect) {
      const sr = stage.getBoundingClientRect();
      balloon.hidden = false;
      const w = balloon.offsetWidth;
      let left = rect.left - sr.left + rect.width / 2 - w / 2;
      left = Math.max(4, Math.min(left, sr.width - w - 4));
      let top = rect.bottom - sr.top + 8;
      if (top + balloon.offsetHeight > sr.height - 2) top = Math.max(2, rect.top - sr.top - balloon.offsetHeight - 8);
      balloon.style.left = left + 'px'; balloon.style.top = top + 'px';
    }
    function balloonUpdate() {
      if (readOnly || body.hidden) { balloon.hidden = true; handle.hidden = true; return; }
      if (selImg && !body.contains(selImg)) selImg = null;
      body.querySelectorAll('img.is-sel').forEach((i) => { if (i !== selImg) i.classList.remove('is-sel'); });
      if (selImg) {
        selImg.classList.add('is-sel');
        const al = selImg.getAttribute('data-align') || '';
        const wd = selImg.getAttribute('width') || '';
        const setW = (v) => { selImg.setAttribute('width', v); if (!v) selImg.removeAttribute('width'); changed(); };
        const setA = (v) => { if (v) selImg.setAttribute('data-align', v); else selImg.removeAttribute('data-align'); changed(); };
        balloon.replaceChildren(
          ...['25%', '50%', '75%', '100%'].map((p) => bbtn(p, 'Width ' + p, () => setW(p === '100%' ? '' : p), { on: p === wd || (p === '100%' && !wd) })),
          h('span', { class: 'wr-sep' }),
          bbtn(icon('left'), 'Float left', () => setA(al === 'left' ? '' : 'left'), { on: al === 'left' }),
          bbtn(icon('center'), 'Centre', () => setA(al === 'center' ? '' : 'center'), { on: al === 'center' }),
          bbtn(icon('right'), 'Float right', () => setA(al === 'right' ? '' : 'right'), { on: al === 'right' }),
          h('span', { class: 'wr-sep' }),
          bbtn('Alt', 'Alternative text', async () => {
            const v = await HB.ui.form({ title: 'Alternative text', fields: [{ name: 'alt', label: 'Describe the picture', value: selImg.getAttribute('alt') || '', max: 200 }], submit: 'Save' });
            if (v) { selImg.setAttribute('alt', v.alt.replace(/[<>]/g, '')); changed(); }
          }),
          bbtn(icon('trash'), 'Remove picture', () => { const i = selImg; selImg = null; i.remove(); if (!body.firstChild) body.append(h('p', {}, h('br'))); changed(); }));
        const ir = selImg.getBoundingClientRect(), sr = stage.getBoundingClientRect(), vr = body.getBoundingClientRect();
        if (ir.bottom < vr.top || ir.top > vr.bottom) { balloon.hidden = true; handle.hidden = true; return; } // scrolled out of view
        placeBalloon(ir);
        handle.hidden = ir.bottom > vr.bottom || ir.right > vr.right + 4;
        handle.style.left = ir.right - sr.left - 9 + 'px'; handle.style.top = ir.bottom - sr.top - 9 + 'px';
        return;
      }
      handle.hidden = true;
      const a = closestIn('a');
      if (a && a.getAttribute('href')) {
        const href = a.getAttribute('href');
        balloon.replaceChildren(
          h('a', { class: 'wr-bb-url', href, target: '_blank', rel: 'noopener noreferrer', draggable: false, text: href.length > 40 ? href.slice(0, 38) + '…' : href, title: 'Open in a new tab' }),
          bbtn('Edit', 'Edit link', toLink), bbtn('Unlink', 'Remove link', unlink));
        placeBalloon(a.getBoundingClientRect());
        return;
      }
      balloon.hidden = true;
    }
    // drag the picture's corner to resize (stored as a percentage of the page width)
    let resizing = false;
    const selectImg = (img) => {
      selImg = img;
      const p = img.parentNode, i = Array.prototype.indexOf.call(p.childNodes, img);
      sel().setBaseAndExtent(p, i, p, i + 1);
      refresh();
    };
    handle.addEventListener('pointerdown', (e) => {
      if (!selImg) return;
      e.preventDefault(); handle.setPointerCapture(e.pointerId); resizing = true;
      const startX = e.clientX, startW = selImg.getBoundingClientRect().width, full = body.clientWidth - 24;
      const move = (ev) => { const pct = Math.max(5, Math.min(100, Math.round(((startW + ev.clientX - startX) / full) * 100))); selImg.setAttribute('width', pct + '%'); balloonUpdate(); };
      const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); resizing = false; changed(); if (selImg) selectImg(selImg); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
    });

    // -- events on the document itself
    on(document, 'selectionchange', () => { if (resizing) return; keepSel(); if (document.activeElement === body) { if (selImg && !(sel().anchorNode && (sel().anchorNode === selImg.parentNode))) selImg = null; refresh(); } });
    body.addEventListener('scroll', () => { if (selImg || !balloon.hidden) refresh(); });
    body.addEventListener('focus', () => { try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignore */ } });
    body.addEventListener('click', (e) => {
      if (readOnly) return;
      const t = e.target;
      if (t.tagName === 'IMG') { selectImg(t); return; }
      selImg = null;
      const li = t.closest && t.closest('li');
      if (li && li.parentElement.classList.contains('todo') && t === li && e.clientX - li.getBoundingClientRect().left < 26) { // the tick box
        if (li.hasAttribute('data-done')) li.removeAttribute('data-done'); else li.setAttribute('data-done', '1');
        changed();
      }
      refresh();
    });
    on(document, 'mousedown', (e) => { if (selImg && !stage.contains(e.target)) { selImg = null; refresh(); } });
    body.addEventListener('input', (e) => {
      if (e.inputType === 'insertFromDrop') { // text dragged in from another page: the browser pasted it unchecked, so clean what is there now
        const s0 = getSel();
        body.querySelectorAll('img.is-sel').forEach((i) => i.classList.remove('is-sel'));
        const clean = sanitizeToString(body.innerHTML);
        if (clean !== body.innerHTML) { load(clean); setSel(s0); }
      }
      if (e.inputType === 'insertParagraph') { const li = closestIn('li'); if (li) li.removeAttribute('data-done'); }
      if (!body.firstChild || (body.childNodes.length === 1 && body.firstChild.nodeName === 'BR')) { body.innerHTML = '<p><br></p>'; const r = document.createRange(); r.setStart(body.firstChild, 0); r.collapse(true); sel().removeAllRanges(); sel().addRange(r); }
      if (e.inputType === 'insertText' && e.data && /[*_`~]/.test(e.data)) inlineFormat();
      changed(true, !/^(insertText|deleteContent)/.test(e.inputType || ''));
    });
    body.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'historyUndo') { e.preventDefault(); undo(); } else if (e.inputType === 'historyRedo') { e.preventDefault(); redo(); }
    });

    // -- Markdown-style shortcuts while typing
    const inlineFormat = () => {
      const s = sel();
      if (!s.rangeCount || !s.isCollapsed || s.anchorNode.nodeType !== 3) return;
      const tn = s.anchorNode, off = s.anchorOffset, before = tn.data.slice(0, off);
      const rules = [
        [/\*\*([^*\s][^*]*?)\*\*$/, 'bold'], [/__([^_\s][^_]*?)__$/, 'bold'], [/~~([^~\s][^~]*?)~~$/, 'strikeThrough'],
        [/(?:^|[\s(])\*([^*\s][^*]*?)\*$/, 'italic'], [/(?:^|[\s(])_([^_\s][^_]*?)_$/, 'italic'], [/`([^`]+)`$/, 'code'],
      ];
      for (const [re, cmd] of rules) {
        const m = re.exec(before);
        if (!m) continue;
        const whole = m[0].replace(/^[\s(]/, '');
        const r = document.createRange(); r.setStart(tn, off - whole.length); r.setEnd(tn, off);
        s.removeAllRanges(); s.addRange(r);
        if (cmd === 'code') { wrapCode(r, m[1], false); return; }
        document.execCommand('insertText', false, m[1]);
        const n = s.anchorNode, o = s.anchorOffset;
        const r2 = document.createRange(); r2.setStart(n, Math.max(0, o - m[1].length)); r2.setEnd(n, o);
        s.removeAllRanges(); s.addRange(r2);
        document.execCommand('styleWithCSS', false, false);
        document.execCommand(cmd);
        s.collapseToEnd();
        if (document.queryCommandState(cmd)) document.execCommand(cmd);
        return;
      }
    };
    const blockShortcut = (e) => {
      const s = sel();
      if (!s.rangeCount || !s.isCollapsed || !inBody(s.anchorNode)) return false;
      let blk = anchorEl();
      while (blk && blk !== body && !/^(P|DIV)$/.test(blk.tagName)) blk = blk.parentElement;
      if (!blk || blk === body || blk.parentElement !== body) return false;
      const r = document.createRange(); r.setStart(blk, 0); r.setEnd(s.anchorNode, s.anchorOffset);
      const pre = r.toString();
      let run = null;
      let m;
      if ((m = /^(#{1,4})$/.exec(pre))) run = () => document.execCommand('formatBlock', false, 'h' + m[1].length);
      else if (/^[-*+]$/.test(pre)) run = () => list('ul');
      else if (/^\d{1,3}[.)]$/.test(pre)) run = () => list('ol');
      else if (/^>$/.test(pre)) run = () => document.execCommand('formatBlock', false, 'blockquote');
      else if (/^\[( |x)?\]$/i.test(pre)) run = () => list('todo');
      else if (/^```$/.test(pre)) run = () => document.execCommand('formatBlock', false, 'pre');
      if (!run) return false;
      e.preventDefault();
      s.removeAllRanges(); s.addRange(r);
      document.execCommand('delete');
      run(); keepSel(); changed();
      return true;
    };

    body.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') e.stopPropagation(); // typing digits must not switch scenario; Ctrl+Z is ours (Esc still restores an enlarged tile)
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (readOnly || e.isComposing || e.keyCode === 229) return; // not while an input method (Chinese, Japanese…) is composing
      if (mod && !e.shiftKey && !e.altKey && k === 'z') { e.preventDefault(); undo(); return; }
      if (mod && ((e.shiftKey && k === 'z') || (!e.shiftKey && k === 'y'))) { e.preventDefault(); redo(); return; }
      if (mod && !e.shiftKey && !e.altKey && k === 'k') { e.preventDefault(); toLink(); return; }
      if (mod && !e.shiftKey && !e.altKey && k === 'f') { e.preventDefault(); toggleFind(true); return; }
      if (mod && e.key === '\\') { e.preventDefault(); keepSel(); exec('removeFormat'); return; }
      if (mod && e.shiftKey && !e.altKey) {
        const map = { x: () => exec('strikeThrough'), l: () => exec('justifyLeft', null, true), e: () => exec('justifyCenter', null, true), r: () => exec('justifyRight', null, true), j: () => exec('justifyFull', null, true),
          7: () => list('ol'), 8: () => list('ul'), 9: () => list('todo') };
        const key = /^\d$/.test(e.code.slice(-1)) ? e.code.slice(-1) : k;
        if (map[key]) { e.preventDefault(); map[key](); return; }
      }
      if (mod && e.altKey && /^Digit[0-4]$/.test(e.code)) { e.preventDefault(); setBlockExact(e.code === 'Digit0' ? 'p' : 'h' + e.code.slice(-1)); return; }
      if (e.key === ' ' && !mod && !e.altKey) { if (blockShortcut(e)) return; }
      if (e.key === 'Tab' && !mod && !e.altKey) {
        const t = cellInfo();
        if (t) {
          e.preventDefault();
          const cells = Array.from(t.table.querySelectorAll('td,th'));
          let i = cells.indexOf(t.cell) + (e.shiftKey ? -1 : 1);
          if (i >= cells.length) { tableOp('rowAfter'); return; }
          if (i < 0) return;
          const r = document.createRange(); r.selectNodeContents(cells[i]); r.collapse(true); sel().removeAllRanges(); sel().addRange(r);
          return;
        }
        if (closestIn('li')) { e.preventDefault(); exec(e.shiftKey ? 'outdent' : 'indent'); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey && !mod) { // after a heading: a clean paragraph, not one that inherits the heading's colour and size
        const hd = closestIn('h1,h2,h3,h4,h5,h6'), s0 = sel();
        if (hd && s0.isCollapsed) {
          const tail = document.createRange(); tail.setStart(s0.anchorNode, s0.anchorOffset); tail.setEnd(hd, hd.childNodes.length);
          if (!tail.toString()) {
            e.preventDefault();
            const p = h('p', {}, h('br')); hd.after(p);
            const r = document.createRange(); r.setStart(p, 0); r.collapse(true); s0.removeAllRanges(); s0.addRange(r);
            changed(); return;
          }
        }
      }
      if (e.key === 'Enter' && !e.shiftKey && !mod && closestIn('pre')) { // new line inside a code block; two empty lines leave it
        const pre = closestIn('pre');
        const s = sel();
        const tail = pre.textContent;
        if (s.isCollapsed && /\n$/.test(tail.replace(/​/g, '')) && s.anchorOffset === (s.anchorNode.nodeType === 3 ? s.anchorNode.length : s.anchorNode.childNodes.length) && pre.lastChild === s.anchorNode) {
          e.preventDefault();
          pre.lastChild.nodeValue = pre.lastChild.nodeValue.replace(/\n$/, '');
          const p = h('p', {}, h('br')); pre.after(p);
          const r = document.createRange(); r.setStart(p, 0); r.collapse(true); s.removeAllRanges(); s.addRange(r);
          changed(); return;
        }
        e.preventDefault();
        document.execCommand('insertLineBreak');
        changed();
      }
    });
    const setBlockExact = (tag) => { back(); document.execCommand('formatBlock', false, tag); keepSel(); changed(); };

    // paste: keep formatting but only what is safe; images become uploads; a pasted address links the selection.
    // Ctrl/⌘+Shift+V and the right-click menu paste plain text instead.
    let plainUntil = 0;
    const pastePlain = (text) => { keepSel(); exec('insertText', String(text).replace(/\r\n?/g, '\n')); };
    const pasteHtml = (html) => { keepSel(); back(); document.execCommand('insertHTML', false, sanitizeToString(html)); changed(); };
    body.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v') plainUntil = Date.now() + 800;
    });
    body.addEventListener('paste', (e) => {
      if (readOnly) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const plain = Date.now() < plainUntil;
      plainUntil = 0;
      if (plain && dt.getData('text/plain')) { e.preventDefault(); pastePlain(dt.getData('text/plain')); return; }
      const imgs = Array.from(dt.files || []).filter((f) => /^image\//.test(f.type));
      if (imgs.length) { e.preventDefault(); imgs.forEach((f) => addImage(f)); return; }
      const text = (dt.getData('text/plain') || '').trim();
      if (/^https?:\/\/\S+$/i.test(text) && !dt.getData('text/html')) {
        e.preventDefault(); keepSel(); back();
        if (sel().isCollapsed) document.execCommand('insertHTML', false, h('a', { href: text, text }).outerHTML); else document.execCommand('createLink', false, text);
        changed(); return;
      }
      const html = dt.getData('text/html');
      if (html) { e.preventDefault(); pasteHtml(html); }
    });
    /** Menu paste: read the clipboard ourselves (the browser may ask once for permission). */
    const pasteFromClipboard = async (plain) => {
      try {
        if (!plain && navigator.clipboard.read) {
          for (const item of await navigator.clipboard.read()) {
            if (item.types.includes('text/html')) { pasteHtml(await (await item.getType('text/html')).text()); return; }
            if (item.types.includes('text/plain')) { pastePlain(await (await item.getType('text/plain')).text()); return; }
          }
          return;
        }
        pastePlain(await navigator.clipboard.readText());
      } catch (err) { HB.ui.toast('The browser blocked clipboard access. Press ' + (plain ? 'Ctrl+Shift+V' : 'Ctrl+V') + ' instead.', { type: 'error' }); }
    };
    // right-click: our own menu (the browser's has no "paste as plain text" for a page like this); `opts.moreMenu()` adds items (the tile menu)
    body.addEventListener('contextmenu', (e) => {
      if (readOnly) return; // shared view: the browser's own menu
      e.preventDefault(); // also tells the tile (which would show its own menu) to stand back
      keepSel();
      const hasSel = !!saved && !saved.collapsed;
      const t = cellInfo();
      const tbl = (label, k, danger) => ({ label, danger, onClick: () => tableOp(k) });
      const items = [
        { label: 'Cut', hint: 'Ctrl+X', disabled: !hasSel, onClick: () => exec('cut') },
        { label: 'Copy', hint: 'Ctrl+C', disabled: !hasSel, onClick: () => { back(); document.execCommand('copy'); } },
        { label: 'Paste', hint: 'Ctrl+V', onClick: () => pasteFromClipboard(false) },
        { label: 'Paste as plain text', hint: 'Ctrl+Shift+V', onClick: () => pasteFromClipboard(true) },
        { label: 'Select all', hint: 'Ctrl+A', onClick: () => { back(true); const r = document.createRange(); r.selectNodeContents(body); sel().removeAllRanges(); sel().addRange(r); keepSel(); } },
      ];
      if (t) items.push({ sep: true }, { label: 'Table', children: [tbl('Row above', 'rowBefore'), tbl('Row below', 'rowAfter'), tbl('Column left', 'colBefore'), tbl('Column right', 'colAfter'),
        tbl('Header row on/off', 'header'), tbl('Delete row', 'delRow', true), tbl('Delete column', 'delCol', true), tbl('Delete table', 'delTable', true)] });
      const more = opts.moreMenu ? opts.moreMenu() : [];
      if (more && more.length) items.push({ sep: true }, { label: 'Tile menu', children: more });
      HB.ui.menu(e.clientX, e.clientY, items);
    });

    // tables: drag the right edge of a cell to set its column width, the bottom edge to set the row height.
    // Sizes are inline px on the cells (width) and rows (height), which the sanitiser keeps, so they are saved with the text.
    if (!readOnly) {
      const EDGE = 5;
      let drag = null;
      const tableCells = (table) => Array.from(table.rows).flatMap((r) => Array.from(r.cells));
      const edgeAt = (e) => { // which table edge is under the pointer? → { kind: 'col'|'row', table, x|y } or null
        const cell = e.target.closest && e.target.closest('td,th');
        if (!cell || !body.contains(cell)) return null;
        const r = cell.getBoundingClientRect(), t = e.pointerType === 'touch' ? EDGE * 2 : EDGE, table = cell.closest('table');
        if (Math.abs(e.clientX - r.right) <= t) return { kind: 'col', table, x: r.right };
        if (Math.abs(e.clientX - r.left) <= t && cell.previousElementSibling) return { kind: 'col', table, x: r.left };
        if (Math.abs(e.clientY - r.bottom) <= t) return { kind: 'row', table, y: r.bottom };
        if (Math.abs(e.clientY - r.top) <= t && cell.parentElement.previousElementSibling) return { kind: 'row', table, y: r.top };
        return null;
      };
      const cursor = (kind) => { body.classList.toggle('wr-col-resize', kind === 'col'); body.classList.toggle('wr-row-resize', kind === 'row'); };
      body.addEventListener('pointermove', (e) => {
        if (drag) {
          if (drag.kind === 'col') drag.items.forEach((o) => { o.el.style.width = Math.max(24, Math.round(o.size + e.clientX - drag.at)) + 'px'; });
          else drag.items.forEach((o) => { o.el.style.height = Math.max(20, Math.round(o.size + e.clientY - drag.at)) + 'px'; });
          return;
        }
        const t = edgeAt(e);
        cursor(t && t.kind);
      });
      body.addEventListener('pointerleave', () => { if (!drag) cursor(null); });
      body.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        const t = edgeAt(e);
        if (!t) return;
        let items;
        if (t.kind === 'col') { // every cell whose right edge sits on the dragged line (also right with merged cells)
          items = tableCells(t.table).map((c) => ({ el: c, r: c.getBoundingClientRect() })).filter((o) => Math.abs(o.r.right - t.x) <= 2).map((o) => ({ el: o.el, size: o.r.width }));
        } else {
          items = Array.from(t.table.rows).map((tr) => ({ el: tr, r: tr.getBoundingClientRect() })).filter((o) => Math.abs(o.r.bottom - t.y) <= 2).map((o) => ({ el: o.el, size: o.r.height }));
        }
        if (!items.length) return;
        e.preventDefault(); // no text selection while dragging
        drag = { kind: t.kind, at: t.kind === 'col' ? e.clientX : e.clientY, items };
        body.setPointerCapture(e.pointerId);
        cursor(t.kind);
      });
      const endDrag = (e) => {
        if (!drag) return;
        drag = null;
        try { body.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
        cursor(null);
        changed();
      };
      body.addEventListener('pointerup', endDrag);
      body.addEventListener('pointercancel', endDrag);
    }
    body.addEventListener('drop', (e) => {
      const imgs = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter((f) => /^image\//.test(f.type));
      if (!imgs.length || readOnly) return;
      e.preventDefault(); // tells the page-wide upload handler to leave this drop alone
      imgs.forEach((f) => addImage(f));
    });

    root.append(stage, foot);
    updateCount();
    if (!readOnly) refresh();

    return {
      el: root, body, status,
      focus: () => body.focus(),
      getHTML,
      setHTML: (html) => { load(html); hist = [{ html: body.innerHTML, sel: null }]; pos = 0; updateEmpty(); updateCount(); },
      commit,
      destroy: () => { cleanups.forEach((f) => f()); clearTimeout(snapTimer); clearTimeout(countTimer); if (window.CSS && CSS.highlights) CSS.highlights.delete('wr-find'); },
    };
  };
})();
