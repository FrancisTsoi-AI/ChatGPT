(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const ICON = { links: '🔗', tasks: '☑', files: '📎', thoughts: '💭', cmd: '›' };

  HB.search = {
    open(prefill) {
      if (HB.modalCount) return;
      const input = h('input', { type: 'text', class: 'cmd-input', placeholder: 'Search links, files, tasks, thoughts — or type a command…', autocomplete: 'off', spellcheck: false, value: prefill || '' });
      const list = h('div', { class: 'cmd-list', role: 'listbox' });
      const back = h('div', { class: 'modal-back top' }, h('div', { class: 'cmd' }, input, list));
      document.getElementById('layer').append(back);
      HB.modalCount = (HB.modalCount || 0) + 1;
      let rows = [], sel = 0, serial = 0, results = [];
      const commands = HB.app.commands();

      const close = () => { back.remove(); HB.modalCount = Math.max(0, HB.modalCount - 1); document.removeEventListener('keydown', onKey, true); };
      const run = (r, alt) => {
        close();
        if (r.cmd) { r.cmd.run(); return; }
        const sid = r.scenario_id;
        HB.app.showScenario(sid);
        if (r.type === 'links' && r.url && !alt) { const u = HB.normUrl(r.url); if (u) { window.open(u, '_blank', 'noopener'); return; } }
        if (r.type === 'files' && !alt) { const f = S.get('files', r.id); if (f) HB.preview(f); }
        setTimeout(() => HB.board.flash(r.tile_id), 120);
      };
      const draw = () => {
        list.replaceChildren();
        rows.forEach((r, i) => {
          list.append(h('div', { class: 'cmd-row' + (i === sel ? ' sel' : ''), role: 'option', onmousemove: () => { if (sel !== i) { sel = i; mark(); } }, onclick: (e) => run(r, e.shiftKey) },
            h('span', { class: 'cmd-icon', text: r.cmd ? '›' : ICON[r.type] || '•' }),
            h('span', { class: 'cmd-label', text: r.cmd ? r.cmd.label : r.label }),
            h('span', { class: 'cmd-where muted', text: r.cmd ? r.cmd.hint || '' : r.where })));
        });
        if (!rows.length) list.append(h('div', { class: 'cmd-empty muted', text: 'No matches' }));
      };
      const mark = () => { HB.$$('.cmd-row', list).forEach((el, i) => el.classList.toggle('sel', i === sel)); const el = HB.$$('.cmd-row', list)[sel]; if (el) el.scrollIntoView({ block: 'nearest' }); };
      const rebuild = () => {
        const q = input.value.trim().toLowerCase();
        const cmds = commands.filter((c) => !q || c.label.toLowerCase().includes(q) || (c.hint || '').toLowerCase().includes(q)).slice(0, q ? 6 : 9);
        rows = [...results, ...cmds.map((c) => ({ cmd: c }))];
        if (sel >= rows.length) sel = 0;
        draw();
      };
      const query = HB.debounce(async () => {
        const q = input.value.trim().replace(/^#/, '');
        const my = ++serial;
        if (q.length < 2) { results = []; rebuild(); return; }
        try {
          const r = await HB.api.search(q);
          if (my !== serial) return;
          results = r.results;
        } catch (e) { results = []; }
        rebuild();
      }, 160);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(rows.length - 1, sel + 1); mark(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (rows[sel]) run(rows[sel], e.shiftKey); }
      };
      document.addEventListener('keydown', onKey, true);
      back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
      input.addEventListener('input', () => { sel = 0; rebuild(); query(); });
      rebuild();
      if (input.value) query();
      input.focus();
    },
  };
})();
