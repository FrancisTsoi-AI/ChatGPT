<?php
declare(strict_types=1);

/**
 * The app's code and styles, read from disk on request (no build step: edit a file, reload).
 *   ?b=core|app|css&v=<version>      core scripts (+ every gadget's manifest), app scripts, core styles
 *   ?g=<type>&f=<file>&v=<version>   one file of a gadget (gadget.js, gadget.css, assets/…), from
 *                                    homebase-private/gadgets/<type>/ — never its PHP or notes
 * Versions change whenever a file changes, so a versioned URL may be cached for a year.
 */
require __DIR__ . '/_boot.php';

try {
    if (isset($_GET['g'])) {
        hb_gadget_asset((string) $_GET['g'], (string) ($_GET['f'] ?? ''), (string) ($_GET['v'] ?? ''));
    }
    $bundle = (string) ($_GET['b'] ?? '');
    if (!in_array($bundle, ['core', 'app', 'css'], true)) {
        http_response_code(404);
        exit;
    }
    $ver = hb_asset_version($bundle);
    $current = ($_GET['v'] ?? '') === $ver;
    header('Content-Type: ' . ($bundle === 'css' ? 'text/css' : 'application/javascript') . '; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('ETag: "' . $ver . '"');
    header('Cache-Control: ' . ($current ? 'public, max-age=31536000, immutable' : 'no-cache'));
    // an explicit Expires keeps Apache's mod_expires (.htaccess) from adding its own to the no-cache answer
    header('Expires: ' . ($current ? gmdate('D, d M Y H:i:s', time() + 31536000) . ' GMT' : '0'));
    if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''), '"') === $ver) {
        http_response_code(304);
        exit;
    }
    echo hb_asset_bundle($bundle);
} catch (Throwable $e) {
    http_response_code(500);
    error_log('[homebase] assets: ' . $e);
    echo '/* asset bundle failed */';
}
