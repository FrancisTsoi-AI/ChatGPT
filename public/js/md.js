(function () {
  const HB = window.HB;
  const h = HB.h;

  /**
   * Small Markdown renderer that builds DOM nodes (never innerHTML), so nothing in the text can inject markup.
   * Supports: # headings, paragraphs, **bold**, *italic*, ~~strike~~, `code`, ``` fences, > quotes, - / 1. lists
   * (nested by 2-space indent), - [ ] task checkboxes, --- rules, [text](http-link) and bare http(s) links.
   */
  const safeHref = (u) => (/^(https?:|mailto:)/i.test(u.trim()) ? u.trim() : '');

  function inline(text) {
    const out = [];
    let i = 0, buf = '';
    const flush = () => { if (buf) { out.push(document.createTextNode(buf)); buf = ''; } };
    const rules = [
      [/^`([^`\n]+)`/, (m) => h('code', { text: m[1] })],
      [/^\*\*([^\n]+?)\*\*/, (m) => h('strong', {}, inline(m[1]))],
      [/^__([^\n]+?)__/, (m) => h('strong', {}, inline(m[1]))],
      [/^~~([^\n]+?)~~/, (m) => h('del', {}, inline(m[1]))],
      [/^\*([^*\s][^*\n]*?)\*/, (m) => h('em', {}, inline(m[1]))],
      [/^_([^_\s][^_\n]*?)_(?![\w])/, (m) => h('em', {}, inline(m[1]))],
      [/^\[([^\]\n]+)\]\(([^)\s]+)\)/, (m) => {
        const href = safeHref(m[2]);
        return href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, inline(m[1])) : document.createTextNode(m[0]);
      }],
      [/^https?:\/\/[^\s<>)]+[^\s<>).,;:!?]/, (m) => h('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer', text: m[0] })],
    ];
    while (i < text.length) {
      const rest = text.slice(i);
      let hit = false;
      if (/[`*_~[h]/.test(rest[0])) {
        for (const [re, mk] of rules) {
          const m = rest.match(re);
          if (m) { flush(); out.push(mk(m)); i += m[0].length; hit = true; break; }
        }
      }
      if (!hit) { buf += rest[0]; i++; }
    }
    flush();
    return out;
  }

  /** opts.onToggle(lineIndex, checked) is called when a task checkbox is clicked. */
  function render(src, opts) {
    opts = opts || {};
    const root = document.createDocumentFragment();
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    let i = 0;
    const isBlank = (l) => /^\s*$/.test(l);
    const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

    function parseList(indent) {
      const first = lines[i].match(listRe);
      const ordered = /\d/.test(first[2]);
      const ul = h(ordered ? 'ol' : 'ul', { class: 'md-list' });
      while (i < lines.length) {
        const m = lines[i].match(listRe);
        if (!m || m[1].length < indent) break;
        if (m[1].length > indent) {
          const li = ul.lastElementChild;
          if (li) li.append(parseList(m[1].length)); else break;
          continue;
        }
        const t = m[3].match(/^\[( |x|X)\]\s+(.*)$/);
        const li = h('li', {});
        if (t) {
          const idx = i;
          li.classList.add('md-task');
          li.append(h('input', { type: 'checkbox', checked: t[1] !== ' ', onchange: (e) => { if (opts.onToggle) opts.onToggle(idx, e.target.checked); } }), ' ', ...inline(t[2]));
        } else li.append(...inline(m[3]));
        ul.append(li);
        i++;
      }
      return ul;
    }

    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) { i++; continue; }
      const fence = line.match(/^```(.*)$/);
      if (fence) {
        const code = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
        i++;
        root.append(h('pre', { class: 'md-pre' }, h('code', { text: code.join('\n') })));
        continue;
      }
      const hd = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (hd) { root.append(h('h' + Math.min(6, hd[1].length + 1), { class: 'md-h' }, inline(hd[2]))); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { root.append(h('hr')); i++; continue; }
      if (/^>/.test(line)) {
        const q = [];
        while (i < lines.length && /^>/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
        root.append(h('blockquote', { class: 'md-quote' }, render(q.join('\n'), {})));
        continue;
      }
      if (listRe.test(line)) { root.append(parseList(line.match(listRe)[1].length)); continue; }
      const para = [];
      while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s)/.test(lines[i])) para.push(lines[i++]);
      const p = h('p', { class: 'md-p' });
      para.forEach((l, n) => { if (n) p.append(h('br')); p.append(...inline(l.replace(/\s+$/, ''))); });
      root.append(p);
    }
    return root;
  }

  /** Flip a "- [ ]" box on a given line of the source. */
  function toggleLine(src, idx, checked) {
    const lines = String(src).split('\n');
    if (lines[idx]) lines[idx] = lines[idx].replace(/\[( |x|X)\]/, checked ? '[x]' : '[ ]');
    return lines.join('\n');
  }

  HB.md = { render, toggleLine };
})();
