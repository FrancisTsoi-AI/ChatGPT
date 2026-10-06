(function () {
  const HB = window.HB;
  const h = HB.h;

  /** Whole days from today (local midnight) to the date; negative = past. */
  function daysLeft(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((new Date(y, m - 1, d) - today) / 86400000);
  }
  HB.daysLeft = daysLeft;

  function label(n) {
    if (n === 0) return ['Today', 'now'];
    if (n === 1) return ['1', 'day left'];
    if (n > 1) return [String(n), 'days left'];
    if (n === -1) return ['1', 'day ago'];
    return [String(-n), 'days ago'];
  }

  async function editItem(ctx, item) {
    const v = await HB.ui.form({ title: item ? 'Edit deadline' : 'New deadline', fields: [
      { name: 'name', label: 'Name', value: item ? item.name : '', required: true, max: 80 },
      { name: 'date', label: 'Date', type: 'date', value: item ? item.date : '', required: true },
    ] });
    if (!v) return;
    const items = (ctx.settings.items || []).slice();
    if (item) items.splice(items.findIndex((x) => x.id === item.id), 1, { id: item.id, name: v.name, date: v.date });
    else items.push({ id: 'c' + Math.random().toString(36).slice(2, 8), name: v.name, date: v.date });
    HB.setTileSettings(ctx.id, { items }, item ? 'edit deadline' : 'add deadline');
  }

  HB.registerTile('countdown', {
    w: 3, h: 4,
    render(body, ctx) {
      const items = (ctx.settings.items || []).filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date));
      const upcoming = items.filter((i) => daysLeft(i.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
      const past = items.filter((i) => daysLeft(i.date) < 0).sort((a, b) => b.date.localeCompare(a.date));
      const list = h('div', { class: 'countdowns' });
      [...upcoming, ...past].forEach((i) => {
        const n = daysLeft(i.date);
        const [big, small] = label(n);
        list.append(h('div', {
          class: 'cd' + (n < 0 ? ' past' : n <= 3 ? ' soon' : ''),
          oncontextmenu: (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, [
            { label: 'Edit…', onClick: () => editItem(ctx, i) },
            { label: 'Delete', danger: true, onClick: () => HB.setTileSettings(ctx.id, { items: (ctx.settings.items || []).filter((x) => x.id !== i.id) }, 'delete deadline') },
          ]); },
        }, h('div', { class: 'cd-days' }, h('b', { text: big }), h('small', { text: small })),
        h('div', { class: 'cd-info', onclick: () => editItem(ctx, i) }, h('div', { class: 'cd-name', text: i.name }),
          h('div', { class: 'cd-date', text: new Date(i.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) })),
        h('button', { class: 'x', title: 'Delete', 'aria-label': 'Delete deadline', text: '×',
          onclick: () => HB.setTileSettings(ctx.id, { items: (ctx.settings.items || []).filter((x) => x.id !== i.id) }, 'delete deadline') })));
      });
      if (!items.length) list.append(h('div', { class: 'empty small', text: 'No deadlines yet.' }));
      body.append(list, h('button', { class: 'btn small add-cd', text: '+ Deadline', onclick: () => editItem(ctx, null) }));
      // roll the day counts over at local midnight
      const next = new Date(); next.setHours(24, 0, 2, 0);
      const t = setTimeout(() => HB.board.reconcile(true), next - new Date());
      HB.onCleanup(body, () => clearTimeout(t));
    },
    menu(tile, ctx) { return [{ label: 'Add deadline…', onClick: () => editItem(ctx, null) }]; },
  });
})();
