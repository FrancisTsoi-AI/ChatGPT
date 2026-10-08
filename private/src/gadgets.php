<?php
declare(strict_types=1);

/**
 * Gadgets are plug-ins (docs/GADGET_API.md). One gadget = one folder  homebase-private/gadgets/<type>/:
 *
 *   manifest.json   type, version, label, icon, hint, author, group, order, size,
 *                   entryKinds[], searchKinds[], uploads, shareActions[], requires
 *   gadget.js       class extends HB.Gadget, registered with HB.gadgets.define('<type>', …)
 *   gadget.css      optional styles
 *   server.php      optional server actions: return ['action' => function (array $c): array { … }]
 *   README.md, assets/…   optional
 *
 * That folder, zipped, is what the Gadgets page installs, updates, switches off and deletes
 * (gadget_admin.php). Nothing else lists gadgets: tile types, entry kinds and upload rules come from
 * the manifests. assets.php serves each gadget's script and styles as their own files, so a broken
 * gadget cannot stop the others (or the app) from loading.
 */

const HB_VERSION = '4.0.0';
const HB_GADGET_GROUPS = ['Everyday', 'Writing', 'Study', 'Focus', 'Web', 'Files & media'];
const HB_UPLOAD_RULES = ['any', 'audio', 'png', 'image'];
const HB_GADGET_TYPE_RE = '/^[a-z][a-z0-9_]{1,19}$/';

/** Core scripts, in load order: "core" before the gadgets (+ their manifests), "app" after them. */
const HB_CORE_JS_BEFORE = ['js/util.js', 'js/api.js', 'js/store.js', 'js/ui.js', 'js/emoji.js', 'js/md.js', 'js/gadget.js', 'js/kit.js', 'js/filekit.js'];
const HB_CORE_JS_AFTER = ['js/upload.js', 'js/grid.js', 'js/trash.js', 'js/search.js', 'js/shares.js', 'js/gadget-admin.js', 'js/app.js'];
const HB_CORE_CSS = ['css/app.css'];

/** Files inside a gadget folder that assets.php may hand to the browser (never .php, .md or dot files). */
const HB_GADGET_SERVE_TYPES = [
    'js' => 'application/javascript; charset=utf-8', 'css' => 'text/css; charset=utf-8', 'json' => 'application/json; charset=utf-8',
    'txt' => 'text/plain; charset=utf-8', 'csv' => 'text/csv; charset=utf-8',
    'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp',
    'avif' => 'image/avif', 'svg' => 'image/svg+xml', 'ico' => 'image/x-icon',
    'mp3' => 'audio/mpeg', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'm4a' => 'audio/mp4',
    'woff' => 'font/woff', 'woff2' => 'font/woff2', 'ttf' => 'font/ttf', 'otf' => 'font/otf',
];

function hb_public_dir(): ?string
{
    return defined('HB_PUBLIC') ? HB_PUBLIC : null;
}

/** Where gadget folders live (HB_GADGETS_DIR in .env can move it, e.g. for tests). */
function hb_gadgets_dir(): string
{
    $dir = (string) hb_cfg('HB_GADGETS_DIR', '');
    return rtrim($dir !== '' ? $dir : HB_PRIVATE . '/gadgets', '/');
}

