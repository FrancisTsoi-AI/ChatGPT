(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const offsets = {}; // tile id -> weeks back (0 = this week)
  const pending = new Set();

  const rowsFor = (ctx, hid) => S.entriesOf(ctx.id, 'habit').filter((e) => e.a === hid);
  const doneOn = (ctx, hid, day) => rowsFor(ctx, hid).some((e) => e.day === day && e.num > 0);

  function streak(ctx, hid) {
    const days = new Set(rowsFor(ctx, hid).filter((e) => e.num > 0).map((e) => e.day));
    let d = new Date();
    let n = 0;
    if (!days.has(HB.localDay(d))) d = HB.addDays(d, -1); // today may simply not be done yet
    while (days.has(HB.localDay(d))) { n++; d = HB.addDays(d, -1); }
    return n;
  }

  async function toggle(ctx, hid, day) {
    const key = hid + ':' + day;
    if (pending.has(key)) return;
    pending.add(key);
    try {
      const rows = rowsFor(ctx, hid).filter((e) => e.day === day);
      if (rows.length) {
        const on = rows.some((e) => e.num > 0);
        rows.forEach((e) => S.update('entries', e.id, { num: on ? 0 : 1 }, { label: 'habit' }));
      } else await HB.createEntry(ctx, 'habit', { a: hid, day, num: 1 });
    } finally { pending.delete(key); }
  }

  async function editHabit(ctx, hab) {
    const v = await HB.ui.form({ title: hab ? 'Edit habit' : 'New habit', fields: [
      { name: 'name', label: 'Habit', value: hab ? hab.name : '', required: true, max: 60, placeholder: 'e.g. Read 20 pages' },
      { name: 'icon', label: 'Icon', type: 'emoji', value: hab ? hab.icon || '' : '', follow: 'name', placeholder: 'auto' },
      { name: 'colour', label: 'Colour', type: 'color', value: hab ? hab.colour || '' : '' },
    ] });
    if (!v) return;
    const habits = (ctx.settings.habits || []).slice();
    const next = { id: hab ? hab.id : 'h' + Math.random().toString(36).slice(2, 8), name: v.name, icon: v.icon, colour: v.colour };
    if (hab) habits.splice(habits.findIndex((x) => x.id === hab.id), 1, next); else habits.push(next);
    HB.setTileSettings(ctx.id, { habits }, hab ? 'edit habit' : 'add habit');
  }

  HB.registerTile('habits', {
    w: 5, h: 4,
    render(body, ctx) {
      const habits = ctx.settings.habits || [];
      const off = offsets[ctx.id] || 0;
      const today = new Date();
      const mon = HB.addDays(today, -((today.getDay() + 6) % 7) - off * 7);
      const days = Array.from({ length: 7 }, (_, i) => HB.addDays(mon, i));
      const todayKey = HB.localDay(today);
      const nav = h('div', { class: 'file-bar' },
        h('button', { class: 'btn small', text: '‹', title: 'Previous week', onclick: () => { offsets[ctx.id] = off + 1; HB.board.reconcile(true); } }),
        h('span', { class: 'small', text: days[0].toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' – ' + days[6].toLocaleDateString([], { month: 'short', day: 'numeric' }) }),
        h('button', { class: 'btn small', text: '›', title: 'Next week', disabled: off === 0, onclick: () => { offsets[ctx.id] = Math.max(0, off - 1); HB.board.reconcile(true); } }),
        off ? h('button', { class: 'btn small ghost', text: 'This week', onclick: () => { offsets[ctx.id] = 0; HB.board.reconcile(true); } }) : null);
      const grid = h('div', { class: 'habit-grid', style: { gridTemplateColumns: 'minmax(120px,1.8fr) repeat(7, minmax(26px,1fr)) 40px' } });
      grid.append(h('div', { class: 'hh' }), ...days.map((d) => h('div', { class: 'hh' + (HB.localDay(d) === todayKey ? ' today' : ''), text: d.toLocaleDateString([], { weekday: 'narrow' }) + d.getDate() })), h('div', { class: 'hh', text: '🔥' }));
      habits.forEach((hab) => {
        grid.append(h('div', {
          class: 'habit-name', text: (hab.icon ? hab.icon + ' ' : '') + hab.name, title: 'Right-click to edit', dataset: { color: hab.colour || '' },
          oncontextmenu: (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, [
            { label: 'Edit…', onClick: () => editHabit(ctx, hab) },
            { label: 'Delete habit', danger: true, onClick: () => HB.setTileSettings(ctx.id, { habits: habits.filter((x) => x.id !== hab.id) }, 'delete habit') },
          ]); },
        }));
        days.forEach((d) => {
          const key = HB.localDay(d);
          const on = doneOn(ctx, hab.id, key);
          grid.append(h('button', {
            type: 'button', class: 'hcell' + (on ? ' on' : '') + (key > todayKey ? ' future' : ''), dataset: { color: hab.colour || '', hab: hab.id, day: key },
            'aria-label': hab.name + ' ' + key + (on ? ' done' : ' not done'), 'aria-pressed': on, text: on ? '✓' : '',
            onclick: () => toggle(ctx, hab.id, key),
          }));
        });
        const n = streak(ctx, hab.id);
        grid.append(h('div', { class: 'hstreak' + (n ? ' on' : ''), text: n ? String(n) : '–', title: n + '-day streak' }));
      });
      if (!habits.length) grid.append(h('div', { class: 'empty small', style: { gridColumn: '1 / -1' }, text: 'No habits yet.' }));
      body.append(nav, grid, h('button', { class: 'btn small add-cd', text: '+ Habit', onclick: () => editHabit(ctx, null) }));
    },
    menu(tile, ctx) { return [{ label: 'Add habit…', onClick: () => editHabit(ctx, null) }]; },
  });
})();
