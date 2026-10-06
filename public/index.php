<?php
declare(strict_types=1);

require __DIR__ . '/_boot.php';

hb_security_headers(true);
header('Cache-Control: no-store');
hb_session_start();

/** URL of a static asset with its mtime, so a new upload busts the browser cache. */
function asset(string $path): string
{
    $f = __DIR__ . '/' . $path;
    return htmlspecialchars($path . '?v=' . (is_file($f) ? filemtime($f) : 0), ENT_QUOTES);
}

$authed = hb_is_authed();
$csrf = htmlspecialchars(hb_csrf(), ENT_QUOTES);
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="csrf" content="<?= $csrf ?>">
<meta name="color-scheme" content="light dark">
<title>Home Base</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234f46e5'/%3E%3Cpath d='M8 15l8-7 8 7v9h-5v-6h-6v6H8z' fill='white'/%3E%3C/svg%3E">
<script src="<?= asset('js/theme-boot.js') ?>"></script>
<link rel="stylesheet" href="<?= asset('vendor/gridstack/gridstack.min.css') ?>">
<link rel="stylesheet" href="<?= asset('css/app.css') ?>">
</head>
<?php if (!$authed): ?>
<body class="login-page">
<main class="login-card">
  <h1>Home Base</h1>
  <p class="muted">Private start page</p>
  <form id="login-form" autocomplete="on">
    <input type="text" name="username" value="home" autocomplete="username" hidden>
    <label for="pass">Passphrase</label>
    <input id="pass" type="password" name="password" autocomplete="current-password" autofocus required>
    <button type="submit">Sign in</button>
    <p id="login-msg" class="login-msg" role="alert"></p>
  </form>
</main>
<script src="<?= asset('js/login.js') ?>"></script>
</body>
<?php else: ?>
<body>
<header id="topbar">
  <nav id="tabs" aria-label="Scenarios"></nav>
  <div class="top-actions">
    <span id="save-state" class="save-state" title="Save status">Saved</span>
    <button id="btn-add" class="btn" title="Add a tile">+ Tile</button>
    <button id="btn-search" class="btn icon" title="Search and commands (Ctrl+K)" aria-label="Search">⌕</button>
    <button id="btn-menu" class="btn icon" title="Menu" aria-label="Menu">⋯</button>
  </div>
</header>
<main id="board-wrap">
  <div id="board" class="grid-stack"></div>
  <div id="empty-hint" class="empty-hint" hidden>Nothing here yet. Press <b>+ Tile</b> to add one.</div>
</main>
<div id="trash-zone" class="trash-zone" title="Drop here to delete. Click to open the trash.">
  <span class="trash-icon">🗑</span><span class="trash-label">Trash</span><span id="trash-count" class="trash-count"></span>
</div>
<div id="drop-overlay" class="drop-overlay" hidden><div>Drop to upload<small id="drop-target"></small></div></div>
<div id="toasts" class="toasts" aria-live="polite"></div>
<div id="layer"></div>
<audio id="audio" preload="none"></audio>
<script src="<?= asset('vendor/gridstack/gridstack-all.js') ?>"></script>
<script src="<?= asset('vendor/sortable/Sortable.min.js') ?>"></script>
<script src="<?= asset('js/util.js') ?>"></script>
<script src="<?= asset('js/api.js') ?>"></script>
<script src="<?= asset('js/store.js') ?>"></script>
<script src="<?= asset('js/ui.js') ?>"></script>
<script src="<?= asset('js/tiles/common.js') ?>"></script>
<script src="<?= asset('js/tiles/toolbox.js') ?>"></script>
<script src="<?= asset('js/tiles/todo.js') ?>"></script>
<script src="<?= asset('js/tiles/thoughts.js') ?>"></script>
<script src="<?= asset('js/tiles/clock.js') ?>"></script>
<script src="<?= asset('js/tiles/countdown.js') ?>"></script>
<script src="<?= asset('js/tiles/files.js') ?>"></script>
<script src="<?= asset('js/tiles/music.js') ?>"></script>
<script src="<?= asset('js/upload.js') ?>"></script>
<script src="<?= asset('js/grid.js') ?>"></script>
<script src="<?= asset('js/trash.js') ?>"></script>
<script src="<?= asset('js/search.js') ?>"></script>
<script src="<?= asset('js/app.js') ?>"></script>
</body>
<?php endif; ?>
</html>
