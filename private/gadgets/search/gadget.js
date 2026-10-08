(function () {
  const HB = window.HB;
  const h = HB.h;

  /** Engines without {q} are "needs setup": the user pastes a results page once and the pattern is learned. */
  const DEFAULTS = [
    { id: 'scholar', name: 'Google Scholar', url: 'https://scholar.google.com/scholar?q={q}' },
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={q}' },
    { id: 'hkmu', name: 'HKMU Library', url: 'https://www.hkmu.edu.hk/lib/' },
    { id: 'lancaster', name: 'Lancaster Library', url: 'https://onesearch.lancaster-university.uk/' },
    { id: 'hku', name: 'HKU Libraries', url: 'https://lib.hku.hk/' },
    { id: 'books', name: 'Google Books', url: 'https://www.google.com/search?tbm=bks&q={q}' },
    { id: 'wiki', name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search={q}' },
    { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/results?search_query={q}' },
  ];
  const needsSetup = (e) => !e.url.includes('{q}');
  const enginesOf = (st) => (Array.isArray(st.engines) && st.engines.length ? st.engines : DEFAULTS);

  /** Turn a pasted results address into a template by replacing the sample search word with {q}. */
  function learn(url, term) {
    const enc = encodeURIComponent(term);
    const variants = [enc, enc.replace(/%20/g, '+'), term, term.replace(/ /g, '+'), enc.toLowerCase()];
    for (const v of variants) if (v && url.includes(v)) return url.split(v).join('{q}');
    return '';
  }
  HB.searchLearn = learn;

  async function setup(ctx, engines, eng) {
    let last = { term: 'test', url: '' };
    for (;;) {
      const v = await HB.ui.form({
        title: 'Set up “' + eng.name + '”',
        submit: 'Learn this search',
        fields: [
          { name: 'term', label: '1 · Word you searched for', value: last.term, required: true, hint: 'Open the library’s site, search for this word (a rare one such as “test” works), and look at the results page.' },
          { name: 'url', label: '2 · Address of the results page', value: last.url, required: true, type: 'url', placeholder: 'https://…', hint: 'Copy the whole address from the browser bar and paste it here. It is only used to learn the pattern.' },
        ],
      });
      if (!v) return;
      last = v;
      let u;
      try { u = new URL(v.url); } catch (e) { HB.ui.toast('That is not a complete address', { type: 'error' }); continue; }
      if (!/^https?:$/.test(u.protocol)) { HB.ui.toast('Only http(s) addresses', { type: 'error' }); continue; }
      const tpl = learn(u.href, v.term);
      if (!tpl) { HB.ui.toast('I could not find “' + v.term + '” in that address. Use exactly the word you searched for.', { type: 'error' }); continue; }
      HB.setTileSettings(ctx.id, { engines: engines.map((x) => (x.id === eng.id ? { id: x.id, name: x.name, url: tpl } : x)) }, 'learn search');
      HB.ui.toast('Learned. “' + eng.name + '” now searches directly.');
      return;
    }
  }

  function open(url, q) { window.open(url.split('{q}').join(encodeURIComponent(q)), '_blank', 'noopener'); }

  HB.gadgets.define('search', class extends HB.Gadget {
    static defaults() { return { sel: 'scholar' }; }
    render(body, ctx) {
      // a share visitor can search too: their choice of site stays in this browser, unfinished sites are left out
      const st = Object.assign({}, ctx.settings, this.local || {});
      const engines = this.readOnly ? enginesOf(ctx.settings).filter((e) => !needsSetup(e)) : enginesOf(ctx.settings);
      if (!engines.length) { body.append(h('div', { class: 'empty small', text: 'No search sites yet.' })); return; }
      const sel = engines.find((e) => e.id === st.sel) || engines[0];
      const input = h('input', { type: 'text', class: 'search-q', placeholder: 'Search ' + sel.name + '…', dataset: { key: 'q' }, autocomplete: 'off' });
      const go = () => {
        const q = input.value.trim();
        if (needsSetup(sel)) { setup(ctx, engines, sel); return; }
        if (!q) { input.focus(); return; }
        open(sel.url, q);
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      const chips = h('div', { class: 'engines' }, engines.map((e) => h('button', {
        type: 'button', class: 'engine' + (e.id === sel.id ? ' on' : '') + (needsSetup(e) ? ' setup' : ''), text: e.name,
        title: needsSetup(e) ? 'Needs a one-time setup: pick it, then press Search' : '',
        onclick: () => {
          if (e.id === sel.id) return;
          if (this.readOnly) { this.local = { sel: e.id }; this.redraw(); } else HB.setTileSettings(ctx.id, { sel: e.id, engines }, 'search site');
        },
        oncontextmenu: (ev) => {
          if (this.readOnly) return;
          ev.preventDefault();
          HB.ui.menu(ev.clientX, ev.clientY, [
            { label: 'Set up / re-learn this search…', onClick: () => setup(ctx, engines, e) },
            { label: 'Open its home page', onClick: () => { try { window.open(new URL(e.url).origin, '_blank', 'noopener'); } catch (x) { /* ignore */ } } },
          ]);
        },
      })));
      body.append(h('form', { class: 'add-row search-form', onsubmit: (e) => { e.preventDefault(); go(); } }, input,
        h('button', { class: 'btn small primary', type: 'submit', text: needsSetup(sel) ? 'Set up…' : 'Search' })), chips);
      if (needsSetup(sel)) body.append(h('p', { class: 'muted small', text: 'This site needs a one-time setup so Home Base can search it directly. Press “Set up…”.' }));
    }
    menu(tile, ctx) {
      return [{ label: 'Edit search sites…', onClick: async () => {
        const engines = enginesOf(ctx.settings);
        const v = await HB.ui.form({
          title: 'Search sites', submit: 'Save',
          fields: [{ name: 'text', type: 'textarea', rows: 10, label: 'One per line:  Name | address with {q} where the search words go',
            value: engines.map((e) => e.name + ' | ' + e.url).join('\n'),
            hint: 'A line without {q} becomes a “needs setup” site: press it and paste one results page to teach Home Base the pattern.' }],
        });
        if (!v) return;
        const out = [];
        v.text.split('\n').forEach((line, i) => {
          const [name, ...rest] = line.split('|');
          const url = rest.join('|').trim();
          if (!name.trim() || !/^https?:\/\//i.test(url)) return;
          out.push({ id: 's' + i + Math.random().toString(36).slice(2, 5), name: name.trim().slice(0, 40), url });
        });
        if (!out.length) { HB.ui.toast('No valid lines (use  Name | https://…)', { type: 'error' }); return; }
        HB.setTileSettings(ctx.id, { engines: out, sel: out[0].id }, 'search sites');
      } }, { label: 'Restore default sites', onClick: () => HB.setTileSettings(ctx.id, { engines: DEFAULTS, sel: 'scholar' }, 'search sites') }];
    }
  });
})();
