<?php
declare(strict_types=1);

/**
 * First-run helper: host check + passphrase hash generator. It switches itself OFF
 * (404) as soon as HB_PASSPHRASE_HASH is set in private/.env, so it is safe to leave
 * on the server, but you may also simply delete this file after setup.
 */
require __DIR__ . '/_boot.php';
require HB_PRIVATE . '/src/setup.php';

hb_security_headers(true);
header('Cache-Control: no-store');
if ((string) hb_cfg('HB_PASSPHRASE_HASH', '') !== '') {
    http_response_code(404);
    exit('Not found');
}
$hash = null;
$err = '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $p1 = (string) ($_POST['p1'] ?? '');
    $p2 = (string) ($_POST['p2'] ?? '');
    if ($p1 === '' || $p1 !== $p2) {
        $err = 'The two passphrases are empty or do not match.';
    } elseif (strlen($p1) < 10) {
        $err = 'Use at least 10 characters (14+ or a few random words is better).';
    } else {
        $hash = password_hash($p1, PASSWORD_DEFAULT);
    }
}
$h = fn(string $s) => htmlspecialchars($s, ENT_QUOTES);
?>
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Home Base setup</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#1f2937}
table{border-collapse:collapse;width:100%}td,th{padding:.35rem .5rem;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}
.ok{color:#15803d}.fail{color:#b91c1c;font-weight:600}.warn{color:#b45309}code,textarea{font:13px ui-monospace,monospace}
textarea{width:100%;height:5rem}input{padding:.4rem;width:100%;box-sizing:border-box;margin:.2rem 0 .7rem}button{padding:.5rem 1rem}
</style></head><body>
<h1>Home Base setup</h1>
<p>Stage S0/S1 helper. This page turns itself off once <code>HB_PASSPHRASE_HASH</code> is set in <code>.env</code>.</p>
<h2>1 · Host check</h2>
<table>
<?php foreach (hb_host_checks() as $r): ?>
<tr><td class="<?= $r['ok'] ? 'ok' : ($r['required'] ? 'fail' : 'warn') ?>"><?= $r['ok'] ? 'OK' : ($r['required'] ? 'FIX' : 'note') ?></td>
<td><?= $h($r['name']) ?></td><td><?= $h($r['detail']) ?></td></tr>
<?php endforeach; ?>
</table>
<h2>2 · Passphrase hash</h2>
<p>Type the passphrase you will use to sign in. Only its hash is shown; copy the line into <code>.env</code> (inside the private folder).
Use this page over HTTPS.</p>
<?php if ($err): ?><p class="fail"><?= $h($err) ?></p><?php endif; ?>
<?php if ($hash): ?>
<p>Paste this line into <code>.env</code>, save, then reload this page (it will switch off):</p>
<textarea readonly>HB_PASSPHRASE_HASH='<?= $h($hash) ?>'</textarea>
<?php else: ?>
<form method="post" autocomplete="off">
<label>Passphrase<input type="password" name="p1" autocomplete="new-password"></label>
<label>Repeat<input type="password" name="p2" autocomplete="new-password"></label>
<button>Generate hash</button>
</form>
<?php endif; ?>
</body></html>
