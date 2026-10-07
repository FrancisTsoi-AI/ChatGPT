(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  function hue(s) { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) % 360; return n; }

  function host(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } }

  function iconEl(l) {
    const letter = (l.name || host(l.url) || '?').trim().charAt(0).toUpperCase();
    const i = h('span', { class: 'link-icon', text: l.icon || letter, 'aria-hidden': 'true' });
    if (!l.icon) i.style.background = 'hsl(' + hue(l.name || l.url) + ' 55% 46%)';
    return i;
  }

  function linkEl(l, ctx) {
    const url = HB.normUrl(l.url);
    const el = h('a', {
      class: 'link-card', href: url || null, target: '_blank', rel: 'noopener noreferrer', draggable: false,
      dataset: { id: l.id, color: l.colour || '' }, title: (l.name ? l.name + '\n' : '') + l.url,
      onclick: (e) => { if (HB.justDragged() || !url) e.preventDefault(); },
      oncontextmenu: (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, menu(l, ctx)); },
    }, iconEl(l), h('span', { class: 'link-name', text: l.name || host(l.url) }), HB.tagChips(l));
    return el;
  }

  function headerEl(l, ctx, group) {
    const n = group.filter((x) => HB.normUrl(x.url)).length;
    return h('div', {
      class: 'link-header', dataset: { id: l.id, color: l.colour || '' },
      oncontextmenu: (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, menu(l, ctx)); },
    }, h('span', { class: 'link-header-name', text: l.name || 'Group' }),
    n ? h('button', { class: 'link-open-group no-drag', type: 'button', text: 'open ' + n + ' ↗', title: 'Open every link in this group',
      onclick: (e) => { e.stopPropagation(); openAll(group); } }) : null);
  }

  /** Open links in new tabs. Browsers allow one tab per click unless pop-ups are allowed for this site. */
  async function openAll(links) {
    const urls = links.map((l) => HB.normUrl(l.url)).filter(Boolean);
    if (!urls.length) return;
    if (urls.length > 8 && !(await HB.ui.confirm({ title: 'Open ' + urls.length + ' tabs?', message: 'Every link opens in its own tab.', confirm: 'Open all' }))) return;
    let blocked = 0;
    urls.forEach((u) => {
      const w = window.open(u, '_blank');
      if (w) { try { w.opener = null; } catch (e) { /* already cross-origin */ } } else blocked++;
    });
    if (blocked) {
      HB.ui.toast('Your browser blocked ' + blocked + ' of ' + urls.length + ' tabs. Allow pop-ups for ' + location.hostname
        + ' (the blocked-pop-up icon at the right of the address bar), then press Open all again.', { type: 'error', timeout: 12000 });
    }
  }
  HB.openLinks = openAll;

  async function edit(l) {
    const isHeader = l.kind === 'header';
    const fields = [{ name: 'name', label: isHeader ? 'Group name' : 'Name', value: l.name, required: isHeader }];
    if (!isHeader) {
      fields.push({ name: 'url', label: 'URL', value: l.url, placeholder: 'https://…',
        validate: (v) => (v && !HB.normUrl(v) ? 'Only http(s), mailto and tel links are allowed' : '') });
      fields.push({ name: 'icon', label: 'Icon', type: 'emoji', value: l.icon, follow: 'name', placeholder: 'auto' });
    }
    fields.push({ name: 'colour', label: 'Colour label', type: 'color', value: l.colour });
    if (!isHeader) fields.push({ name: 'tags', label: 'Tags', value: l.tags, placeholder: 'comma, separated' });
    const v = await HB.ui.form({ title: isHeader ? 'Edit group header' : 'Edit link', fields });
    if (!v) return;
    if (v.url !== undefined) v.url = HB.normUrl(v.url) || v.url;
    if (v.tags !== undefined) v.tags = HB.tagsToString(HB.parseTags(v.tags));
    S.update('links', l.id, v, { label: 'edit link' });
  }

  function menu(l, ctx) {
    const items = [{ label: 'Edit…', onClick: () => edit(l) }];
    if (l.kind !== 'header') items.push({ label: 'Open in new tab', onClick: () => { const u = HB.normUrl(l.url); if (u) window.open(u, '_blank', 'noopener'); } });
    if (l.kind !== 'header') {
      items.push({ label: 'Choose icon…', onClick: () => {
        const el = document.querySelector('.link-card[data-id="' + l.id + '"]');
        const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2 - 150, bottom: 200 };
        HB.emoji.open(r.left, r.bottom + 4, (e) => S.update('links', l.id, { icon: e }, { label: 'icon' }));
      } });
    }
    items.push({ header: 'Colour' }, { swatches: { value: l.colour, onPick: (c) => S.update('links', l.id, { colour: c }, { label: 'colour' }) } });
    const to = HB.moveTargets('links', l, ['toolbox']);
    if (to.length) items.push({ label: 'Move to tile', children: to });
    items.push({ sep: true }, { label: 'Delete', danger: true, onClick: () => S.remove('links', l.id, { label: 'delete link' }) });
    return items;
  }

  async function quickAdd(ctx, text) {
    let name = '', url = '';
    if (text.includes('|')) { [name, url] = text.split('|').map((s) => s.trim()); } else url = text;
    const norm = HB.normUrl(url);
    if (!norm) { HB.ui.toast('Enter a web address, or "Name | address"', { type: 'error' }); return; }
    const label = name || host(norm);
    await HB.safeCreate('links', { tile_id: ctx.id, kind: 'link', name: label, url: norm, icon: HB.emoji.suggest(label + ' ' + host(norm)) }, 'add link');
  }

  HB.gadgets.define('toolbox', class extends HB.Gadget {
    render(body, ctx) {
      const icons = ctx.settings.view === 'icons';
      const list = h('div', { class: 'links' + (icons ? ' icons' : ''), dataset: { tile: ctx.id } });
      const links = ctx.items('links');
      links.forEach((l, i) => {
        if (l.kind !== 'header') { list.append(linkEl(l, ctx)); return; }
        const next = links.slice(i + 1);
        const end = next.findIndex((x) => x.kind === 'header');
        list.append(headerEl(l, ctx, (end < 0 ? next : next.slice(0, end)).filter((x) => x.kind !== 'header')));
      });
      if (!links.length) list.append(h('div', { class: 'empty small no-drag', text: this.readOnly ? 'No links.' : 'No links yet. Paste one below.' }));
      const real = links.filter((l) => l.kind !== 'header' && HB.normUrl(l.url));
      const bar = h('div', { class: 'tb-bar' },
        h('button', { class: 'btn small', type: 'button', text: 'Open all ' + real.length + ' ↗', disabled: !real.length, title: 'Open every link in a new tab', onclick: () => openAll(real) }),
        this.readOnly ? null : h('button', { class: 'btn small ghost', type: 'button', text: icons ? '☰ Cards' : '▦ Icons', title: icons ? 'Show names' : 'Show icons only',
          onclick: () => HB.setTileSettings(ctx.id, { view: icons ? 'cards' : 'icons' }, 'toolbox view') }));
      body.append(bar, list);
      if (!this.readOnly) body.append(HB.addRow({ placeholder: 'Paste a link, or  Name | address', key: 'link-add', onAdd: (t) => quickAdd(ctx, t) }));
      HB.sortable(body, list, {
        group: 'links', draggable: '[data-id]',
        onDrop: (evt) => HB.listDrop('links', evt, (c) => ({ tile_id: Number(c.dataset.tile) })),
        onTrash: (item) => S.remove('links', Number(item.dataset.id), { label: 'delete link' }),
      });
    }
    menu(tile, ctx) {
      const icons = ctx.settings.view === 'icons';
      return [
        { label: 'Open all links', onClick: () => openAll(ctx.items('links').filter((l) => l.kind !== 'header')) },
        { label: 'Icons only', checked: icons, onClick: () => HB.setTileSettings(ctx.id, { view: icons ? 'cards' : 'icons' }, 'toolbox view') },
        { sep: true },
        { label: 'Add group header…', onClick: async () => {
          const v = await HB.ui.form({ title: 'Group header', fields: [{ name: 'name', label: 'Name', required: true }] });
          if (v) HB.safeCreate('links', { tile_id: ctx.id, kind: 'header', name: v.name }, 'add header');
        } },
        { label: 'Add link…', onClick: async () => {
          const v = await HB.ui.form({ title: 'New link', fields: [
            { name: 'name', label: 'Name' },
            { name: 'url', label: 'URL', placeholder: 'https://…', required: true, validate: (x) => (HB.normUrl(x) ? '' : 'Enter a valid web address') },
            { name: 'icon', label: 'Icon', type: 'emoji', follow: 'name', placeholder: 'auto' },
          ] });
          if (v) HB.safeCreate('links', { tile_id: ctx.id, kind: 'link', name: v.name || host(HB.normUrl(v.url)), url: HB.normUrl(v.url), icon: v.icon || HB.emoji.suggest((v.name || '') + ' ' + host(HB.normUrl(v.url))) }, 'add link');
        } },
      ];
    }
  });
})();
