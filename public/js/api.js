(function () {
  const HB = window.HB;
  const csrf = () => document.querySelector('meta[name=csrf]').content;

  /** One call to the PHP gateway. Throws Error with .status; a lost login reloads to the login page. */
  async function call(route, opts) {
    opts = opts || {};
    const method = opts.method || 'GET';
    const url = 'api.php?r=' + route + (opts.query ? '&' + new URLSearchParams(opts.query) : '') + (HB.shareSlug ? '&share=' + encodeURIComponent(HB.shareSlug) : '');
    const init = { method: 'GET', credentials: 'same-origin', headers: {}, keepalive: !!opts.keepalive };
    if (method !== 'GET') {
      init.method = 'POST';
      init.headers['X-CSRF-Token'] = csrf();
      if (method !== 'POST') init.headers['X-HTTP-Method-Override'] = method;
      if (opts.form) init.body = opts.form;
      else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body || {}); }
    }
    let res;
    try { res = await fetch(url, init); } catch (e) { const err = new Error('Network error'); err.status = 0; throw err; }
    let json = null;
    try { json = await res.json(); } catch (e) { /* non-JSON error page */ }
    if (!res.ok) {
      if (res.status === 401) { location.reload(); }
      const err = new Error((json && json.error) || 'Request failed (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return json;
  }

  HB.api = {
    call,
    state: () => call(HB.shareSlug ? 'share/state' : 'state'),
    batch: (ops, keepalive) => call('batch', { method: 'POST', body: { ops }, keepalive }),
    trash: () => call('trash'),
    search: (q) => call('search', { query: { q } }),
    /** URL of a GET route, for places that load it themselves (an iframe, an <audio>). */
    url: (route, query) => 'api.php?r=' + route + (query ? '&' + new URLSearchParams(query) : '') + (HB.shareSlug ? '&share=' + encodeURIComponent(HB.shareSlug) : ''),
    /** A gadget's own server action: gadgets/<type>/server.php → action(…). */
    gadget: (type, action, query, opts) => call('g/' + type + '/' + action, Object.assign({}, opts || {}, { query: query || {} })),
    logout: () => call('auth/logout', { method: 'POST' }),
    logoutAll: (keepThis) => call('auth/logout-all', { method: 'POST', body: { keep_this: !!keepThis } }),
    csrf,
  };
})();
