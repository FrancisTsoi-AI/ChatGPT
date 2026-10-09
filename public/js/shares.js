(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const EXPIRY = [['1h', 'In 1 hour', 3600], ['1d', 'In 1 day', 86400], ['7d', 'In 7 days', 7 * 86400], ['30d', 'In 30 days', 30 * 86400],
    ['90d', 'In 90 days', 90 * 86400], ['never', 'Never', 0], ['custom', 'On a date…', 0]];

  const linkOf = (slug) => location.origin + location.pathname.replace(/[^/]*$/, '') + slug;
  const fallbackOf = (slug) => location.origin + location.pathname.replace(/[^/]*$/, '') + 'share.php?s=' + slug;
  const slugify = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  function password() {
    const w = 'abcdefghijkmnpqrstuvwxyz23456789';
    const a = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(a, (b) => w[b % w.length]).join('').replace(/(.{4})(?!$)/g, '$1-');
  }
  function expiryOf(v) {
    if (v.expiry === 'never') return null;
    if (v.expiry === 'custom') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) return undefined;
      const [y, m, d] = v.date.split('-').map(Number);
      return new Date(y, m - 1, d, 23, 59, 59).toISOString(); // end of that day, your time
    }
    const sec = (EXPIRY.find((x) => x[0] === v.expiry) || EXPIRY[2])[2];
    return new Date(Date.now() + sec * 1000).toISOString();
  }
  function when(iso) {
    if (!iso) return 'never expires';
    const d = new Date(iso), ms = d - Date.now();
    if (ms <= 0) return 'expired ' + d.toLocaleDateString();
    const hrs = ms / 3600000;
    return 'expires ' + (hrs < 24 ? 'in ' + Math.max(1, Math.round(hrs)) + ' h' : d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
  }
  const copy = (text, what) => navigator.clipboard.writeText(text).then(() => HB.ui.toast(what + ' copied'), () => HB.ui.toast('Copy failed: select it and press Ctrl+C', { type: 'error' }));

  async function form(share, scenario) {
    const fields = [
      { name: 'slug', label: 'Link name', value: share ? share.slug : slugify(scenario.name) || 'shared', required: true, max: 40,
        hint: 'The address will be ' + linkOf('<name>') + ' (lowercase letters, digits, dashes)' },
      { name: 'password', label: share ? 'New password (leave empty to keep the current one)' : 'Password', value: share ? '' : password(), max: 100,
        hint: share ? '' : 'A password was made up for you; change it if you like. Send it to the visitor separately from the link.' },
      { name: 'expiry', label: 'Link stops working', type: 'select', value: share ? (share.expires_at ? 'custom' : 'never') : '7d', options: EXPIRY.map(([v, l]) => ({ value: v, label: l })) },
      { name: 'date', label: 'Date (for "On a date…")', type: 'date', value: share && share.expires_at ? HB.localDay(new Date(share.expires_at)) : '' },
      { name: 'files', label: 'Visitors may open and download files and music', type: 'checkbox', value: share ? share.include_files : true },
    ];
    for (;;) {
      const v = await HB.ui.form({ title: share ? 'Change link “' + share.slug + '”' : 'Share “' + scenario.name + '”', submit: share ? 'Save' : 'Create link', fields });
      if (!v) return null;
      const exp = expiryOf(v);
      if (exp === undefined) { HB.ui.toast('Pick a date for “On a date…”', { type: 'error' }); fields.forEach((f) => { f.value = v[f.name]; }); continue; }
      try {
        const r = await HB.api.call('shares/save', { method: 'POST', body: { id: share ? share.id : undefined, scenario_id: share ? share.scenario_id : scenario.id,
          slug: v.slug.trim().toLowerCase(), password: v.password, expires_at: exp, include_files: v.files } });
        return { share: r.share, password: v.password };
      } catch (e) {
        HB.ui.toast(e.message, { type: 'error', timeout: 7000 });
        fields.forEach((f) => { f.value = v[f.name]; });
      }
    }
  }

  function created(share, pw) {
    const link = linkOf(share.slug);
    const row = (label, value, what) => h('div', { class: 'share-copy' }, h('span', { class: 'muted small', text: label }),
      h('code', { text: value }), h('button', { class: 'btn small', type: 'button', text: 'Copy', onclick: () => copy(value, what) }));
    HB.ui.modal({
      title: 'Link ready', content: h('div', { class: 'share-done' },
        row('Link', link, 'Link'), pw ? row('Password', pw, 'Password') : null,
        h('p', { class: 'muted small', text: 'It ' + when(share.expires_at) + '. Send the password separately from the link (for example the link by email, the password by message).' }),
        h('p', { class: 'muted small', text: 'If the link shows “Not found”, your host does not allow short links; use ' + fallbackOf(share.slug) + ' instead.' })),
      actions: [{ label: 'Copy link and password', onClick: () => copy(link + (pw ? '\nPassword: ' + pw : ''), 'Link and password') }, { label: 'Done', primary: true }],
    });
  }

  HB.shares = {
    /** The share dialog for one scenario (or every link when id is null). */
    async open(scenarioId) {
      const scenario = scenarioId ? S.get('scenarios', scenarioId) : null;
      let all = [];
      try { all = (await HB.api.call('shares')).shares; } catch (e) { HB.ui.toast('Could not load the share links: ' + e.message, { type: 'error' }); return; }
      const list = scenario ? all.filter((s) => s.scenario_id === scenario.id) : all;
      const box = h('div', { class: 'share-list' });
      let modal;
      const reopen = () => { modal.close(); this.open(scenarioId); };
      if (!list.length) box.append(h('p', { class: 'muted', text: scenario ? 'This scenario is not shared yet.' : 'No share links yet.' }));
      list.forEach((s) => box.append(h('div', { class: 'share-row' + (s.expired ? ' expired' : '') },
        h('div', { class: 'share-info' },
          h('a', { href: linkOf(s.slug), target: '_blank', rel: 'noopener', text: linkOf(s.slug).replace(/^https?:\/\//, '') }),
          h('div', { class: 'muted small', text: (scenario ? '' : s.scenario + ' · ') + when(s.expires_at) + ' · ' + (s.include_files ? 'files allowed' : 'no files')
            + ' · opened ' + s.views + '×' + (s.last_viewed_at ? ', last ' + HB.fmtDateTime(s.last_viewed_at) : '') })),
        h('button', { class: 'btn small', type: 'button', text: 'Copy link', onclick: () => copy(linkOf(s.slug), 'Link') }),
        h('button', { class: 'btn small', type: 'button', text: 'Change…', onclick: async () => {
          modal.close();
          const r = await form(s, S.get('scenarios', s.scenario_id) || { name: s.scenario });
          if (r) created(r.share, r.password); else this.open(scenarioId);
        } }),
        h('button', { class: 'btn small danger', type: 'button', text: 'Switch off', onclick: async () => {
          if (!(await HB.ui.confirm({ title: 'Switch off this link?', message: 'Anyone using ' + linkOf(s.slug) + ' loses access at once.', confirm: 'Switch off', danger: true }))) return;
          try { await HB.api.call('shares/delete', { method: 'POST', body: { id: s.id } }); HB.ui.toast('Link switched off'); reopen(); } catch (e) { HB.ui.toast(e.message, { type: 'error' }); }
        } }))));
      modal = HB.ui.modal({
        title: scenario ? 'Share “' + scenario.name + '”' : 'Share links', wide: true,
        content: h('div', {}, h('p', { class: 'muted small', text: 'People with a link and its password see the scenario live, read-only. They cannot change anything or see your other scenarios.' }), box),
        actions: scenario ? [{ label: 'Close' }, { label: '+ New share link', primary: true, onClick: async () => {
          modal.close();
          const r = await form(null, scenario);
          if (r) created(r.share, r.password); else this.open(scenarioId);
        } }] : [{ label: 'Close', primary: true }],
      });
    },
  };
})();
