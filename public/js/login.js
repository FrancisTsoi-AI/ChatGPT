(function () {
  var form = document.getElementById('login-form');
  var msg = document.getElementById('login-msg');
  var csrf = document.querySelector('meta[name=csrf]').content;
  var timer = null;

  function lock(seconds) {
    var btn = form.querySelector('button');
    btn.disabled = true;
    clearInterval(timer);
    timer = setInterval(function () {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(timer);
        btn.disabled = false;
        msg.textContent = '';
      } else {
        var m = Math.floor(seconds / 60), s = seconds % 60;
        msg.textContent = 'Locked. Try again in ' + m + ':' + String(s).padStart(2, '0');
      }
    }, 1000);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = '';
    fetch('api.php?r=auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ passphrase: document.getElementById('pass').value }),
      credentials: 'same-origin'
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { location.reload(); return; }
        msg.textContent = res.j.error || 'Sign in failed';
        if (res.j.retry_after) lock(res.j.retry_after);
        document.getElementById('pass').select();
      })
      .catch(function () { msg.textContent = 'Network error. Try again.'; });
  });
})();
