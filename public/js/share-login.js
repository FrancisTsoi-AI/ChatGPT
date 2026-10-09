(function () {
  var form = document.getElementById('share-form');
  var msg = document.getElementById('login-msg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = '';
    fetch('api.php?r=share/unlock', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name=csrf]').content },
      body: JSON.stringify({ slug: form.dataset.slug, password: document.getElementById('pass').value }),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { location.reload(); return; }
        msg.textContent = res.j.error || 'Could not open';
        document.getElementById('pass').select();
      })
      .catch(function () { msg.textContent = 'Network error. Try again.'; });
  });
})();
