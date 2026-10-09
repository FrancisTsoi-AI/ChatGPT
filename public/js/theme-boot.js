// Runs before first paint so the page never flashes the wrong theme.
(function () {
  try {
    var t = localStorage.getItem('hb:theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch (e) { /* storage blocked: fall back to the system theme */ }
})();
