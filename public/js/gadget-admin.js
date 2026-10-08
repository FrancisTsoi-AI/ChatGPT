(function () {
  const HB = window.HB;
  const h = HB.h;

  // The Gadgets & updates page (⋯ → Gadgets & updates…), like WordPress's Plugins and Updates screens:
  // drop a gadget .zip to install or update it, add built-in gadgets from the catalog with one click, switch
  // a gadget off or on, download or delete it, and update Home Base itself by dropping its one file
  // (homebase-setup.php or homebase.zip). Server side: private/src/gadget_admin.php and package.php.

  const reload = async (msg) => { HB.ui.toast(msg + ' Reloading…'); await HB.store.flush(); setTimeout(() => location.reload(), 600); };
  const exportUrl = (type) => 'api.php?r=gadgets/export&type=' + encodeURIComponent(type);

  /** Step 1: send the zip; the server checks and stages it. Step 2: show what it is and ask for the passphrase. */
  async function upload(file, list) {
    if (!file) return;
    if (!/\.(zip|php)$/i.test(file.name)) { HB.ui.toast('Choose a gadget .zip, or the Home Base file (homebase-setup.php / homebase.zip)', { type: 'error' }); return; }
    const t = HB.ui.toast('Checking ' + file.name + '…', { timeout: 0 });
    const form = new FormData();
    form.append('file', file, file.name);
    let r;
    try { r = await HB.api.call('gadgets/upload', { method: 'POST', form }); } catch (e) { t.close(); HB.ui.toast(e.message, { type: 'error', timeout: 9000 }); return; }
    t.close();
    if (list) list.close();
    confirmInstall(r.token, r.preview);
  }

  function confirmInstall(token, p) {
    if (p.kind === 'core') return confirmCore(token, p);
    const cur = p.current;
    const pass = h('input', { type: 'password', autocomplete: 'current-password', class: 'ga-pass', 'aria-label': 'Your passphrase' });
    const err = h('p', { class: 'form-err', hidden: true });
    const facts = [
      cur ? 'Version ' + cur.version + ' → ' + p.version : 'Version ' + p.version,
      p.author ? 'by ' + p.author : '',
      p.files + ' files, ' + HB.size(p.bytes),
    ].filter(Boolean).join(' · ');
    const content = h('div', { class: 'ga-confirm' },
      h('div', { class: 'ga-head' }, h('span', { class: 'ga-icon', text: p.icon }),
        h('div', {}, h('b', { text: p.label }), h('div', { class: 'muted small', text: facts }))),
      p.description ? h('p', { text: p.description }) : null,
      !cur && p.tiles ? h('p', { class: 'small', text: p.tiles === 1 ? '1 tile of this type already exists and will work again.' : p.tiles + ' tiles of this type already exist and will work again.' }) : null,
      h('div', { class: 'ga-warn' + (p.server ? ' strong' : '') },
        h('p', { text: 'A gadget runs inside your Home Base and can read and change your data. Install gadgets only from people you trust.' }),
        p.notes.map((n) => h('p', { text: n }))),
      h('label', { class: 'field' }, h('span', { text: 'Your passphrase (to confirm)' }), pass), err);
    let busy = false;
    const go = async (m) => {
      if (busy) return;
      busy = true; err.hidden = true;
      try {
        const r = await HB.api.call('gadgets/install', { method: 'POST', body: { token, passphrase: pass.value } });
        m.close();
        reload((r.updated ? 'Updated “' : 'Installed “') + p.label + '” ' + r.version + '.');
      } catch (e) {
        err.textContent = e.message; err.hidden = false; pass.select();
        if (e.status === 410) setTimeout(() => m.close(), 2500);
      }
      busy = false;
    };
    const m = HB.ui.modal({ title: (cur ? 'Update' : 'Install') + ' gadget', content,
      actions: [{ label: 'Cancel' }, { label: cur ? 'Update' : 'Install', primary: true, onClick: (mm) => go(mm) }] });
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(m); } });
    pass.focus();
  }

  /** Updating Home Base itself: what changes, then the passphrase. */
  function confirmCore(token, p) {
    const cur = p.current.version;
    const pass = h('input', { type: 'password', autocomplete: 'current-password', class: 'ga-pass', 'aria-label': 'Your passphrase' });
    const err = h('p', { class: 'form-err', hidden: true });
    const list = (title, items, fmt) => (items.length ? h('div', { class: 'ga-sub' }, h('b', { class: 'small', text: title }),
      h('ul', { class: 'small' }, items.map((x) => h('li', { text: fmt(x) })))) : null);
    const content = h('div', { class: 'ga-confirm' },
      h('div', { class: 'ga-head' }, h('span', { class: 'ga-icon', text: '🏠' }),
        h('div', {}, h('b', { text: 'Home Base ' + p.version }), h('div', { class: 'muted small', text: 'You have ' + cur + ' · ' + HB.size(p.bytes) }))),
      list('Gadgets that will be updated', p.updates, (u) => u.label + ' ' + u.from + ' → ' + u.to),
      list('New built-in gadgets (add them afterwards with one click)', p.new, (n) => n.icon + ' ' + n.label + ' ' + n.version),
      h('div', { class: 'ga-warn' }, p.notes.map((n) => h('p', { text: n }))),
      h('label', { class: 'field' }, h('span', { text: 'Your passphrase (to confirm)' }), pass), err);
    let busy = false;
    const go = async (m) => {
      if (busy) return;
      busy = true; err.hidden = true;
      try {
        const r = await HB.api.call('gadgets/install', { method: 'POST', body: { token, passphrase: pass.value } });
        m.close();
        const rep = r.report || {};
        const extra = [rep.updated && rep.updated.length ? rep.updated.length + ' gadget(s) updated' : '', ...(rep.notes || [])].filter(Boolean).join(' · ');
        reload('Home Base is now ' + r.version + '.' + (extra ? ' ' + extra + '.' : ''));
      } catch (e) {
        err.textContent = e.message; err.hidden = false; pass.select();
        if (e.status === 410) setTimeout(() => m.close(), 2500);
      }
      busy = false;
    };
    const m = HB.ui.modal({ title: 'Update Home Base', content,
      actions: [{ label: 'Cancel' }, { label: 'Update Home Base', primary: true, onClick: (mm) => go(mm) }] });
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(m); } });
    pass.focus();
  }

  /** Add (or update) built-in gadgets from the catalog that ships with Home Base: no file needed. */
  async function fromCatalog(types, list, verb) {
    const t = HB.ui.toast((verb || 'Installing') + '…', { timeout: 0 });
    const done = [];
    for (const type of types) {
      try { await HB.api.call('gadgets/catalog', { method: 'POST', body: { type } }); done.push(type); } catch (e) {
        t.close(); HB.ui.toast(type + ': ' + e.message, { type: 'error', timeout: 8000 });
        if (!done.length) return;
        break;
      }
    }
    t.close();
    list.close();
    reload((verb === 'Updating' ? 'Updated ' : 'Installed ') + done.length + ' gadget' + (done.length === 1 ? '' : 's') + '.');
  }

  /** Delete an installed gadget (g.label set), or clear away the tiles of one that is gone. */
  async function remove(g, list) {
    const cb = h('input', { type: 'checkbox', checked: true });
    const n = g.tiles + ' tile' + (g.tiles === 1 ? '' : 's');
    const content = g.label ? h('div', {},
      h('p', { text: 'Its code is removed from your server. Other gadgets are not affected.' }),
      g.tiles ? h('label', { class: 'field inline' }, cb, h('span', { text: 'Also move its ' + n + ' (with their content) to the Trash' })) : null,
      g.tiles ? h('p', { class: 'muted small', text: 'Untick to keep them: they then say the gadget is missing, and installing it again brings them back.' }) : null)
      : h('p', { text: 'Move the ' + n + ' of “' + g.type + '” (with their content) to the Trash? They are deleted for good after 30 days.' });
    let ok = false;
    await new Promise((resolve) => HB.ui.modal({
      title: g.label ? 'Delete the “' + g.label + '” gadget?' : 'Remove tiles of “' + g.type + '”?', content, onClose: resolve,
      actions: [{ label: 'Cancel' }, { label: g.label ? 'Delete gadget' : 'Move to Trash', danger: true, primary: true, onClick: (m) => { ok = true; m.close(); } }],
    }));
    if (!ok) return;
    try {
      const r = await HB.api.call('gadgets/delete', { method: 'POST', body: { type: g.type, trash_tiles: !g.label || (g.tiles > 0 && cb.checked) } });
      list.close();
      reload((g.label ? 'Deleted “' + g.label + '”' : 'Removed') + (r.tiles ? '; ' + r.tiles + ' tile' + (r.tiles === 1 ? '' : 's') + ' moved to the Trash' : '') + '.');
    } catch (e) { HB.ui.toast(e.message, { type: 'error', timeout: 8000 }); }
  }

  async function toggle(g, list) {
    try {
      await HB.api.call('gadgets/switch', { method: 'POST', body: { type: g.type, on: !g.on } });
      list.close();
      reload((g.on ? 'Switched off “' : 'Switched on “') + g.label + '”.');
    } catch (e) { HB.ui.toast(e.message, { type: 'error' }); }
  }

  HB.gadgetAdmin = {
    upload,
    async open() {
      if (HB.readOnly) return;
      let info;
      try { info = await HB.api.call('gadgets'); } catch (e) { HB.ui.toast('Could not load the gadgets: ' + e.message, { type: 'error' }); return; }
      const failed = new Set(HB.gadgets.failed());
      let modal;

      // the drop box: a zip dropped here never goes to the page-wide file upload (data-own-drop)
      const input = h('input', { type: 'file', accept: '.zip,.php,application/zip', hidden: true, onchange: () => upload(input.files[0], modal) });
      const blocked = !info.install ? 'Installing from files is switched off (HB_GADGET_INSTALL=0 in .env). Built-in gadgets below can still be added.'
        : !info.zip ? 'This server has no PHP "zip" extension. Ask your host to switch it on.'
          : !info.writable ? 'PHP cannot write to the folder homebase-private/gadgets. Ask your host to make it writable (permissions 755).' : '';
      const zone = h('div', { class: 'ga-drop' + (blocked ? ' off' : ''), dataset: { ownDrop: '1' }, tabindex: blocked ? null : '0', role: 'button',
        onclick: () => { if (!blocked) input.click(); },
        onkeydown: (e) => { if (!blocked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); input.click(); } } },
      h('div', { class: 'ga-drop-big', text: blocked ? 'Dropping files here is not available' : '⬆  Drop a gadget .zip, or a Home Base update, here (or click to choose)' }),
      h('div', { class: 'muted small', text: blocked || 'A gadget .zip installs it, or updates the one you have. The Home Base file (homebase-setup.php or homebase.zip) updates Home Base itself. Up to ' + info.max_mb + ' MB.' }), input);
      zone.addEventListener('dragover', (e) => { e.preventDefault(); if (!blocked) { e.dataTransfer.dropEffect = 'copy'; zone.classList.add('hot'); } });
      zone.addEventListener('dragleave', () => zone.classList.remove('hot'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault(); // tells the page-wide upload to leave this drop alone
        zone.classList.remove('hot');
        if (!blocked) upload(e.dataTransfer.files[0], modal);
      });

      const rows = h('div', { class: 'ga-list' });
      info.gadgets.forEach((g) => {
        const badges = [
          !g.on ? h('span', { class: 'ga-badge off', text: 'switched off' }) : null,
          g.on && failed.has(g.type) ? h('span', { class: 'ga-badge bad', text: 'did not load' }) : null,
          g.server ? h('span', { class: 'ga-badge', text: 'server code', title: 'Has a server.php that runs on your web server' }) : null,
          g.update ? h('span', { class: 'ga-badge new', text: 'update: ' + g.update }) : null,
        ];
        const meta = [g.version ? 'v' + g.version : '', g.author, g.tiles ? g.tiles + ' tile' + (g.tiles === 1 ? '' : 's') : 'not used', HB.size(g.bytes)].filter(Boolean).join(' · ');
        rows.append(h('div', { class: 'ga-row' + (g.on ? '' : ' is-off'), dataset: { type: g.type } },
          h('span', { class: 'ga-icon', text: g.icon }),
          h('div', { class: 'ga-info' },
            h('div', {}, h('b', { text: g.label }), ' ', h('code', { class: 'muted small', text: g.type }), ' ', badges),
            h('div', { class: 'muted small', text: meta }),
            g.description ? h('div', { class: 'small', text: g.description }) : null),
          h('div', { class: 'ga-btns' },
            g.update ? h('button', { class: 'btn small primary', type: 'button', text: 'Update', onclick: () => fromCatalog([g.type], modal, 'Updating') }) : null,
            h('button', { class: 'btn small', type: 'button', text: g.on ? 'Switch off' : 'Switch on', onclick: () => toggle(g, modal) }),
            h('a', { class: 'btn small ghost', href: exportUrl(g.type), download: g.type + '.zip', text: '⬇ .zip', title: 'Download this gadget as a .zip (to back it up, change it, or install it elsewhere)', draggable: false }),
            h('button', { class: 'btn small danger', type: 'button', text: 'Delete…', onclick: () => remove(g, modal) }))));
      });
      if (!info.gadgets.length) rows.append(h('p', { class: 'empty', text: 'No gadgets installed. Add the built-in ones below, or drop a gadget .zip above.' }));

      const avail = info.available.length ? h('div', { class: 'ga-missing ga-avail' },
        h('div', { class: 'ga-sechead' }, h('h3', { text: 'Built-in gadgets you can add' }),
          info.available.length > 1 ? h('button', { class: 'btn small primary', type: 'button', text: 'Add all ' + info.available.length, onclick: () => fromCatalog(info.available.map((a) => a.type), modal) }) : null),
        info.available.map((a) => h('div', { class: 'ga-row', dataset: { type: a.type } },
          h('span', { class: 'ga-icon', text: a.icon }),
          h('div', { class: 'ga-info' }, h('div', {}, h('b', { text: a.label }), ' ', h('code', { class: 'muted small', text: a.type })),
            h('div', { class: 'muted small', text: 'v' + a.version + (a.group ? ' · ' + a.group : '') }), a.description ? h('div', { class: 'small', text: a.description }) : null),
          h('div', { class: 'ga-btns' }, h('button', { class: 'btn small primary', type: 'button', text: 'Add', onclick: () => fromCatalog([a.type], modal) }))))) : null;

      const missing = info.missing.length ? h('div', { class: 'ga-missing' },
        h('h3', { text: 'Tiles without a gadget' }),
        info.missing.map((m) => h('div', { class: 'ga-row' },
          h('span', { class: 'ga-icon', text: '?' }),
          h('div', { class: 'ga-info' }, h('code', { text: m.type }), h('div', { class: 'muted small', text: m.tiles + ' tile' + (m.tiles === 1 ? '' : 's') + ' · install the gadget again to bring them back' })),
          h('div', { class: 'ga-btns' }, h('button', { class: 'btn small danger', type: 'button', text: 'Move tiles to Trash…', onclick: () => remove({ type: m.type, tiles: m.tiles }, modal) }))))) : null;

      modal = HB.ui.modal({
        title: 'Gadgets & updates', wide: true,
        content: h('div', { class: 'ga' },
          h('div', { class: 'ga-version muted small' }, 'Home Base ', h('b', { text: info.version }),
            info.core_update ? ' · updates from a file are not possible here: ' + info.core_update : ' · to update, drop the newer Home Base file in the box below'),
          zone, h('h3', { class: 'ga-h', text: 'Installed gadgets (' + info.gadgets.length + ')' }), rows, avail, missing,
          h('p', { class: 'muted small', text: 'Each gadget is self-contained; switching one off or deleting it does not touch the others. How to build one: GADGET_API.md.' })),
        actions: [{ label: 'Close', primary: true }],
      });
    },
  };
})();
