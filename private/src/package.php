<?php
declare(strict_types=1);

/**
 * Home Base packages: ONE file that installs or updates the whole platform, like a WordPress release.
 *
 *   homebase.zip            the package
 *   homebase-setup.php      the one-file installer: a small PHP program with the same package behind
 *                           __halt_compiler(), so ZipArchive opens the .php file itself
 *
 * A package holds
 *   homebase.json                    {"name":"Home Base","version":"5.0.0","gadgets":{"clock":"1.0.0",…}}
 *   web/…                            the web folder (document root)
 *   private/src/… private/bin/…      the gateway
 *   private/schema.sql .env.example .htaccess storage/… (empty skeleton)
 *   private/catalog/<type>.zip       the built-in gadgets, each a normal gadget package (the "plug-in directory")
 *
 * Applying it replaces the program (web files, src, bin, schema, catalog) and never touches .env,
 * storage (your data and uploads) or the gadgets you installed; built-in gadgets you have are updated
 * when the catalog holds a newer version, and a new installation gets all of them.
 *
 * Used by the installer (tools/installer.php, before anything else exists) and by the Gadgets & updates
 * page, so this file needs no other Home Base code. Its syntax also parses on PHP 7, so the installer can
 * still say "PHP 8 is needed" on an old server instead of showing a blank page.
 */

class HbpError extends RuntimeException
{
}

const HBP_MAX_FILES = 4000;
const HBP_MAX_BYTES = 104857600;   // 100 MB unpacked
const HBP_FILE_MAX = 20971520;     // 20 MB per file
const HBP_DOT_OK = ['.htaccess', '.gitkeep', '.env.example'];
const HBP_STORAGE_DIRS = ['files', 'sessions', 'ratelimit', 'tmp', 'cache'];
/** Program parts of the private folder, replaced as a whole on update. */
const HBP_PRIVATE_CORE = ['src', 'bin', 'catalog', 'schema.sql', '.env.example'];
/** What versions before 5.0 kept in places that are no longer used (removed when such a site is updated). */
const HBP_LEGACY_WEB_DIRS = ['gadgets', 'js/tiles'];
const HBP_LEGACY_PRIVATE_FILES = ['gadgets/embed.php', 'gadgets/feeds.php', 'gadgets/reading.php', 'gadgets/weather.php',
    'gadgets/writer.php', 'gadgets/youtube.php', 'gadgets/pronounce.php'];

/** A plain relative path: no ../, no absolute paths, no hidden files except the few a site needs. */
function hbp_safe_path(string $p): bool
{
    if (!preg_match('#^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$#', $p)) {
        return false;
    }
    $parts = explode('/', $p);
    $last = count($parts) - 1;
    foreach ($parts as $i => $seg) {
        if ($seg === '.' || $seg === '..' || ($seg[0] === '.' && !($i === $last && in_array($seg, HBP_DOT_OK, true)))) {
            return false;
        }
    }
    return true;
}

/**
 * Open a package (homebase.zip, or homebase-setup.php) and check every entry before anything is written.
 * Returns ['za' => ZipArchive, 'info' => homebase.json, 'web' => [path => index], 'priv' => [path => index], 'cat' => [type => index]].
 */
