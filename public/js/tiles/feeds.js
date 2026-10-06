(function () {
  const HB = window.HB;
  const h = HB.h;
  const S = HB.store;

  const cache = new Map(); // url -> {t, data|error}
  const TTL = 600000;

  function ago(iso) {
    if (!iso) return '';
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + ' min';
    if (m < 1440) return Math.round(m / 60) + ' h';
    return Math.round(m / 1440) + ' d';
  }

  async function loadFeed(f) {
    const hit = cache.get(f.url);
    if (hit && Date.now() - hit.t < TTL) return hit;
    let res;
    try { res = { t: Date.now(), data: await HB.api.call('feed', { query: { url: f.url } }) }; } catch (e) { res = { t: Date.now(), error: e.message }; }
    cache.set(f.url, res);
    return res;
  }

  function markRead(ctx, ids) {
    const have = new Set(ctx.settings.read || []);
    const add = ids.filter((i) => !have.has(i));
    if (!add.length) return;
    const read = (ctx.settings.read || []).concat(add).slice(-600);
    S.update('tiles', ctx.id, { settings: Object.assign({}, ctx.settings, { read }) }, { record: false });
  }

  async function editFeeds(ctx) {
    const feeds = ctx.settings.feeds || [];
    const v = await HB.ui.form({
      title: 'News feeds', submit: 'Save',
      fields: [{ name: 'text', type: 'textarea', rows: 8, label: 'One per line:  Name | feed address',
        value: feeds.map((f) => f.name + ' | ' + f.url).join('\n'),
        hint: 'Example: BBC News | https://feeds.bbci.co.uk/news/rss.xml   (RSS or Atom; look for the feed link on a site)' }],
    });
    if (!v) return;
    const out = [];
    v.text.split('\n').forEach((line, i) => {
      const [name, ...rest] = line.split('|');
      const url = rest.join('|').trim();
      if (name.trim() && /^https?:\/\//i.test(url)) out.push({ id: 'f' + i + Math.random().toString(36).slice(2, 5), name: name.trim().slice(0, 40), url });
    });
    HB.setTileSettings(ctx.id, { feeds: out }, 'edit feeds');
  }

  HB.registerTile('feeds', {
    w: 4, h: 6,
    render(body, ctx) {
      const feeds = ctx.settings.feeds || [];
      if (!feeds.length) {
        body.append(h('div', { class: 'empty' }, h('p', { text: 'No feeds yet.' }), h('button', { class: 'btn', text: 'Add feeds…', onclick: () => editFeeds(ctx) })));
        return;
      }
      const readSet = new Set(ctx.settings.read || []);
      const list = h('div', { class: 'feed-list' }, h('div', { class: 'muted small', text: 'Loading…' }));
      const bar = h('div', { class: 'file-bar' });
      body.append(bar, list);
      let alive = true;
      HB.onCleanup(body, () => { alive = false; });
      const paint = async (force) => {
        if (force) feeds.forEach((f) => cache.delete(f.url));
        const results = await Promise.all(feeds.map(async (f) => ({ f, r: await loadFeed(f) })));
        if (!alive) return;
        const items = [];
        const errors = [];
        results.forEach(({ f, r }) => {
          if (r.error) errors.push(f.name + ': ' + r.error);
          else r.data.items.forEach((it) => items.push(Object.assign({}, it, { feed: f.name, id: f.id + ':' + it.id })));
        });
        items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const shown = items.slice(0, 60);
        const unread = shown.filter((i) => !readSet.has(i.id));
        bar.replaceChildren(
          h('span', { class: 'muted small', text: unread.length + ' unread' }),
          h('button', { class: 'btn small', text: 'Refresh', onclick: () => { paint(true); } }),
          h('button', { class: 'btn small', text: 'Mark all read', disabled: !unread.length, onclick: () => markRead(ctx, shown.map((i) => i.id)) }));
        list.replaceChildren(
          ...errors.map((e) => h('div', { class: 'form-err small', text: e })),
          ...shown.map((it) => h('a', {
            class: 'feed-item' + (readSet.has(it.id) ? ' read' : ''), href: it.link || null, target: '_blank', rel: 'noopener noreferrer',
            onclick: () => markRead(ctx, [it.id]),
          }, h('div', { class: 'feed-title', text: it.title }),
          h('div', { class: 'muted small', text: it.feed + (it.date ? ' · ' + ago(it.date) : '') }),
          it.summary ? h('div', { class: 'feed-sum small', text: it.summary }) : null)));
        if (!shown.length && !errors.length) list.append(h('div', { class: 'empty small', text: 'No items.' }));
      };
      paint(false);
      const iv = setInterval(() => { if (document.visibilityState === 'visible') paint(true); }, 900000);
      HB.onCleanup(body, () => clearInterval(iv));
    },
    menu(tile, ctx) { return [{ label: 'Edit feeds…', onClick: () => editFeeds(ctx) }, { label: 'Mark everything read', onClick: () => { const c = HB.tileCtx(tile); const ids = []; (c.settings.feeds || []).forEach((f) => { const r = cache.get(f.url); if (r && r.data) r.data.items.forEach((i) => ids.push(f.id + ':' + i.id)); }); markRead(c, ids); } }]; },
  });
})();
