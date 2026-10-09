(function () {
  const HB = (window.HB = window.HB || {});

  // A share link page carries <meta name="hb-share">: everything then runs read-only for that one scenario.
  const shareMeta = document.querySelector('meta[name=hb-share]');
  HB.shareSlug = shareMeta ? shareMeta.content : '';
  HB.readOnly = !!HB.shareSlug;

  /** Tiny DOM builder: HB.h('div', {class:'x', onclick:fn, dataset:{id:1}}, 'text', child, [more]) */
  HB.h = function (tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined) continue;
      if (['value', 'checked', 'disabled', 'hidden', 'selected', 'draggable'].includes(k)) { el[k] = v; continue; }
      if (v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => {
      if (Array.isArray(c)) c.forEach(add);
      else if (c === null || c === undefined || c === false) return;
      else el.append(c.nodeType ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  };

  HB.$ = (sel, root) => (root || document).querySelector(sel);
  HB.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  HB.bus = (function () {
    const m = {};
    return {
      on(n, f) { (m[n] = m[n] || []).push(f); },
      emit(n, d) { (m[n] || []).slice().forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); },
    };
  })();

  HB.debounce = function (fn, ms) {
    let t;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.flush = () => { clearTimeout(t); };
    return d;
  };

  HB.isTyping = function (t) {
    t = t || document.activeElement;
    if (!t) return false;
    return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
  };

  HB.size = function (n) {
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n >= 100 ? n.toFixed(0) : n.toFixed(1)) + ' ' + u[i];
  };

  HB.fmtDateTime = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'Today ' + time;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday ' + time;
    const opts = d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' };
    return d.toLocaleDateString([], opts) + ' ' + time;
  };

  /** Only web links are allowed on link cards; bare domains get https://. Returns '' when unsafe. */
  HB.normUrl = function (u) {
    u = (u || '').trim();
    if (!u) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) {
      return /^(https?:|mailto:|tel:)/i.test(u) ? u : '';
    }
    if (/^[^\s/]+\.[^\s/]{2,}(\/.*)?$/.test(u) || /^localhost(:\d+)?(\/.*)?$/.test(u)) return 'https://' + u;
    return '';
  };

  HB.parseTags = (s) => (s || '').split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
  HB.tagsToString = (arr) => Array.from(new Set(arr.map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))).join(', ');
  /** Pull #hashtags out of free text. */
  HB.hashtags = (text) => Array.from((text || '').matchAll(/(?:^|\s)#([\p{L}\p{N}_-]{1,30})/gu)).map((m) => m[1]);

  HB.colors = ['', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'];


  /** Local calendar day as YYYY-MM-DD (not UTC), for habits and the time log. */
  HB.localDay = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  HB.parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  HB.addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };

  /** Drag bookkeeping shared by tiles, Sortable lists and the trash zone. */
  HB.drag = { active: 0, endedAt: 0 };
})();
