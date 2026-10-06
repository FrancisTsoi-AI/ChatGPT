(function () {
  const HB = window.HB;
  const h = HB.h;

  const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const fmt = (n) => (Math.abs(n) >= 1000 ? n.toLocaleString() : String(Math.round(n * 100) / 100));

  async function edit(ctx, item) {
    const v = await HB.ui.form({ title: item ? 'Edit counter' : 'New counter', fields: [
      { name: 'name', label: 'Name', value: item ? item.name : '', required: true, max: 60, placeholder: 'e.g. Words written, Papers read' },
      { name: 'value', label: 'Current value', value: item ? String(item.value) : '0' },
      { name: 'target', label: 'Target (optional)', value: item && item.target ? String(item.target) : '', placeholder: 'e.g. 80000' },
      { name: 'unit', label: 'Unit (optional)', value: item ? item.unit || '' : '', max: 12, placeholder: 'words, papers, km…' },
      { name: 'step', label: 'Step for + / −', value: item ? String(item.step || 1) : '1' },
      { name: 'colour', label: 'Colour', type: 'color', value: item ? item.colour || '' : '' },
    ] });
    if (!v) return;
    const next = { id: item ? item.id : 'k' + Math.random().toString(36).slice(2, 8), name: v.name, value: num(v.value), target: num(v.target), unit: v.unit, step: num(v.step) || 1, colour: v.colour };
    const items = (ctx.settings.items || []).slice();
    if (item) items.splice(items.findIndex((x) => x.id === item.id), 1, next); else items.push(next);
    HB.setTileSettings(ctx.id, { items }, item ? 'edit counter' : 'add counter');
  }

  function bump(ctx, item, d) {
    const items = (ctx.settings.items || []).map((x) => (x.id === item.id ? Object.assign({}, x, { value: Math.round((num(x.value) + d * (x.step || 1)) * 1000) / 1000 }) : x));
    HB.setTileSettings(ctx.id, { items }, 'counter');
  }

  HB.registerTile('stats', {
    w: 3, h: 4,
    render(body, ctx) {
      const items = ctx.settings.items || [];
      const list = h('div', { class: 'stats' });
      items.forEach((it) => {
        const pct = it.target > 0 ? Math.min(100, Math.max(0, (num(it.value) / it.target) * 100)) : null;
        list.append(h('div', {
          class: 'stat' + (pct === 100 ? ' done' : ''), dataset: { color: it.colour || '' },
          oncontextmenu: (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, [
            { label: 'Edit…', onClick: () => edit(ctx, it) },
            { label: 'Reset to 0', onClick: () => HB.setTileSettings(ctx.id, { items: items.map((x) => (x.id === it.id ? Object.assign({}, x, { value: 0 }) : x)) }, 'reset counter') },
            { sep: true },
            { label: 'Delete', danger: true, onClick: () => HB.setTileSettings(ctx.id, { items: items.filter((x) => x.id !== it.id) }, 'delete counter') },
          ]); },
        },
        h('div', { class: 'stat-top' },
          h('span', { class: 'stat-name', text: it.name, title: 'Click to edit', onclick: () => edit(ctx, it) }),
          h('span', { class: 'stat-val' }, h('b', { text: fmt(num(it.value)) }), it.target ? ' / ' + fmt(it.target) : '', it.unit ? ' ' + it.unit : '')),
        pct !== null ? h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': Math.round(pct) }, h('i', { style: { width: pct + '%' } })) : null,
        h('div', { class: 'stat-btns' },
          h('button', { class: 'btn small', text: '−', title: 'Subtract ' + (it.step || 1), onclick: () => bump(ctx, it, -1) }),
          h('button', { class: 'btn small', text: '+', title: 'Add ' + (it.step || 1), onclick: () => bump(ctx, it, 1) }),
          pct !== null ? h('span', { class: 'muted small', text: Math.round(pct) + '%' }) : null)));
      });
      if (!items.length) list.append(h('div', { class: 'empty small', text: 'No counters yet.' }));
      body.append(list, h('button', { class: 'btn small add-cd', text: '+ Counter', onclick: () => edit(ctx, null) }));
    },
    menu(tile, ctx) { return [{ label: 'Add counter…', onClick: () => edit(ctx, null) }]; },
  });
})();
