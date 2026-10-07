<?php
declare(strict_types=1);

/**
 * A shared scenario: https://<site>/<name> (rewritten here by .htaccess) or share.php?s=<name>.
 * Locked → password form. Unlocked → the normal app in read-only mode, limited to that scenario.
 */
require __DIR__ . '/_boot.php';

hb_security_headers(true);
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
hb_session_start();

$slug = strtolower((string) ($_GET['s'] ?? ''));
$e = fn(string $s) => htmlspecialchars($s, ENT_QUOTES);
try {
    $share = hb_share_by_slug($slug);
    $available = $share && !hb_share_expired($share);
    $open = $available ? hb_share_unlocked($slug) : null;
} catch (Throwable $ex) {
    error_log('[homebase] share page: ' . $ex);
    $available = false;
    $open = null;
}
if (!$available) {
    http_response_code(404);
}
$asset = fn(string $p) => $e($p . '?v=' . (is_file(__DIR__ . '/' . $p) ? filemtime(__DIR__ . '/' . $p) : 0));
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<meta name="csrf" content="<?= $e(hb_csrf()) ?>">
<?php if ($open): ?><meta name="hb-share" content="<?= $e($slug) ?>"><?php endif; ?>
<meta name="color-scheme" content="light dark">
<title><?= $open ? $e($open['scenario_name']) . ' · shared' : 'Shared page' ?></title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234f46e5'/%3E%3Cpath d='M8 15l8-7 8 7v9h-5v-6h-6v6H8z' fill='white'/%3E%3C/svg%3E">
<script src="<?= $asset('js/theme-boot.js') ?>"></script>
<link rel="stylesheet" href="<?= $asset('vendor/gridstack/gridstack.min.css') ?>">
<link rel="stylesheet" href="assets.php?b=css&amp;v=<?= hb_asset_version('css') ?>">
</head>
<?php if (!$available): ?>
<body class="login-page">
<main class="login-card">
  <h1>Not available</h1>
  <p class="muted">This shared page does not exist, has expired, or was switched off by its owner.</p>
</main>
</body>
<?php elseif (!$open): ?>
<body class="login-page">
<main class="login-card">
  <h1>Shared page</h1>
  <p class="muted">Enter the password you were given.</p>
  <form id="share-form" data-slug="<?= $e($slug) ?>" autocomplete="off">
    <label for="pass">Password</label>
    <input id="pass" type="password" autofocus required>
    <button type="submit">Open</button>
    <p id="login-msg" class="login-msg" role="alert"></p>
  </form>
</main>
<script src="<?= $asset('js/share-login.js') ?>"></script>
</body>
<?php else: ?>
<body class="readonly">
<header id="topbar">
  <nav id="tabs" aria-label="Scenario"></nav>
  <div class="top-actions">
    <span id="share-badge" class="share-badge">Shared · read-only</span>
    <button id="btn-theme" class="btn icon" title="Light or dark" aria-label="Light or dark">◐</button>
  </div>
</header>
<main id="board-wrap">
  <div id="board" class="grid-stack"></div>
  <div id="empty-hint" class="empty-hint" hidden>This shared page is empty.</div>
</main>
<div id="toasts" class="toasts" aria-live="polite"></div>
<div id="layer"></div>
<audio id="audio" preload="none"></audio>
<script src="<?= $asset('vendor/gridstack/gridstack-all.js') ?>"></script>
<script src="<?= $asset('vendor/sortable/Sortable.min.js') ?>"></script>
<script src="assets.php?b=js&amp;v=<?= hb_asset_version('js') ?>"></script>
</body>
<?php endif; ?>
</html>
