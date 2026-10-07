<?php
declare(strict_types=1);

/**
 * Gadget modules (docs/GADGET_API.md).
 *
 * A gadget is a folder  public/gadgets/<type>/  holding
 *   manifest.json   type, label, icon, hint, group, order, size, entryKinds[], searchKinds[], uploads
 *   gadget.js       class extends HB.Gadget, registered with HB.gadgets.define('<type>', …)
 *   gadget.css      optional styles
 *   README.md       what it does, its data, how to extend it (for whoever works on it next)
 * and, only if it needs the server, a file  private/gadgets/<type>.php  returning its actions.
 * Adding a folder is enough: the server learns tile types, entry kinds and upload rules from the
 * manifests, and assets.php bundles the code — no central list to edit.
 */

const HB_GADGET_GROUPS = ['Everyday', 'Writing', 'Study', 'Focus', 'Web', 'Files & media'];
const HB_UPLOAD_RULES = ['any', 'audio', 'png', 'image'];

/** Core scripts, in load order, around the gadget code. */
const HB_CORE_JS_BEFORE = ['js/util.js', 'js/api.js', 'js/store.js', 'js/ui.js', 'js/emoji.js', 'js/md.js', 'js/gadget.js', 'js/kit.js', 'js/filekit.js', 'js/editor.js'];
const HB_CORE_JS_AFTER = ['js/upload.js', 'js/grid.js', 'js/trash.js', 'js/search.js', 'js/shares.js', 'js/app.js'];
const HB_CORE_CSS = ['css/app.css', 'css/editor.css'];

function hb_public_dir(): ?string
{
    return defined('HB_PUBLIC') ? HB_PUBLIC : null;
}

/** All valid gadget manifests, keyed by type, in "+ Tile" menu order. */
function hb_gadget_manifests(): array
{
    static $all = null;
    if ($all !== null) {
        return $all;
    }
    $all = [];
    $dir = hb_public_dir();
    if ($dir === null) {
        return $all;
    }
    foreach (glob($dir . '/gadgets/*/manifest.json') ?: [] as $file) {
        $type = basename(dirname($file));
        $m = json_decode((string) file_get_contents($file), true);
        if (!is_array($m) || ($m['type'] ?? '') !== $type || !preg_match('/^[a-z][a-z0-9_]{1,19}$/', $type)
            || !is_file(dirname($file) . '/gadget.js')) {
            error_log('[homebase] skipped gadget folder ' . $type . ': bad or missing manifest.json / gadget.js');
            continue;
        }
        $m['entryKinds'] = array_values(array_filter((array) ($m['entryKinds'] ?? []),
            fn($k) => is_string($k) && (bool) preg_match('/^[a-z][a-z0-9_]{0,11}$/', $k)));
        $m['searchKinds'] = array_values(array_intersect((array) ($m['searchKinds'] ?? []), $m['entryKinds']));
        if (isset($m['uploads']) && !in_array($m['uploads'], HB_UPLOAD_RULES, true)) {
            unset($m['uploads']);
        }
        $m['order'] = (int) ($m['order'] ?? 999);
        $all[$type] = $m;
    }
    uasort($all, function ($a, $b) {
        $g = fn($m) => ($i = array_search($m['group'] ?? '', HB_GADGET_GROUPS, true)) === false ? 99 : $i;
        return [$g($a), $a['order'], $a['type']] <=> [$g($b), $b['order'], $b['type']];
    });
    return $all;
}

function hb_tile_types(): array
{
    $types = array_keys(hb_gadget_manifests());
    if (!$types) {
        throw new HttpError(500, 'No gadgets found. Upload the web folder\'s "gadgets" directory too.');
    }
    return $types;
}

/** entries.kind => the tile type that owns it. */
function hb_entry_tile(): array
{
    $map = [];
    foreach (hb_gadget_manifests() as $type => $m) {
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
 * Run one server action of a gadget. private/gadgets/<type>.php returns
 *   ['action' => function (array $c): array { … }, …]
 * where $c = ['type' => …, 'share' => share row or null (read-only visitor), 'method' => 'GET'|'POST'].
 * The returned array is sent as JSON; an action may instead send its own response and exit.
 */
function hb_gadget_action(string $type, string $action, ?array $share): array
{
    if (!isset(hb_gadget_manifests()[$type])) {
        throw new HttpError(404, 'Unknown gadget');
    }
    static $loaded = [];
    if (!isset($loaded[$type])) {
        $file = HB_PRIVATE . '/gadgets/' . $type . '.php';
        $loaded[$type] = is_file($file) ? require $file : [];
    }
    $h = $loaded[$type];
    if (!is_array($h) || !isset($h[$action]) || !is_callable($h[$action])) {
        throw new HttpError(404, 'Unknown action');
    }
    return $h[$action](['type' => $type, 'share' => $share, 'method' => hb_method()]);
}

// ---- asset bundle (no build step: assets.php concatenates on request, cached by version) ---------

/** Relative paths (under the web folder) of every file in a bundle, in order. */
function hb_asset_files(string $kind): array
{
    $out = $kind === 'css' ? HB_CORE_CSS : HB_CORE_JS_BEFORE;
    foreach (array_keys(hb_gadget_manifests()) as $type) {
        $f = 'gadgets/' . $type . '/gadget.' . ($kind === 'css' ? 'css' : 'js');
        if (is_file(hb_public_dir() . '/' . $f)) {
            $out[] = $f;
        }
    }
    if ($kind !== 'css') {
        $out = array_merge($out, HB_CORE_JS_AFTER);
    }
    return $out;
}

function hb_asset_version(string $kind): string
{
    $sig = '';
    foreach (hb_asset_files($kind) as $f) {
        $p = hb_public_dir() . '/' . $f;
        $sig .= $f . ':' . (is_file($p) ? filemtime($p) . ':' . filesize($p) : 'missing') . ';';
        if ($kind !== 'css' && str_starts_with($f, 'gadgets/')) {
            $mf = dirname($p) . '/manifest.json';
            $sig .= is_file($mf) ? filemtime($mf) . ';' : '';
        }
    }
    return substr(sha1($sig), 0, 12);
}

function hb_asset_bundle(string $kind): string
{
    $out = '';
    $manifests = hb_gadget_manifests();
    foreach (hb_asset_files($kind) as $f) {
        $p = hb_public_dir() . '/' . $f;
        if (!is_file($p)) {
            continue;
        }
        $out .= "\n/* ===== " . $f . " ===== */\n";
        if ($kind !== 'css' && preg_match('#^gadgets/([a-z0-9_]+)/gadget\.js$#', $f, $m)) {
            $out .= 'HB.gadgets.addManifest(' . json_encode($manifests[$m[1]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . ");\n";
        }
        $out .= (string) file_get_contents($p) . "\n";
    }
    return $out;
}
