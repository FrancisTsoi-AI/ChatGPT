(function () {
  const HB = window.HB;
  const h = HB.h;
  const layer = () => document.getElementById('layer');

  const ui = (HB.ui = {});

  // ---- toasts ----------------------------------------------------------------------------
  /** toast('text', {type:'error'|'ok', timeout:ms|0, progress:true}) -> {set, progress, close} */
  ui.toast = function (msg, opt) {
    opt = opt || {};
    const text = h('span', { class: 'toast-text', text: msg });
    const bar = opt.progress ? h('div', { class: 'toast-bar' }, h('i')) : null;
    const el = h('div', { class: 'toast ' + (opt.type || '') }, text, bar);
    document.getElementById('toasts').append(el);
    let timer = null;
    const close = () => { clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 200); };
    const timeout = opt.timeout === undefined ? (opt.type === 'error' ? 6000 : 2600) : opt.timeout;
    if (timeout) timer = setTimeout(close, timeout);
    el.addEventListener('click', close);
    return {
      el, close,
      set(m) { text.textContent = m; },
      progress(p) { if (bar) bar.firstChild.style.width = Math.round(p * 100) + '%'; },
      done(m, ms) { text.textContent = m; if (bar) bar.remove(); clearTimeout(timer); timer = setTimeout(close, ms || 2200); },
    };
  };

  // ---- modal -----------------------------------------------------------------------------
  ui.modal = function (o) {
    const prevFocus = document.activeElement;
    const back = h('div', { class: 'modal-back' });
    const head = h('div', { class: 'modal-head' }, h('h2', { text: o.title || '' }),
      h('button', { class: 'btn icon ghost', 'aria-label': 'Close', text: '✕', onclick: () => api.close() }));
    const body = h('div', { class: 'modal-body' });
    const foot = h('div', { class: 'modal-foot' });
    const box = h('div', { class: 'modal' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' }, head, body, foot);
    back.append(box);
    if (o.content) body.append(o.content);
    (o.actions || []).forEach((a) => {
      foot.append(h('button', {
        class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), text: a.label, type: 'button',
        onclick: () => { if (a.onClick) a.onClick(api); else api.close(); },
      }));
    });
    if (!(o.actions || []).length) foot.hidden = true;
    let closed = false;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); api.close(); }
    };
    const api = {
      el: box, body, foot,
      close(result) {
        if (closed) return; closed = true;
        document.removeEventListener('keydown', onKey, true);
        back.remove();
        HB.modalCount = Math.max(0, (HB.modalCount || 1) - 1);
        if (o.onClose) o.onClose(result);
        if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
      },
    };
    back.addEventListener('mousedown', (e) => { if (e.target === back) api.close(); });
    document.addEventListener('keydown', onKey, true);
    layer().append(back);
    HB.modalCount = (HB.modalCount || 0) + 1;
    const first = box.querySelector('input:not([type=hidden]),textarea,select');
    if (first) { first.focus(); if (first.select && first.type !== 'date') first.select(); }
    return api;
  };

  /** Promise-based form dialog. Returns the values object, or null if cancelled. */
  ui.form = function (o) {
    if (HB.readOnly && !o.readOnlyOk) { HB.store._readOnly(); return Promise.resolve(null); }
    return new Promise((resolve) => {
      const form = h('form', { class: 'form', novalidate: true });
      const inputs = {};
      const pendingFollow = [];
      (o.fields || []).forEach((f) => {
        let input;
        if (f.type === 'textarea') input = h('textarea', { rows: f.rows || 3, placeholder: f.placeholder || '', value: f.value || '' });
        else if (f.type === 'select') {
          input = h('select', {}, (f.options || []).map((op) => h('option', { value: op.value, text: op.label, selected: op.value === f.value })));
        } else if (f.type === 'checkbox') input = h('input', { type: 'checkbox', checked: !!f.value });
        else if (f.type === 'emoji') {
          const box = h('div', { class: 'emoji-field' });
          const inp = h('input', { type: 'text', value: f.value || '', maxlength: 8, placeholder: f.placeholder || 'none', autocomplete: 'off', class: 'emoji-input' });
          const pick = h('button', { type: 'button', class: 'btn', text: '😀 Choose…', onclick: () => {
            const r = pick.getBoundingClientRect();
            HB.emoji.open(r.left, r.bottom + 4, (e) => { inp.value = e; inp.dataset.touched = '1'; });
          } });
          inp.addEventListener('input', () => { inp.dataset.touched = '1'; });
          box.append(inp, pick, h('button', { type: 'button', class: 'btn ghost', text: 'Clear', onclick: () => { inp.value = ''; inp.dataset.touched = '1'; } }));
          Object.defineProperty(box, 'value', { get: () => inp.value, set: (v) => { inp.value = v; } });
          box._inner = inp;
          input = box;
        } else if (f.type === 'color') {
          input = h('div', { class: 'swatch-row' });
          input.value = f.value || '';
          HB.colors.forEach((c) => {
            const s = h('button', {
              type: 'button', class: 'swatch' + (c === input.value ? ' on' : ''), dataset: { color: c }, title: c || 'none',
              onclick: () => { input.value = c; input.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x.dataset.color === c)); },
            });
            input.append(s);
          });
        } else input = h('input', { type: f.type || 'text', value: f.value || '', placeholder: f.placeholder || '', maxlength: f.max || null, autocomplete: 'off' });
        inputs[f.name] = input;
        if (f.follow) pendingFollow.push(f);
        form.append(h('label', { class: 'field' + (f.type === 'checkbox' ? ' inline' : '') }, h('span', { text: f.label }), input,
          f.hint ? h('small', { class: 'muted', text: f.hint }) : null));
      });
      // an emoji field can follow another field and suggest an icon from what is typed there
      pendingFollow.forEach((f) => {
        const src = inputs[f.follow], emo = inputs[f.name]._inner;
        const fill = () => { if (!emo.dataset.touched) emo.value = HB.emoji.suggest(src.value) || ''; };
        src.addEventListener('input', fill);
        fill();
      });
      const err = h('p', { class: 'form-err' });
      form.append(err);
      const submit = () => {
        const out = {};
        for (const f of o.fields || []) {
          const el = inputs[f.name];
          out[f.name] = f.type === 'checkbox' ? el.checked : (el.value || '').trim();
          if (f.required && !out[f.name]) { err.textContent = f.label + ' is required'; el.focus && el.focus(); return; }
          if (f.validate) { const m = f.validate(out[f.name]); if (m) { err.textContent = m; return; } }
        }
        done = true; m.close(); resolve(out);
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
      let done = false;
      const m = ui.modal({
        title: o.title, content: form,
        onClose: () => { if (!done) resolve(null); },
        actions: [
          { label: 'Cancel' },
          { label: o.submit || 'Save', primary: true, danger: o.danger, onClick: submit },
        ],
      });
    });
  };

  ui.confirm = function (o) {
    return new Promise((resolve) => {
      let ok = false;
      ui.modal({
        title: o.title || 'Are you sure?', content: h('p', { text: o.message || '' }),
        onClose: () => resolve(ok),
        actions: [{ label: 'Cancel' }, { label: o.confirm || 'OK', primary: !o.danger, danger: !!o.danger, onClick: (m) => { ok = true; m.close(); } }],
      });
    });
  };

  // ---- context / dropdown menu -------------------------------------------------------------
  let openMenus = [];
  ui.closeMenus = function () { openMenus.forEach((m) => m.remove()); openMenus = []; };

  function buildMenu(items, depth) {
    const m = h('div', { class: 'menu', role: 'menu' });
    items.filter(Boolean).forEach((it) => {
      if (it.sep) { m.append(h('div', { class: 'menu-sep' })); return; }
      if (it.header) { m.append(h('div', { class: 'menu-header', text: it.header })); return; }
      if (it.swatches) {
        const row = h('div', { class: 'swatch-row menu-swatches' });
        HB.colors.forEach((c) => row.append(h('button', {
          type: 'button', class: 'swatch' + (c === (it.swatches.value || '') ? ' on' : ''), dataset: { color: c }, title: c || 'none',
          onclick: () => { ui.closeMenus(); it.swatches.onPick(c); },
        })));
        m.append(row);
        return;
      }
      const row = h('button', {
        type: 'button', class: 'menu-item' + (it.danger ? ' danger' : ''), role: 'menuitem', disabled: !!it.disabled,
      }, h('span', { class: 'menu-check', text: it.checked ? '✓' : '' }), h('span', { class: 'menu-label', text: it.label }),
      it.children ? h('span', { class: 'menu-arrow', text: '▸' }) : (it.hint ? h('span', { class: 'menu-hint', text: it.hint }) : null));
      if (it.children) {
        let sub = null;
        const openSub = () => {
          if (sub) return;
          sub = buildMenu(it.children, depth + 1);
          sub.classList.add('sub');
          layer().append(sub);
          openMenus.push(sub);
          const r = row.getBoundingClientRect();
          place(sub, r.right - 2, r.top - 4, r.left);
        };
        row.addEventListener('click', (e) => { e.stopPropagation(); openSub(); });
        row.addEventListener('mouseenter', openSub);
        row.addEventListener('mouseleave', (e) => {
          if (sub && !(e.relatedTarget && sub.contains(e.relatedTarget))) { sub.remove(); openMenus = openMenus.filter((x) => x !== sub); sub = null; }
        });
      } else {
        row.addEventListener('click', () => { ui.closeMenus(); if (it.onClick) it.onClick(); });
      }
      m.append(row);
    });
    return m;
  }

  function place(el, x, y, flipX) {
    el.style.left = '0px'; el.style.top = '0px';
    const w = el.offsetWidth, hgt = el.offsetHeight;
    let left = x, top = y;
    if (left + w > innerWidth - 8) left = Math.max(8, (flipX !== undefined ? flipX - w + 2 : innerWidth - w - 8));
    if (top + hgt > innerHeight - 8) top = Math.max(8, innerHeight - hgt - 8);
    el.style.left = left + 'px'; el.style.top = top + 'px';
  }

  /** Show any element as a floating popover (closes on outside click / Esc like a menu). */
  ui.popover = function (el, x, y) {
    ui.closeMenus();
    el.classList.add('popover');
    layer().append(el);
    openMenus.push(el);
    place(el, x, y);
  };

  ui.menu = function (x, y, items) {
    ui.closeMenus();
    const m = buildMenu(items, 0);
    layer().append(m);
    openMenus.push(m);
    place(m, x, y);
    const first = m.querySelector('.menu-item:not([disabled])');
    if (first) first.focus({ preventScroll: true });
    m.addEventListener('keydown', (e) => {
      const els = Array.from(m.querySelectorAll('.menu-item:not([disabled])'));
      const i = els.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (els[i + 1] || els[0]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (els[i - 1] || els[els.length - 1]).focus(); }
    });
  };
  /** Open a menu under a button. */
  ui.menuAt = function (btn, items) {
    const r = btn.getBoundingClientRect();
    ui.menu(r.left, r.bottom + 4, items);
  };

  document.addEventListener('mousedown', (e) => {
    if (openMenus.length && !openMenus.some((m) => m.contains(e.target))) ui.closeMenus();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenus.length) { ui.closeMenus(); e.stopImmediatePropagation(); } }, true);
  window.addEventListener('blur', () => ui.closeMenus());
  window.addEventListener('resize', () => ui.closeMenus());

  // ---- inline editing ----------------------------------------------------------------------
  /** Swap `el` for an input; Enter/blur saves, Esc cancels. */
  ui.inlineEdit = function (el, o) {
    if (HB.readOnly) return null;
    const multiline = !!o.multiline;
    const input = h(multiline ? 'textarea' : 'input', { class: 'inline-edit', value: o.value || '', maxlength: o.max || null, rows: multiline ? 3 : null });
    if (o.key) input.dataset.key = o.key;
    let finished = false;
    const finish = (save) => {
      if (finished) return; finished = true;
      const v = input.value.trim();
      input.replaceWith(el);
      if (save && v !== (o.value || '') && (v || o.allowEmpty)) o.onSave(v);
      else if (o.onCancel) o.onCancel();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (!multiline || !e.shiftKey)) { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
      e.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
    el.replaceWith(input);
    input.focus();
    input.select();
    return input;
  };
})();