function hbp_open(string $file): array
{
    if (!class_exists('ZipArchive')) {
        throw new HbpError('This server has no PHP "zip" extension. Ask your host to switch it on.');
    }
    $za = new ZipArchive();
    if ($za->open($file) !== true) {
        throw new HbpError('That file is not a Home Base package.');
    }
    $prefix = null;
    for ($i = 0; $i < $za->numFiles; $i++) {
        $n = (string) $za->getNameIndex($i);
        if ($n === 'homebase.json' || preg_match('#^[A-Za-z0-9_.-]+/homebase\.json$#', $n)) {
            $prefix = substr($n, 0, -strlen('homebase.json'));
            break;
        }
    }
    if ($prefix === null) {
        $za->close();
        throw new HbpError('That file is not a Home Base package (it has no homebase.json).');
    }
    $info = json_decode((string) $za->getFromName($prefix . 'homebase.json'), true);
    if (!is_array($info) || ($info['name'] ?? '') !== 'Home Base' || !preg_match('/^\d+\.\d+(\.\d+)?$/', (string) ($info['version'] ?? ''))) {
        $za->close();
        throw new HbpError('The package\'s homebase.json is not valid.');
    }
    $web = [];
    $priv = [];
    $cat = [];
    $total = 0;
    for ($i = 0; $i < $za->numFiles; $i++) {
        $st = $za->statIndex($i);
        $name = (string) $st['name'];
        if ($prefix !== '' && strpos($name, $prefix) !== 0) {
            throw new HbpError('Unexpected file in the package: ' . substr($name, 0, 80));
        }
        $rel = (string) substr($name, strlen($prefix));
        if ($rel === '' || substr($rel, -1) === '/' || $rel === 'homebase.json') {
            continue;
        }
        if (!hbp_safe_path($rel)) {
            throw new HbpError('Not allowed in a Home Base package: ' . substr($rel, 0, 80));
        }
        $opsys = 0;
        $attr = 0;
        if ((int) ($st['encryption_method'] ?? 0) !== 0
            || ($za->getExternalAttributesIndex($i, $opsys, $attr) && $opsys === ZipArchive::OPSYS_UNIX && (($attr >> 16) & 0170000) === 0120000)) {
            throw new HbpError('Not allowed in a Home Base package (encrypted or a link): ' . $rel);
        }
        $size = (int) $st['size'];
        $total += $size;
        if ($size > HBP_FILE_MAX || $total > HBP_MAX_BYTES || count($web) + count($priv) + count($cat) >= HBP_MAX_FILES) {
            throw new HbpError('The package is too large.');
        }
        if (strpos($rel, 'web/') === 0) {
            $web[substr($rel, 4)] = $i;
        } elseif (strpos($rel, 'private/') === 0) {
            $p = substr($rel, 8);
            if (preg_match('#^catalog/([a-z][a-z0-9_]{1,19})\.zip$#', $p, $m)) {
                $cat[$m[1]] = $i;
            } elseif (preg_match('#^(src|bin)/#', $p) || in_array($p, ['schema.sql', '.env.example', '.htaccess'], true)
                || preg_match('#^storage/([a-z]+/)?(\.htaccess|\.gitkeep)$#', $p)) {
                $priv[$p] = $i;
            } else {
                throw new HbpError('Not allowed in a Home Base package: ' . $rel);
            }
        } else {
            throw new HbpError('Not allowed in a Home Base package: ' . $rel);
        }
    }
    foreach (['index.php', '_boot.php', 'api.php', 'assets.php'] as $f) {
        if (!isset($web[$f])) {
            throw new HbpError('The package is incomplete (web/' . $f . ' is missing).');
        }
    }
    if (!isset($priv['src/bootstrap.php'], $priv['schema.sql'])) {
        throw new HbpError('The package is incomplete (private/src is missing).');
    }
    return ['za' => $za, 'info' => $info, 'web' => $web, 'priv' => $priv, 'cat' => $cat];
}

function hbp_read(ZipArchive $za, int $i): string
{
    $st = $za->statIndex($i);
    $size = (int) $st['size'];
    $data = $size > 0 ? $za->getFromIndex($i, $size) : '';
    if (!is_string($data) || strlen($data) !== $size) {
        throw new HbpError('The package is damaged (' . $st['name'] . ').');
    }
    return $data;
}

function hbp_put(string $path, string $data): void
{
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new HbpError('Could not create the folder ' . $dir);
    }
    if (@file_put_contents($path, $data) === false) {
        throw new HbpError('Could not write ' . $path);
    }
}

/** Write a file so readers see either the old or the new version, never half. */
function hbp_put_atomic(string $path, string $data): void
{
    $tmp = $path . '.hbnew-' . bin2hex(random_bytes(4));
    hbp_put($tmp, $data);
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        throw new HbpError('Could not replace ' . $path . ' (is it writable?)');
    }
}

function hbp_move(string $from, string $to): void
{
    if (!is_dir(dirname($to)) && !@mkdir(dirname($to), 0755, true) && !is_dir(dirname($to))) {
        throw new HbpError('Could not create the folder ' . dirname($to));
    }
    if (!@rename($from, $to)) {
        throw new HbpError('Could not move ' . $from . ' (is it writable?)');
    }
}