/** What is wrong with a manifest (null = nothing). Used for installed folders and for uploads. */
function hb_gadget_manifest_problem(mixed $m, string $folder = ''): ?string
{
    if (!is_array($m)) {
        return 'manifest.json is not valid JSON';
    }
    $t = $m['type'] ?? '';
    if (!is_string($t) || !preg_match(HB_GADGET_TYPE_RE, $t)) {
        return 'manifest.json: "type" must be 2–20 lowercase letters, digits or _, starting with a letter';
    }
    if ($folder !== '' && $t !== $folder) {
        return 'manifest.json: "type" (' . $t . ') must match the folder name (' . $folder . ')';
    }
    foreach (['label', 'icon'] as $k) {
        if (!is_string($m[$k] ?? null) || trim($m[$k]) === '') {
            return 'manifest.json: "' . $k . '" is missing';
        }
    }
    $s = $m['size'] ?? null;
    if (!is_array($s) || (int) ($s['w'] ?? 0) < 1 || (int) $s['w'] > 12 || (int) ($s['h'] ?? 0) < 1 || (int) $s['h'] > 40) {
        return 'manifest.json: "size" needs "w" (1–12) and "h" (1–40)';
    }
    if (isset($m['version']) && !preg_match('/^\d+(\.\d+){0,3}([-+][0-9A-Za-z.]+)?$/', (string) $m['version'])) {
        return 'manifest.json: "version" should look like 1.2.0';
    }
    if (isset($m['requires']) && version_compare(HB_VERSION, (string) $m['requires'], '<')) {
        return 'This gadget needs Home Base ' . $m['requires'] . ' or newer (this is ' . HB_VERSION . ')';
    }
    if (isset($m['uploads']) && !in_array($m['uploads'], HB_UPLOAD_RULES, true)) {
        return 'manifest.json: "uploads" must be one of ' . implode(', ', HB_UPLOAD_RULES);
    }
    foreach (['entryKinds' => 11, 'searchKinds' => 11, 'shareActions' => 39] as $k => $len) {
        if (isset($m[$k]) && (!is_array($m[$k]) || array_filter($m[$k], fn($x) => !is_string($x) || !preg_match('/^[a-z][a-z0-9_]{0,' . $len . '}$/', $x)))) {
            return 'manifest.json: "' . $k . '" must be a list of short lowercase names';
        }
    }
    return null;
}

/** Every installed gadget (on or off): type => manifest plus _dir, _off, _server. In "+ Tile" menu order. */
function hb_gadget_all(): array
{
    if (isset($GLOBALS['hb_gadgets'])) {
        return $GLOBALS['hb_gadgets'];
    }
    $all = [];
    $off = hb_gadget_off_list();
    foreach (glob(hb_gadgets_dir() . '/*/manifest.json') ?: [] as $file) {
        $dir = dirname($file);
        $type = basename($dir);
        $m = json_decode((string) file_get_contents($file), true);
        $problem = hb_gadget_manifest_problem($m, $type) ?? (is_file($dir . '/gadget.js') ? null : 'gadget.js is missing');
        if ($problem !== null) {
            error_log('[homebase] skipped gadget folder ' . $type . ': ' . $problem);
            continue;
        }
        $m['version'] = (string) ($m['version'] ?? '1.0.0');
        $m['entryKinds'] = array_values(array_unique((array) ($m['entryKinds'] ?? [])));
        $m['searchKinds'] = array_values(array_intersect((array) ($m['searchKinds'] ?? []), $m['entryKinds']));
        $m['shareActions'] = array_values((array) ($m['shareActions'] ?? []));
        $m['order'] = (int) ($m['order'] ?? 999);
        $m['_dir'] = $dir;
        $m['_off'] = in_array($type, $off, true);
        $m['_server'] = is_file($dir . '/server.php');
        $all[$type] = $m;
    }
    uasort($all, function ($a, $b) {
        $g = fn($m) => ($i = array_search($m['group'] ?? '', HB_GADGET_GROUPS, true)) === false ? 99 : $i;
        return [$g($a), $a['order'], $a['type']] <=> [$g($b), $b['order'], $b['type']];
    });
    return $GLOBALS['hb_gadgets'] = $all;
}

/** Forget what was read from disk (after installing, switching or deleting a gadget). */
function hb_gadget_reset(): void
{
    unset($GLOBALS['hb_gadgets'], $GLOBALS['hb_gadget_versions']);
}

/** The gadgets that are switched on: the only ones the app loads and runs. */
function hb_gadget_manifests(): array
{
    return array_filter(hb_gadget_all(), fn($m) => !$m['_off']);
}

/** Switched-off gadgets are listed in private/storage/gadgets.json, so updating a gadget keeps the choice. */
function hb_gadget_off_list(): array
{
    $f = hb_storage() . '/gadgets.json';
    $d = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    return array_values(array_filter((array) ($d['off'] ?? []), fn($t) => is_string($t) && preg_match(HB_GADGET_TYPE_RE, $t)));
}

