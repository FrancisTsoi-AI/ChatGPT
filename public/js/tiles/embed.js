(function () {
  const HB = window.HB;
  const h = HB.h;

  /** Turn what the user pasted into a safe https embed address (or an error). Handles YouTube, Spotify, Vimeo and <iframe> snippets. */
  function parse(input) {
    let u = String(input || '').trim();
    const m = u.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (m) u = m[1];
    if (!u) return { error: 'Paste an address first' };
    if (!/^https?:\/\//i.test(u)) {
      if (/^[^\s/]+\.[^\s/]{2,}/.test(u)) u = 'https://' + u; else return { error: 'Enter a web address such as https://example.com' };
    }
    let url;
    try { url = new URL(u); } catch (e) { return { error: 'That is not a valid address' }; }
    if (url.protocol !== 'https:') return { error: 'Use an https:// address (plain http pages are blocked inside a secure page)' };
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    const id = (x) => (/^[\w-]{6,}$/.test(x || '') ? x : '');
    if (['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) {
      const parts = url.pathname.split('/').filter(Boolean);
      const list = id(url.searchParams.get('list'));
      let v = host === 'youtu.be' ? id(parts[0]) : id(url.searchParams.get('v'));
      if (!v && ['embed', 'shorts', 'live'].includes(parts[0]) && parts[1] !== 'videoseries') v = id(parts[1]);
      if (list && !v) return { kind: 'youtube', src: 'https://www.youtube-nocookie.com/embed/videoseries?list=' + list, url: url.href };
      if (v) return { kind: 'youtube', src: 'https://www.youtube-nocookie.com/embed/' + v + (list ? '?list=' + list : ''), url: url.href };
      return { error: 'That YouTube address has no video or playlist in it' };
    }
    if (host === 'open.spotify.com') {
      const mm = url.pathname.match(/^\/(?:intl-[a-z]+\/)?(playlist|album|track|episode|show|artist)\/(\w+)/);
      if (mm) return { kind: 'spotify', src: 'https://open.spotify.com/embed/' + mm[1] + '/' + mm[2], url: url.href };
    }
    if (host === 'vimeo.com') {
      const mm = url.pathname.match(/^\/(\d+)/);
      if (mm) return { kind: 'vimeo', src: 'https://player.vimeo.com/video/' + mm[1], url: url.href };
    }
    return { kind: 'web', src: url.href, url: url.href };
  }
  HB.embedParse = parse;

  const EXAMPLES = [
    ['YouTube playlist', 'https://www.youtube.com/playlist?list='],
    ['Spotify playlist', 'https://open.spotify.com/playlist/'],
    ['Google Calendar (publish → embed)', 'https://calendar.google.com/calendar/embed?src='],
  ];

  HB.registerTile('embed', {
    w: 6, h: 6,
    render(body, ctx) {
      const st = ctx.settings;
      const set = (url) => {
        const r = parse(url);
        if (r.error) { HB.ui.toast(r.error, { type: 'error' }); return false; }
        HB.setTileSettings(ctx.id, { url: r.url }, 'embed address');
        return true;
      };
      const r = st.url ? parse(st.url) : null;
      if (!r || r.error) {
        const input = h('input', { type: 'text', placeholder: 'Paste a web, YouTube, Spotify address or an <iframe> snippet', dataset: { key: 'embed-url' } });
        const go = () => set(input.value);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        body.append(h('div', { class: 'embed-setup' },
          h('p', { class: 'muted', text: 'Show another page, video or playlist inside this tile.' }),
          h('div', { class: 'add-row' }, input, h('button', { class: 'btn small primary', text: 'Embed', onclick: go })),
          h('p', { class: 'muted small', text: 'Try: ' + EXAMPLES.map((e) => e[0]).join(' · ') + '. Many sites (Google, GitHub, banks, most news sites) refuse to be shown inside other pages.' })));
        return;
      }
      const frame = h('iframe', {
        class: 'embed-frame', src: r.src, loading: 'lazy', title: ctx.tile.title || 'Embedded page', referrerpolicy: 'no-referrer',
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-popups-to-escape-sandbox',
        allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write',
        allowfullscreen: true,
      });
      const notes = [h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open in new tab ↗' })];
      if (r.kind === 'web') notes.push(h('span', { class: 'muted', text: ' · Blank? This site may refuse to be embedded.' }));
      if (r.kind === 'youtube') notes.push(h('span', { class: 'muted', text: ' · YouTube decides about ads (YouTube Premium, signed in, removes them). For ad-free music use the Music tile with your own files.' }));
      body.append(h('div', { class: 'embed-wrap' }, frame, h('div', { class: 'embed-foot small' }, notes)));
    },
    menu(tile, ctx) {
      return [
        { label: 'Change address…', onClick: async () => {
          const v = await HB.ui.form({ title: 'Embedded address', fields: [{ name: 'url', label: 'Address', value: ctx.settings.url || '', required: true, hint: 'Web page, YouTube video or playlist, Spotify, Vimeo, or an <iframe> snippet' }] });
          if (v) { const r = parse(v.url); if (r.error) HB.ui.toast(r.error, { type: 'error' }); else HB.setTileSettings(ctx.id, { url: r.url }, 'embed address'); }
        } },
        { label: 'Reload', disabled: !ctx.settings.url, onClick: () => HB.board.reconcile(true) },
      ];
    },
  });
})();
