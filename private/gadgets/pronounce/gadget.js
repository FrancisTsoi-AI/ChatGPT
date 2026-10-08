(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  /** Trim, fold spaces, strip quotes and trailing punctuation, max 120 characters. */
  function cleanName(text) {
    return String(text || '').replace(/\s+/g, ' ').replace(/^["'“”‘’\s]+|["'“”‘’.,;:!?\s]+$/g, '').slice(0, 120);
  }

  /** Outside pronunciation sites for a name. */
  function links(name, on) {
    const q = encodeURIComponent(name);
    const slug = encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'));
    const all = [
      ['htp', 'howtopronounce', 'https://www.howtopronounce.com/' + slug],
      ['forvo', 'Forvo', 'https://forvo.com/search/' + q + '/'],
      ['youglish', 'YouGlish UK', 'https://youglish.com/pronounce/' + q + '/english/uk'],
      ['youglish', 'YouGlish US', 'https://youglish.com/pronounce/' + q + '/english/us'],
      ['google', 'Google', 'https://www.google.com/search?q=' + encodeURIComponent('how to pronounce ' + name)],
    ];
    return all.filter(([k]) => on[k] !== false).map(([, label, href]) => ({ label, href }));
  }

  const synth = window.speechSynthesis;
  let voiceList = [];
  function voices() {
    if (!synth) return Promise.resolve([]);
    voiceList = synth.getVoices();
    if (voiceList.length) return Promise.resolve(voiceList);
    return new Promise((res) => {
      const done = () => { voiceList = synth.getVoices(); res(voiceList); };
      synth.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  }
  if (synth) voices();

  function pickVoice(lang, uri) {
    const l = lang.toLowerCase();
    return voiceList.find((v) => uri && v.voiceURI === uri)
      || voiceList.find((v) => v.lang && v.lang.replace('_', '-').toLowerCase() === l) || null;
  }

  function speak(text, lang, st) {
    if (!synth) { HB.ui.toast('This browser has no speech voices', { type: 'error' }); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = Number(st.rate ?? 0.9) || 0.9;
    const v = pickVoice(lang, lang === 'en-GB' ? st.voiceUK : st.voiceUS);
    if (v) u.voice = v;
    else if (voiceList.length) HB.ui.toast('No ' + (lang === 'en-GB' ? 'UK' : 'US') + ' voice on this device; using the default voice');
    synth.speak(u);
  }

  let player = null;
  /** Play a recording through the gadget's audio action (CSP allows only same-origin media). */
  function play(url, tileId) {
    if (synth) synth.cancel();
    if (!player) player = new Audio();
    player.pause();
    const q = { u: url };
    if (HB.readOnly) q.tile = tileId;
    player.src = HB.api.url('g/pronounce/audio', q);
    player.play().catch(() => HB.ui.toast('Could not play that recording', { type: 'error' }));
  }

  const KINDS = [['person', 'Person'], ['brand', 'Brand'], ['place', 'Place'], ['other', 'Other']];
  const slash = (x) => { x = String(x || '').trim(); return x && !/^[/[]/.test(x) ? '/' + x + '/' : x; };

  /** Form for a new or saved name. Resolves with { a, b, data, tags } or null. */
  async function form(r) {
    const d = r.data || {};
    const v = await HB.ui.form({ title: r.id ? 'Edit name' : 'Save name', fields: [
      { name: 'a', label: 'Name', value: r.a || '', required: true, max: 120 },
      { name: 'b', label: 'IPA', value: r.b || '', max: 200, placeholder: '/juːˈlɪsə/' },
      { name: 'uk', label: 'UK IPA (if different)', value: d.uk || '', max: 200 },
      { name: 'us', label: 'US IPA (if different)', value: d.us || '', max: 200 },
      { name: 'say', label: 'Say it like (read by the voice)', value: d.say || '', max: 200, placeholder: 'yoo-LISS-uh' },
      { name: 'kind', label: 'Kind', type: 'select', value: d.kind || 'person', options: KINDS.map(([value, label]) => ({ value, label })) },
      { name: 'note', label: 'Note', type: 'textarea', value: d.note || '', max: 1000 },
      { name: 'tags', label: 'Tags', value: r.tags || '', placeholder: 'comma, separated' },
    ] });
    if (!v) return null;
    return {
      a: cleanName(v.a), b: slash(v.b),
      data: Object.assign({}, d, { uk: slash(v.uk), us: slash(v.us), say: v.say.trim(), kind: v.kind, note: v.note, source: d.source || 'manual' }),
      tags: HB.tagsToString(HB.parseTags(v.tags)),
    };
  }

  HB.gadgets.define('pronounce', class extends HB.Gadget {
    static defaults() { return { rate: 0.9, voiceUK: '', voiceUS: '', links: { htp: true, forvo: true, youglish: true, google: true }, showSaved: true }; }

    get st() { return Object.assign({}, this.settings, this.local || {}); }

    sig(ctx) {
      return [ctx.settings, S.entriesOf(ctx.id, 'pron').map((r) => [r.id, r.a, r.b, r.data, r.tags, r.colour, r.position])];
    }

    keep() { return !!(this.input && document.activeElement === this.input && this.input.value); }

    rows() { return S.entriesOf(this.id, 'pron'); }

    find(name) { const n = name.toLowerCase(); return this.rows().find((r) => (r.a || '').toLowerCase() === n); }

    async lookup(text) {
      const name = cleanName(text);
      if (!name) return;
      const saved = this.find(name);
      this.query = '';
      if (saved) { this.result = { saved: saved.id }; this.redraw(); return; }
      const r = { a: name, b: '', data: { kind: 'person', source: 'manual' }, busy: true };
      this.result = r;
      this.redraw();
      try {
        const x = await this.call('lookup', { q: name });
        if (this.result !== r) return;
        r.busy = false;
        r.tried = x.tried || [];
        r.data.htp = ((x.htp || {}).items || []).slice(0, 2);
        if (x.found) {
          r.b = x.ipa || x.uk || x.us || '';
          r.data = { htp: r.data.htp, kind: 'person', uk: x.uk || '', us: x.us || '', say: x.say || '', audio: { uk: (x.audio || {}).uk || '', us: (x.audio || {}).us || '' }, source: x.source || 'manual', url: x.url || '' };
        }
      } catch (e) {
        if (this.result !== r) return;
        r.busy = false;
        r.failed = (e && e.message) || 'Lookup failed';
      }
      this.redraw();
    }

    async saveResult(r) {
      const v = await form(r);
      if (!v) return;
      const dup = this.find(v.a);
      if (dup) S.update('entries', dup.id, v, { label: 'edit name' });
      const row = dup || await HB.createEntry(this.ctx, 'pron', v);
      if (row) this.result = { saved: row.id };
      this.redraw();
    }

    async editRow(row) {
      const v = await form(row);
      if (v) S.update('entries', row.id, v, { label: 'edit name' });
    }

    playBtns(r, compact) {
      const d = r.data || {};
      const say = d.say || r.a;
      const row = (flag, label, lang, ipa) => h('div', { class: 'pr-accent' },
        h('span', { class: 'pr-flag', text: flag + (compact ? '' : ' ' + label) }),
        compact ? null : h('span', { class: 'pr-ipa', text: ipa || '—' }),
        h('button', { class: 'btn small ghost pr-play', text: '▶' + (compact ? ' ' + label : ' voice'), title: 'Say it (' + label + ' computer voice)', onclick: (e) => { e.stopPropagation(); speak(say, lang, this.st); } }),
        rec(label.toLowerCase()) ? h('button', { class: 'btn small ghost pr-play pr-rec', text: compact ? '🎙' : '▶ recording', title: label + ' recording', onclick: (e) => { e.stopPropagation(); play(rec(label.toLowerCase()), this.id); } }) : null);
      const rec = (a) => (d.audio || {})[a] || '';
      return [row('🇬🇧', 'UK', 'en-GB', d.uk || r.b), row('🇺🇸', 'US', 'en-US', d.us || r.b)];
    }

    card(r) {
      const d = r.data || {};
      const kind = (KINDS.find(([k]) => k === d.kind) || KINDS[0])[1];
      return h('div', { class: 'pr-card' },
        h('div', { class: 'pr-head' }, h('strong', { class: 'pr-name', text: r.a }), h('span', { class: 'pr-kind muted small', text: kind })),
        h('div', { class: 'pr-main' }, r.b ? h('span', { class: 'pr-ipa big', text: r.b }) : h('span', { class: 'muted small', text: 'No IPA yet — add it with Edit' }),
          h('span', { class: 'muted small' }, r.busy ? 'looking up…' : (d.source && d.source !== 'manual'
            ? (d.url ? h('a', { href: d.url, target: '_blank', rel: 'noopener', draggable: false, text: 'from ' + d.source + ' ↗' }) : 'from ' + d.source)
            : (r.id ? 'by you' : '')))),
        (d.htp || []).length ? h('div', { class: 'pr-htp small' }, h('span', { class: 'muted', text: 'howtopronounce: ' }),
          ...d.htp.map((it, i) => h('span', { class: 'pr-htp-item' }, (i + 1) + '. ' + (it.say || 'result ' + (i + 1)) + ' ',
            it.audio ? h('button', { class: 'btn small ghost pr-play', text: '▶', title: 'Play howtopronounce result ' + (i + 1), onclick: (e) => { e.stopPropagation(); play(it.audio, this.id); } }) : null))) : null,
        r.failed ? h('div', { class: 'small muted', text: 'Lookup failed: ' + r.failed }) : null,
        !r.id && !r.busy && !r.failed && r.tried && !r.b ? h('div', { class: 'small muted', text: 'No IPA found (looked in ' + r.tried.join(', ') + '). Try the links, or type it with Save.' }) : null,
        ...this.playBtns(r, false),
        h('div', { class: 'pr-say small' }, h('span', { class: 'muted', text: 'say it like: ' }), h('span', { text: d.say || r.a })),
        d.note ? h('div', { class: 'pr-note small muted', text: d.note }) : null,
        h('div', { class: 'pr-links small' }, ...links(r.a, this.st.links || {}).map((l) => h('a', { href: l.href, target: '_blank', rel: 'noopener', draggable: false, text: l.label + ' ↗' }))),
        this.readOnly ? null : h('div', { class: 'pr-btns' },
          r.id ? h('button', { class: 'btn small ghost', text: '✎ Edit', onclick: () => this.editRow(r) }) : null,
          r.id ? null : h('button', { class: 'btn small primary', text: 'Save', onclick: () => this.saveResult(r) }),
          h('button', { class: 'x', text: '×', title: 'Close', onclick: () => { this.result = null; this.redraw(); } })));
    }

    render(body, ctx) {
      const st = this.st;
      if (!this.readOnly) {
        this.input = h('input', { type: 'text', class: 'pr-input', placeholder: 'Type or paste a name…', value: this.query || '', maxlength: 200, dataset: { key: 'pr-q' },
          oninput: (e) => { this.query = e.target.value; },
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); this.lookup(e.target.value); } } });
        body.append(h('div', { class: 'pr-bar' }, this.input, h('button', { class: 'btn small primary', text: 'Go', onclick: () => this.lookup(this.input.value) })));
      }
      let r = this.result;
      if (r && r.saved) r = this.rows().find((x) => x.id === r.saved) || null;
      if (r) body.append(this.card(r));
      const rows = this.rows();
      if (st.showSaved !== false && rows.length) {
        const list = h('div', { class: 'pr-list', dataset: { tile: ctx.id } });
        rows.forEach((row) => list.append(h('div', {
          class: 'pr-row' + (r && r.id === row.id ? ' on' : ''), dataset: { id: row.id, color: row.colour || '' },
          onclick: () => { this.result = { saved: row.id }; this.redraw(); },
          oncontextmenu: this.readOnly ? null : (e) => { e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, [
            { label: 'Edit…', onClick: () => this.editRow(row) },
            { label: 'Colour & tags…', onClick: () => HB.editMeta('entries', row, { title: 'Name colour and tags' }) },
            { sep: true }, { label: 'Delete', danger: true, onClick: () => S.remove('entries', row.id, { label: 'delete name' }) },
          ]); },
        }, h('span', { class: 'pr-rname', text: row.a }), h('span', { class: 'pr-ipa muted small', text: row.b || '' }),
        h('span', { class: 'pr-rbtns' }, ...this.playBtns(row, true),
          this.readOnly ? null : h('button', { class: 'x', text: '×', title: 'Delete', 'aria-label': 'Delete name', onclick: (e) => { e.stopPropagation(); S.remove('entries', row.id, { label: 'delete name' }); } })))));
        body.append(h('div', { class: 'pr-sep muted small', text: 'Saved' }), list);
        HB.sortable(body, list, {
          group: 'pron', draggable: '[data-id]',
          onDrop: (evt) => HB.listDrop('entries', evt, (c) => ({ tile_id: Number(c.dataset.tile) })),
          onTrash: (item) => S.remove('entries', Number(item.dataset.id), { label: 'delete name' }),
        });
      } else if (!r) {
        body.append(h('div', { class: 'empty small no-drag', text: this.readOnly ? 'No names saved.' : 'Type a name, press Enter, then ▶ UK / ▶ US.' }));
      }
    }

    async chooseVoices() {
      const vs = (await voices()).filter((v) => /^en/i.test(v.lang));
      const opts = (lang) => [{ value: '', label: 'Automatic' }].concat(vs.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang)).concat(vs.filter((v) => !v.lang.replace('_', '-').toLowerCase().startsWith(lang)))
        .map((v) => ({ value: v.voiceURI, label: v.name + ' (' + v.lang + ')' })));
      const st = this.st;
      const v = await HB.ui.form({ title: 'Voices', fields: [
        { name: 'voiceUK', label: 'UK voice', type: 'select', value: st.voiceUK || '', options: opts('en-gb') },
        { name: 'voiceUS', label: 'US voice', type: 'select', value: st.voiceUS || '', options: opts('en-us'), hint: vs.length ? '' : 'This device has no English voices.' },
      ] });
      if (v) this.save({ voiceUK: v.voiceUK, voiceUS: v.voiceUS }, 'pronounce voices');
    }

    menu(tile, ctx) {
      const st = this.st;
      const on = st.links || {};
      const rate = Number(st.rate ?? 0.9);
      return [
        { label: 'Add by hand…', onClick: () => this.saveResult({ a: this.query || '', b: '', data: { kind: 'person', source: 'manual' } }) },
        { label: 'Voices…', onClick: () => this.chooseVoices() },
        { label: 'Speed', children: [[0.7, 'Slow'], [0.9, 'Normal'], [1.1, 'Fast']].map(([x, l]) => ({ label: l, checked: rate === x, onClick: () => this.save({ rate: x }, 'voice speed') })) },
        { label: 'Links shown', children: [['htp', 'howtopronounce'], ['forvo', 'Forvo'], ['youglish', 'YouGlish'], ['google', 'Google']].map(([k, l]) => ({
          label: l, checked: on[k] !== false, onClick: () => this.save({ links: Object.assign({}, on, { [k]: on[k] === false }) }, 'pronounce links') })) },
        { label: 'Show saved names', checked: st.showSaved !== false, onClick: () => this.save({ showSaved: st.showSaved === false }, 'show saved names') },
      ];
    }

    destroy() { if (synth) synth.cancel(); }
  });
})();