function hb_gadget_save_off_list(array $types): void
{
    $types = array_values(array_unique($types));
    sort($types);
    if (file_put_contents(hb_storage() . '/gadgets.json', json_encode(['off' => $types]), LOCK_EX) === false) {
        throw new HttpError(500, 'Could not write private/storage/gadgets.json');
    }
    hb_gadget_reset();
}

/** Tile types that may be created: the switched-on gadgets. */
function hb_tile_types(): array
{
    return array_keys(hb_gadget_manifests());
}

/** entries.kind => the tile type that owns it. From every installed gadget, so a switched-off gadget's rows stay valid. */
function hb_entry_tile(): array
{
    $map = [];
    foreach (hb_gadget_all() as $type => $m) {
        foreach ($m['entryKinds'] as $k) {
            $map[$k] ??= $type;
        }
    }
    return $map;
}

/** Entry kinds whose text (a, b, tags) the search box looks through. */
function hb_search_kinds(): array
{
    $kinds = [];
    foreach (hb_gadget_manifests() as $m) {
        array_push($kinds, ...$m['searchKinds']);
    }
    return array_values(array_unique($kinds));
}

function hb_gadget_upload_rule(string $type): ?string
{
    return hb_gadget_manifests()[$type]['uploads'] ?? null;
}

// ---- server actions: api.php?r=g/<type>/<action> ------------------------------------------------

/**
 * Run one server action of a gadget. <gadget>/server.php returns
 *   ['action' => function (array $c): array { … }, …]
 * where $c = ['type' => …, 'share' => share row or null (read-only visitor), 'method' => 'GET'|'POST'].
 * The returned array is sent as JSON; an action may instead send its own response and exit.
 * A share visitor may only reach the actions the manifest lists in "shareActions" (and only by GET).
 * server.php is loaded only for its own gadget's requests, so one gadget's PHP never runs in another's.
 */
function hb_gadget_action(string $type, string $action, ?array $share): array
{
    $m = hb_gadget_manifests()[$type] ?? null;
    if (!$m) {
        throw new HttpError(404, 'Unknown gadget');
    }
    if ($share !== null && !in_array($action, $m['shareActions'], true)) {
        throw new HttpError(403, 'Not available on a shared page');
    }
    static $loaded = [];
    if (!isset($loaded[$type])) {
        $loaded[$type] = $m['_server'] ? require $m['_dir'] . '/server.php' : [];
    }
    $h = $loaded[$type];
    if (!is_array($h) || !isset($h[$action]) || !is_callable($h[$action])) {
        throw new HttpError(404, 'Unknown action');
    }
    return $h[$action](['type' => $type, 'share' => $share, 'method' => hb_method()]);
}

// ---- assets (no build step: assets.php reads the files on request; versioned URLs are cached) ------

/** Relative paths (under the web folder) of a core bundle: "core" (JS before gadgets), "app" (JS after), "css". */
function hb_asset_core_files(string $bundle): array
{
    return match ($bundle) {
        'css' => HB_CORE_CSS,
        'app' => HB_CORE_JS_AFTER,
        default => HB_CORE_JS_BEFORE,
    };
}

/** A short hash of every file in a gadget folder: changes whenever anything in it changes. */
function hb_gadget_version(array $m): string
{
    $type = $m['type'];
    if (isset($GLOBALS['hb_gadget_versions'][$type])) {
        return $GLOBALS['hb_gadget_versions'][$type];
    }
    $rows = [];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($m['_dir'], FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if ($f->isFile()) {
            $rows[] = substr($f->getPathname(), strlen($m['_dir'])) . ':' . $f->getMTime() . ':' . $f->getSize();
        }
    }
    sort($rows);
    return $GLOBALS['hb_gadget_versions'][$type] = substr(sha1($m['version'] . ';' . implode(';', $rows)), 0, 12);
}

/** The manifest as the browser sees it (no server paths), with _v for asset URLs. */
function hb_gadget_client_manifest(array $m): array
{
    $out = array_filter($m, fn($k) => $k[0] !== '_', ARRAY_FILTER_USE_KEY);
    $out['_v'] = hb_gadget_version($m);
    return $out;
}

