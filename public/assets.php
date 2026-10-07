<?php
declare(strict_types=1);

/**
 * The app's JavaScript or CSS as ONE file, built on request from the core files and every gadget
 * folder (no build step: edit a file, reload). ?b=js|css&v=<version>; the version changes whenever
 * any file changes, so browsers may cache a versioned URL for a year.
 */
require __DIR__ . '/_boot.php';

try {
    $kind = ($_GET['b'] ?? '') === 'css' ? 'css' : 'js';
    $ver = hb_asset_version($kind);
    header('Content-Type: ' . ($kind === 'css' ? 'text/css' : 'application/javascript') . '; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('ETag: "' . $ver . '"');
    $current = ($_GET['v'] ?? '') === $ver;
    header('Cache-Control: ' . ($current ? 'public, max-age=31536000, immutable' : 'no-cache'));
    // an explicit Expires keeps Apache's mod_expires (.htaccess) from adding its own to the no-cache answer
    header('Expires: ' . ($current ? gmdate('D, d M Y H:i:s', time() + 31536000) . ' GMT' : '0'));
    if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''), '"') === $ver) {
        http_response_code(304);
        exit;
    }
    echo hb_asset_bundle($kind);
} catch (Throwable $e) {
    http_response_code(500);
    error_log('[homebase] assets: ' . $e);
    echo '/* asset bundle failed */';
}