/** Delete a file or a folder with everything in it; links are removed, never followed. */
function hbp_rrmdir(string $path): void
{
    if (is_link($path) || is_file($path)) {
        @unlink($path);
        return;
    }
    if (!is_dir($path)) {
        return;
    }
    foreach (scandir($path) ?: [] as $f) {
        if ($f !== '.' && $f !== '..') {
            hbp_rrmdir($path . '/' . $f);
        }
    }
    @rmdir($path);
}

/** What the last install or update recorded in private/core.json (null for sites from before 5.0). */
function hbp_core_state(string $priv): ?array
{
    $f = $priv . '/core.json';
    $d = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    return is_array($d) && isset($d['version'], $d['web']) && is_array($d['web']) ? $d : null;
}

/** The installed Home Base version, or null when unknown (before 4.0). */
function hbp_installed_version(string $priv): ?string
{
    $core = hbp_core_state($priv);
    if ($core) {
        return (string) $core['version'];
    }
    $g = $priv . '/src/gadgets.php';
    if (is_file($g) && preg_match("/const HB_VERSION = '([0-9.]+)'/", (string) file_get_contents($g), $m)) {
        return $m[1];
    }
    return null;
}

/** manifest.json of a gadget zip (top level, or inside its one folder); null if there is none. */
function hbp_gadget_manifest(string $zipFile): ?array
{
    $za = new ZipArchive();
    if ($za->open($zipFile) !== true) {
        return null;
    }
    $m = null;
    for ($i = 0; $i < $za->numFiles; $i++) {
        $n = (string) $za->getNameIndex($i);
        if ($n === 'manifest.json' || preg_match('#^[A-Za-z0-9_.-]+/manifest\.json$#', $n)) {
            $m = json_decode((string) $za->getFromIndex($i), true);
            break;
        }
    }
    $za->close();
    return is_array($m) && isset($m['type']) && is_string($m['type']) ? $m : null;
}

/** Unpack a built-in gadget zip from the catalog into $dest (plain names only). Returns its manifest. */
function hbp_unpack_gadget(string $zipFile, string $dest): array
{
    $m = hbp_gadget_manifest($zipFile);
    $za = new ZipArchive();
    if (!$m || $za->open($zipFile) !== true) {
        throw new HbpError('A built-in gadget in the package is damaged (' . basename($zipFile) . ').');
    }
    try {
        $prefix = $za->locateName('manifest.json') !== false ? '' : $m['type'] . '/';
        for ($i = 0; $i < $za->numFiles; $i++) {
            $name = (string) $za->getNameIndex($i);
            $rel = (string) substr($name, strlen($prefix));
            if (substr($name, -1) === '/' || $rel === '') {
                continue;
            }
            if (($prefix !== '' && strpos($name, $prefix) !== 0) || !hbp_safe_path($rel) || $rel[0] === '.') {
                throw new HbpError('A built-in gadget in the package is damaged (' . $name . ').');
            }
            hbp_put($dest . '/' . $rel, hbp_read($za, $i));
        }
    } finally {
        $za->close();
    }
    return $m;
}

/** Put a prepared gadget folder in place of $target, swapping by rename. True if it replaced an older one. */
function hbp_swap_in(string $prepared, string $target): bool
{
    $old = null;
    if (file_exists($target) || is_link($target)) {
        $old = dirname($target) . '/.old-' . basename($target) . '-' . bin2hex(random_bytes(4));
        hbp_move($target, $old);
    }
    if (!@rename($prepared, $target)) {
        if ($old !== null) {
            @rename($old, $target);
        }
        throw new HbpError('Could not put the gadget ' . basename($target) . ' in place');
    }
    if ($old !== null) {
        hbp_rrmdir($old);
    }
    return $old !== null;
}

/**
 * .htaccess needs care: some hosts forbid a line in it, and people edit it by hand.
 * Returns what to write, or null to keep the current file (then ours is left next to it).
 */