function hb_asset_version(string $bundle): string
{
    $sig = '';
    foreach (hb_asset_core_files($bundle) as $f) {
        $p = hb_public_dir() . '/' . $f;
        $sig .= $f . ':' . (is_file($p) ? filemtime($p) . ':' . filesize($p) : 'missing') . ';';
    }
    if ($bundle === 'core') { // the core bundle carries the manifests
        foreach (hb_gadget_manifests() as $type => $m) {
            $sig .= $type . ':' . hb_gadget_version($m) . ';';
        }
    }
    return substr(sha1($sig), 0, 12);
}

function hb_asset_bundle(string $bundle): string
{
    $out = '';
    foreach (hb_asset_core_files($bundle) as $f) {
        $p = hb_public_dir() . '/' . $f;
        if (is_file($p)) {
            $out .= "\n/* ===== " . $f . " ===== */\n" . (string) file_get_contents($p) . "\n";
        }
    }
    if ($bundle === 'core') {
        $out .= "\n/* ===== gadget manifests ===== */\n";
        foreach (hb_gadget_manifests() as $m) {
            $out .= 'HB.gadgets.addManifest(' . json_encode(hb_gadget_client_manifest($m), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) . ");\n";
        }
    }
    return $out;
}

/** URL of one file inside a gadget folder (versioned, so it may be cached for a year). */
function hb_gadget_url(string $type, string $file): string
{
    return 'assets.php?g=' . $type . '&f=' . rawurlencode($file) . '&v=' . hb_gadget_version(hb_gadget_manifests()[$type]);
}

/** <link> tags for the page head: core styles, then (on the app page, not the sign-in page) each gadget's own stylesheet. */
function hb_asset_css_tags(bool $gadgets = true): string
{
    $e = fn($s) => htmlspecialchars($s, ENT_QUOTES);
    $out = '<link rel="stylesheet" href="assets.php?b=css&amp;v=' . hb_asset_version('css') . '">' . "\n";
    foreach ($gadgets ? hb_gadget_manifests() : [] as $type => $m) {
        if (is_file($m['_dir'] . '/gadget.css')) {
            $out .= '<link rel="stylesheet" href="' . $e(hb_gadget_url($type, 'gadget.css')) . '" data-gadget="' . $type . '">' . "\n";
        }
    }
    return $out;
}

/** <script> tags: core (with the manifests), one per gadget, then the app. A gadget that fails to load only loses itself. */
function hb_asset_js_tags(): string
{
    $e = fn($s) => htmlspecialchars($s, ENT_QUOTES);
    $out = '<script src="assets.php?b=core&amp;v=' . hb_asset_version('core') . '"></script>' . "\n";
    foreach (array_keys(hb_gadget_manifests()) as $type) {
        $out .= '<script src="' . $e(hb_gadget_url($type, 'gadget.js')) . '" data-gadget="' . $type . '"></script>' . "\n";
    }
    return $out . '<script src="assets.php?b=app&amp;v=' . hb_asset_version('app') . '"></script>' . "\n";
}

/** Send one file of a switched-on gadget (assets.php?g=<type>&f=<path>&v=<version>), then exit. */
function hb_gadget_asset(string $type, string $path, string $v): void
{
    $m = hb_gadget_manifests()[$type] ?? null;
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $root = $m ? realpath($m['_dir']) : false;
    $full = $root ? realpath($root . '/' . $path) : false;
    if (!$m || !preg_match('#^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$#', $path) || preg_match('#(^|/)\.#', $path)
        || !isset(HB_GADGET_SERVE_TYPES[$ext]) || !$full || !str_starts_with($full, $root . DIRECTORY_SEPARATOR) || !is_file($full)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }
    $ver = hb_gadget_version($m);
    $current = $v === $ver;
    header('Content-Type: ' . HB_GADGET_SERVE_TYPES[$ext]);
    header('X-Content-Type-Options: nosniff');
    if ($ext === 'svg') {
        header("Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'");
    }
    header('ETag: "' . $ver . '"');
    header('Cache-Control: ' . ($current ? 'public, max-age=31536000, immutable' : 'no-cache'));
    header('Expires: ' . ($current ? gmdate('D, d M Y H:i:s', time() + 31536000) . ' GMT' : '0'));
    if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''), '"') === $ver) {
        http_response_code(304);
        exit;
    }
    header('Content-Length: ' . (string) filesize($full));
    readfile($full);
    exit;
}
