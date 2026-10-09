(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  /** A pasted YouTube address → { vid } for a video or { list } for a whole YouTube playlist (or an error). */
  function parseYouTube(input) {
    let u = String(input || '').trim();
    if (!u) return { error: 'Paste a YouTube link' };
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    let url;
    try { url = new URL(u); } catch (e) { return { error: 'That is not a valid address' }; }
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return { error: 'Only YouTube links can go here' };
    const ok = (x) => (/^[\w-]{6,64}$/.test(x || '') ? x : '');
    const parts = url.pathname.split('/').filter(Boolean);
    let vid = host === 'youtu.be' ? ok(parts[0]) : ok(url.searchParams.get('v'));
    if (!vid && ['embed', 'shorts', 'live', 'v'].includes(parts[0]) && parts[1] !== 'videoseries') vid = ok(parts[1]);
    const list = ok(url.searchParams.get('list'));
    if (vid) return { vid, url: 'https://www.youtube.com/watch?v=' + vid };
    if (list) return { list, url: 'https://www.youtube.com/playlist?list=' + list };
    return { error: 'No video or playlist found in that link' };
  }
  HB.parseYouTube = parseYouTube;

  const thumb = (vid) => 'https://i.ytimg.com/vi/' + vid + '/mqdefault.jpg';

  /** The embed address for item i: one video plus the following videos as an ad-hoc playlist, or a YouTube playlist. */
  function src(items, i, st, autoplay) {
    const it = items[i];
    const d = it.data || {};
    const q = new URLSearchParams({ rel: '0', modestbranding: '1', autoplay: autoplay ? '1' : '0' });
    if (d.list) { q.set('list', d.list); if (st.loop) q.set('loop', '1'); return 'https://www.youtube-nocookie.com/embed/videoseries?' + q; }
    let next = items.slice(i + 1).concat(st.loop ? items.slice(0, i) : []).filter((x) => (x.data || {}).vid).map((x) => x.data.vid);
    if (st.shuffle) next = next.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    next = next.slice(0, 150);
    if (next.length || st.loop) q.set('playlist', next.length ? next.join(',') : d.vid);
    if (st.loop) q.set('loop', '1');
    return 'https://www.youtube-nocookie.com/embed/' + d.vid + '?' + q;
  }

  HB.gadgets.define('youtube', class extends HB.Gadget {
    static defaults() { return { loop: false, shuffle: false }; }

    // a playing video must not restart when unrelated data changes: redraw only for the list and the player settings
    sig(ctx) {
      const st = ctx.settings;
      return [S.entriesOf(ctx.id, 'video').map((e) => [e.id, e.a, e.position, e.colour]), st.current || 0, !!st.loop, !!st.shuffle, st.nonce || 0];
    }

    /** Player choices are saved with the tile; on a share page they stay in the visitor's browser. */
    setPlayer(ctx, patch, label) {
      if (this.readOnly) { this.local = Object.assign({}, this.local, patch); this.redraw(); return; }
      HB.setTileSettings(ctx.id, patch, label);
    }
    play(ctx, id) { this.autoplay = true; this.setPlayer(ctx, { current: id, nonce: Date.now() }, 'play video'); }

    async add(ctx, text) {
      const r = parseYouTube(text);
      if (r.error) { HB.ui.toast(r.error, { type: 'error' }); return; }
      const top = this.entries('video');
      const row = await this.addEntry('video', { a: r.list ? 'YouTube playlist' : 'YouTube video', b: r.url,
        position: top.length ? top[top.length - 1].position + 1 : 0, data: { vid: r.vid || '', list: r.list || '' } });
      if (!row) return;
      // fill in the real title in the background (needs the server's cURL; ignored if it fails)
      this.call('info', { url: r.url }).then((t) => { if (t && t.title) S.update('entries', row.id, { a: t.title, data: Object.assign({}, row.data, { author: t.author }) }, { record: false }); }).catch(() => {});
    }

    render(body, ctx) {
      const st = Object.assign({}, ctx.settings, this.local || {});
      const items = this.entries('video');
      let i = items.findIndex((x) => x.id === st.current);
      if (i < 0) i = 0;
      const auto = !!this.autoplay;
      this.autoplay = false;
      const player = items.length
        ? h('iframe', { class: 'yt-frame', src: src(items, i, st, auto), title: items[i].a || 'YouTube', referrerpolicy: 'strict-origin-when-cross-origin',
          allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture', allowfullscreen: true,
          sandbox: 'allow-scripts allow-same-origin allow-popups allow-presentation allow-popups-to-escape-sandbox' })
        : h('div', { class: 'yt-empty empty small', text: 'Paste a YouTube video or playlist link below to start your list.' });
      const btn = (text, title, fn, on) => h('button', { type: 'button', class: 'btn small' + (on ? ' on' : ' ghost'), text, title, 'aria-label': title, onclick: fn, disabled: !items.length });
      const controls = h('div', { class: 'yt-controls' },
        btn('⏮', 'Previous', () => this.play(ctx, items[(i - 1 + items.length) % items.length].id)),
        btn('⏭', 'Next', () => this.play(ctx, items[(i + 1) % items.length].id)),
        btn('🔀', 'Shuffle the videos after this one', () => this.setPlayer(ctx, { shuffle: !st.shuffle }, 'shuffle'), st.shuffle),
        btn('🔁', 'Repeat the list', () => this.setPlayer(ctx, { loop: !st.loop }, 'repeat'), st.loop),
        h('span', { class: 'muted small yt-now', text: items.length ? (i + 1) + ' / ' + items.length : '' }));
      const list = h('div', { class: 'yt-list', dataset: { tile: ctx.id } });
      items.forEach((it, k) => {
        const d = it.data || {};
        list.append(h('div', {
          class: 'yt-item' + (k === i ? ' on' : ''), dataset: { id: it.id, color: it.colour || '' }, title: 'Play from here',
          onclick: (e) => { if (!HB.justDragged() && !e.target.closest('button')) this.play(ctx, it.id); },
          oncontextmenu: (e) => { if (this.readOnly) return; e.preventDefault(); HB.ui.menu(e.clientX, e.clientY, [
            { label: 'Play from here', onClick: () => this.play(ctx, it.id) },
            { label: 'Open on YouTube', onClick: () => window.open(it.b, '_blank', 'noopener') },
            { label: 'Rename…', onClick: async () => { const v = await HB.ui.form({ title: 'Title', fields: [{ name: 'a', label: 'Title', value: it.a, required: true, max: 200 }] }); if (v) S.update('entries', it.id, { a: v.a }, { label: 'rename video' }); } },
            { sep: true }, { label: 'Remove', danger: true, onClick: () => S.remove('entries', it.id, { label: 'remove video' }) },
          ]); },
        },
        d.vid ? h('img', { class: 'yt-thumb', src: thumb(d.vid), alt: '', loading: 'lazy', draggable: false }) : h('span', { class: 'yt-thumb yt-pl', text: '☰' }),
        h('div', { class: 'yt-info' }, h('div', { class: 'yt-title', text: it.a }), h('div', { class: 'muted small', text: d.list ? 'Playlist' : (d.author || '') })),
        this.readOnly ? null : h('button', { class: 'x', type: 'button', text: '×', title: 'Remove', 'aria-label': 'Remove', onclick: () => S.remove('entries', it.id, { label: 'remove video' }) })));
      });
      body.append(h('div', { class: 'yt' }, h('div', { class: 'yt-player' }, player), controls, list,
        this.readOnly ? null : HB.addRow({ placeholder: 'Paste a YouTube video or playlist link', key: 'yt-add', onAdd: (t) => this.add(ctx, t) }),
        h('p', { class: 'muted small yt-note', text: 'Played by YouTube, which decides about ads (YouTube Premium, signed in, removes them).' })));
      if (!this.readOnly) {
        HB.sortable(body, list, {
          group: 'yt-' + ctx.id, draggable: '[data-id]',
          onDrop: (evt) => HB.listDrop('entries', evt, () => ({})),
          onTrash: (item) => S.remove('entries', Number(item.dataset.id), { label: 'remove video' }),
        });
      }
    }

    menu(tile, ctx) {
      return [
        { label: 'Add videos…', onClick: async () => {
          const v = await HB.ui.form({ title: 'Add to the list', fields: [{ name: 'text', type: 'textarea', rows: 6, label: 'YouTube links, one per line', required: true }] });
          if (!v) return;
          for (const line of v.text.split('\n').map((l) => l.trim()).filter(Boolean)) await this.add(ctx, line);
        } },
        { label: 'Repeat the list', checked: !!ctx.settings.loop, onClick: () => HB.setTileSettings(ctx.id, { loop: !ctx.settings.loop }, 'repeat') },
        { label: 'Shuffle', checked: !!ctx.settings.shuffle, onClick: () => HB.setTileSettings(ctx.id, { shuffle: !ctx.settings.shuffle }, 'shuffle') },
      ];
    }
  });
})();