function hbp_htaccess(string $new, string $target, ?array $core, array &$state, array &$report): ?string
{
    $cur = is_file($target) ? (string) file_get_contents($target) : null;
    if (!empty($state['htaccess_no_options']) || ($cur !== null && $core === null && strpos($cur, 'Options -Indexes') === false)) {
        $state['htaccess_no_options'] = true; // the host refused it once: keep leaving it out
        $new = (string) preg_replace('/^Options -Indexes\R/m', '', $new);
    }
    if ($cur !== null && $core !== null && isset($core['web']['.htaccess']) && sha1($cur) !== $core['web']['.htaccess'] && sha1($cur) !== sha1($new)) {
        @file_put_contents($target . '.homebase-new', $new);
        $report['notes'][] = 'Your .htaccess was changed by hand, so it was kept; the new version is next to it as .htaccess.homebase-new.';
        return null;
    }
    return $new;
}

/**
 * Install or update from an opened package. Program files are replaced with a journal, so a failure
 * part-way puts every replaced file back. $opt: 'fresh' => new installation (installs every built-in
 * gadget), 'gadgets' => the gadgets folder (default <private>/gadgets).
 * Returns ['from', 'to', 'updated' => [types], 'installed' => [types], 'available' => [types], 'removed' => n, 'notes' => [..]].
 */
