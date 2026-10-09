(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const weeks = {}; // tile id -> weeks back
  const pad = (n) => String(n).padStart(2, '0');
  const hms = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 3600) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60); };
  const hm = (s) => { const m = Math.round(s / 60); return m >= 60 ? Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm' : m + 'm'; };

  async function manual(ctx, labels) {
    const v = await HB.ui.form({ title: 'Add time', fields: [
      { name: 'label', label: 'What for', required: true, max: 80, value: labels[0] || '' },
      { name: 'minutes', label: 'Minutes', value: '30', required: true },
      { name: 'day', label: 'Day', type: 'date', value: HB.localDay(), required: true },
    ] });
    if (!v) return;
    const min = parseFloat(v.minutes);
    if (!(min > 0)) { HB.ui.toast('Minutes must be a number above 0', { type: 'error' }); return; }
    await HB.createEntry(ctx, 'time', { a: v.label, day: v.day, num: Math.round(min * 60), data: { manual: true } });
  }

  HB.gadgets.define('timelog', class extends HB.Gadget {
    render(body, ctx) {
      const st = ctx.settings;
      const run = st.run || null;
      const entries = S.entriesOf(ctx.id, 'time');
      const labels = Array.from(new Set(entries.slice().sort((a, b) => b.id - a.id).map((e) => e.a))).slice(0, 12);
      const label = h('input', { type: 'text', class: 'tl-label', placeholder: 'What are you working on?', value: run ? run.label : (labels[0] || ''), disabled: !!run, list: 'tl-' + ctx.id, dataset: { key: 'tl-label' }, maxlength: 80 });
      const dl = h('datalist', { id: 'tl-' + ctx.id }, labels.map((l) => h('option', { value: l })));
      const clock = h('div', { class: 'tl-clock' });
      const setRun = (r) => S.update('tiles', ctx.id, { settings: Object.assign({}, st, { run: r }) }, { record: false });
      const startStop = h('button', { class: 'btn ' + (run ? 'danger' : 'primary'), text: run ? '■ Stop' : '▶ Start', onclick: async () => {
        if (!run) {
          const l = label.value.trim();
          if (!l) { label.focus(); HB.ui.toast('Say what you are working on first'); return; }
          setRun({ label: l, start: Date.now() });
          return;
        }
        const secs = Math.round((Date.now() - run.start) / 1000);
        setRun(null);
        if (secs >= 1) await HB.createEntry(ctx, 'time', { a: run.label, day: HB.localDay(new Date(run.start)), num: secs, data: { start: run.start, end: Date.now() } });
      } });
      label.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !run) startStop.click(); });

      // week selection (Monday–Sunday, local)
      const off = weeks[ctx.id] || 0;
      const now = new Date();
      const mon = HB.addDays(now, -((now.getDay() + 6) % 7) - off * 7);
      const dayKeys = Array.from({ length: 7 }, (_, i) => HB.localDay(HB.addDays(mon, i)));
      const inWeek = entries.filter((e) => dayKeys.includes(e.day));
      const today = HB.localDay();
      const todaySecs = entries.filter((e) => e.day === today).reduce((a, e) => a + e.num, 0) + (run ? Math.round((Date.now() - run.start) / 1000) : 0);
      const weekSecs = inWeek.reduce((a, e) => a + e.num, 0);
      const byLabel = {};
      inWeek.forEach((e) => { byLabel[e.a] = (byLabel[e.a] || 0) + e.num; });
      const rows = Object.entries(byLabel).sort((a, b) => b[1] - a[1]);
      const max = rows.length ? rows[0][1] : 1;
      const bars = h('div', { class: 'tl-bars' }, rows.map(([l, s]) => h('div', { class: 'tl-bar' },
        h('div', { class: 'tl-bar-top' }, h('span', { class: 'tl-bar-name', text: l }), h('span', { class: 'muted small', text: hm(s) })),
        h('div', { class: 'bar' }, h('i', { style: { width: Math.max(3, (s / max) * 100) + '%' } })))));
      if (!rows.length) bars.append(h('div', { class: 'empty small', text: 'No time logged this week.' }));
      const recent = h('div', { class: 'tl-recent' }, inWeek.slice().sort((a, b) => b.id - a.id).slice(0, 8).map((e) => h('div', { class: 'tl-row', dataset: { id: e.id } },
        h('span', { class: 'tl-row-name', text: e.a }), h('span', { class: 'muted small', text: new Date(e.day + 'T12:00:00').toLocaleDateString([], { weekday: 'short' }) + ' · ' + hm(e.num) }),
        h('button', { class: 'x', text: '×', title: 'Delete', 'aria-label': 'Delete entry', onclick: () => S.remove('entries', e.id, { label: 'delete time entry' }) }))));

      body.append(h('div', { class: 'tl' },
        h('div', { class: 'tl-top' }, label, dl, startStop), clock,
        h('div', { class: 'tl-sums' }, h('div', {}, h('b', { class: 'tl-today', text: hm(todaySecs) }), h('small', { class: 'muted', text: ' today' })), h('div', {}, h('b', { text: hm(weekSecs) }), h('small', { class: 'muted', text: off ? ' that week' : ' this week' }))),
        h('div', { class: 'file-bar' },
          h('button', { class: 'btn small', text: '‹', title: 'Previous week', onclick: () => { weeks[ctx.id] = off + 1; HB.board.reconcile(true); } }),
          h('span', { class: 'small', text: new Date(dayKeys[0] + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' – ' + new Date(dayKeys[6] + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }) }),
          h('button', { class: 'btn small', text: '›', title: 'Next week', disabled: off === 0, onclick: () => { weeks[ctx.id] = Math.max(0, off - 1); HB.board.reconcile(true); } }),
          HB.readOnly ? null : h('button', { class: 'btn small ghost', text: '+ Add time', onclick: () => manual(ctx, labels) })),
        bars, recent));

      if (run) {
        const tick = () => { clock.textContent = hms((Date.now() - run.start) / 1000); };
        tick();
        const iv = setInterval(tick, 1000);
        HB.onCleanup(body, () => clearInterval(iv));
      } else clock.textContent = '0:00:00';
    }
    menu(tile, ctx) { return [{ label: 'Add time manually…', onClick: () => manual(ctx, []) }]; }
  });
})();
