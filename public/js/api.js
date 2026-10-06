(function () {
  const HB = window.HB;
  const csrf = () => document.querySelector('meta[name=csrf]').content;

  /** One call to the PHP gateway. Throws Error with .status; a lost login reloads to the login page. */
  async function call(route, opts) {
    opts = opts || {};
    const method = opts.method || 'GET';
    const url = 'api.php?r=' + route + (opts.query ? '&' + new URLSearchParams(opts.query) : '');
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
    state: () => call('state'),
    batch: (ops, keepalive) => call('batch', { method: 'POST', body: { ops }, keepalive }),
    trash: () => call('trash'),
    search: (q) => call('search', { query: { q } }),
    logout: () => call('auth/logout', { method: 'POST' }),
    csrf,
  };
})();