function hbp_apply(array $pkg, string $web, string $priv, array $opt = []): array
{
    $za = $pkg['za'];
    $fresh = !empty($opt['fresh']);
    $gdir = rtrim((string) ($opt['gadgets'] ?? ($priv . '/gadgets')), '/');
    $core = hbp_core_state($priv);
    $state = $core['state'] ?? [];
    $report = ['from' => hbp_installed_version($priv), 'to' => (string) $pkg['info']['version'], 'updated' => [], 'installed' => [],
        'available' => [], 'removed' => 0, 'notes' => []];
    if (!is_dir($priv) && !@mkdir($priv, 0755, true)) {
        throw new HbpError('Could not create ' . $priv);
    }
    $stage = $priv . '/.update-' . bin2hex(random_bytes(6));
    $journal = []; // ['back', backup, target] = put backup back; ['gone', target] = remove what we added
    try {
        // 1. the private program parts, unpacked beside the old ones, then swapped in
        foreach ($pkg['priv'] as $rel => $i) {
            hbp_put($stage . '/new/' . $rel, hbp_read($za, $i));
        }
        foreach ($pkg['cat'] as $type => $i) {
            hbp_put($stage . '/new/catalog/' . $type . '.zip', hbp_read($za, $i));
        }
        foreach (HBP_PRIVATE_CORE as $p) {
            if (!file_exists($stage . '/new/' . $p)) {
                continue;
            }
            $target = $priv . '/' . $p;
            if (file_exists($target)) {
                hbp_move($target, $stage . '/old/' . $p);
                $journal[] = ['back', $stage . '/old/' . $p, $target];
            } else {
                $journal[] = ['gone', $target];
            }
            hbp_move($stage . '/new/' . $p, $target);
        }
        foreach ($pkg['priv'] as $rel => $i) { // .htaccess and the storage skeleton: only what is missing
            if (($rel === '.htaccess' || strpos($rel, 'storage/') === 0) && !file_exists($priv . '/' . $rel)) {
                hbp_put($priv . '/' . $rel, hbp_read($za, $i));
            }
        }
        foreach (HBP_STORAGE_DIRS as $d) {
            if (!is_dir($priv . '/storage/' . $d)) {
                @mkdir($priv . '/storage/' . $d, 0755, true);
            }
        }

        // 2. the web files
        $hashes = [];
        foreach ($pkg['web'] as $rel => $i) {
            $data = hbp_read($za, $i);
            $target = $web . '/' . $rel;
            if ($rel === '.htaccess') {
                $hashes[$rel] = sha1($data);
                $data = hbp_htaccess($data, $target, $core, $state, $report);
                if ($data === null) {
                    continue;
                }
                $hashes[$rel] = sha1($data);
            } else {
                $hashes[$rel] = sha1($data);
            }
            if (is_file($target)) {
                if (sha1_file($target) === sha1($data)) {
                    continue;
                }
                hbp_put($stage . '/oldweb/' . $rel, (string) file_get_contents($target));
                $journal[] = ['back', $stage . '/oldweb/' . $rel, $target];
            } else {
                $journal[] = ['gone', $target];
            }
            hbp_put_atomic($target, $data);
        }

        // 3. what the old version had and this one does not
        $stale = $core ? array_diff(array_keys($core['web']), array_keys($pkg['web'])) : [];
        foreach ($stale as $rel) {
            if (hbp_safe_path((string) $rel) && is_file($web . '/' . $rel)) {
                hbp_move($web . '/' . $rel, $stage . '/stale/' . $rel);
                $journal[] = ['back', $stage . '/stale/' . $rel, $web . '/' . $rel];
                $report['removed']++;
            }
        }
        if (!$core) { // a site from before 5.0: gadget code used to live in the web folder
            foreach (HBP_LEGACY_WEB_DIRS as $d) {
                if (is_dir($web . '/' . $d) && !is_link($web . '/' . $d)) {
                    hbp_move($web . '/' . $d, $stage . '/stale/' . $d);
                    $journal[] = ['back', $stage . '/stale/' . $d, $web . '/' . $d];
                    $report['removed']++;
                }
            }
            foreach (HBP_LEGACY_PRIVATE_FILES as $f) {
                if (is_file($priv . '/' . $f)) {
                    hbp_move($priv . '/' . $f, $stage . '/stale-private/' . $f);
                    $journal[] = ['back', $stage . '/stale-private/' . $f, $priv . '/' . $f];
                    $report['removed']++;
                }
            }
        }
    } catch (Throwable $e) {
        foreach (array_reverse($journal) as $j) {
            if ($j[0] === 'back') {
                if (is_dir($j[2]) && !is_link($j[2])) {
                    hbp_rrmdir($j[2]);
                }
                @rename($j[1], $j[2]);
            } else {
                hbp_rrmdir($j[1]);
            }
        }
        hbp_rrmdir($stage);
        throw new HbpError('The update stopped and everything was put back as it was: ' . $e->getMessage());
    }
    hbp_rrmdir($stage);

    // 4. gadgets: a new site (or one whose gadgets lived in the web folder) gets every built-in one;
    //    otherwise only those you have are updated, and new ones wait on the Gadgets page
    if (!is_dir($gdir)) {
        @mkdir($gdir, 0755, true);
    }
    $auto = $fresh || (!$core && !(glob($gdir . '/*/manifest.json') ?: []));
    foreach (glob($priv . '/catalog/*.zip') ?: [] as $zip) {
        $m = hbp_gadget_manifest($zip);
        if (!$m || !preg_match('/^[a-z][a-z0-9_]{1,19}$/', $m['type']) || basename($zip, '.zip') !== $m['type']) {
            continue;
        }
        $type = $m['type'];
        $curFile = $gdir . '/' . $type . '/manifest.json';
        $cur = is_file($curFile) ? json_decode((string) file_get_contents($curFile), true) : null;
        $have = is_array($cur);
        if ($have ? version_compare((string) ($m['version'] ?? '1.0.0'), (string) ($cur['version'] ?? '0'), '<=') : !$auto) {
            if (!$have) {
                $report['available'][] = $type;
            }
            continue;
        }
        $prep = $gdir . '/.stage-pkg-' . $type . '-' . bin2hex(random_bytes(4));
        try {
            hbp_unpack_gadget($zip, $prep);
            hbp_swap_in($prep, $gdir . '/' . $type);
            $report[$have ? 'updated' : 'installed'][] = $type;
        } catch (Throwable $e) {
            hbp_rrmdir($prep);
            $report['notes'][] = 'The ' . $type . ' gadget could not be ' . ($have ? 'updated' : 'installed') . ': ' . $e->getMessage();
        }
    }

    // 5. remember what was installed (to clean up after the next update)
    ksort($hashes);
    hbp_put($priv . '/core.json', (string) json_encode(['version' => $report['to'], 'at' => gmdate('Y-m-d\TH:i:s\Z'), 'web' => $hashes, 'state' => $state],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    if (function_exists('opcache_reset')) {
        @opcache_reset();
    }
    return $report;
}
