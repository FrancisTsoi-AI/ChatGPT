<?php
declare(strict_types=1);

/**
 * The Gadgets page, like WordPress plug-ins: install or update a gadget from a .zip, switch one off or
 * on, download one as a .zip, delete one. Owner only, and every write needs the CSRF token.
 *
 * Installing runs someone else's code with your rights (its script inside your page, its server.php
 * on your server), so:
 *   - the zip is checked strictly before anything is written: plain names only (no ../, no hidden
 *     files, no links), known file types only, size caps, PHP files must parse;
 *   - it is unpacked into a hidden staging folder and shown to you first; installing it then needs
 *     your passphrase again (same 5-tries limit as signing in);
 *   - the swap is a rename, so a gadget is either the old version or the new one, never half;
 *   - HB_GADGET_INSTALL=0 in .env switches installing from the web off.
 * Gadget folders sit outside the web folder: their PHP can never be opened directly by a browser.
 */

const HB_GADGET_ZIP_MAX = 20 * 1048576;       // the .zip itself
const HB_GADGET_UNPACKED_MAX = 40 * 1048576;  // everything inside it
const HB_GADGET_FILE_MAX = 10 * 1048576;      // one file inside it
const HB_GADGET_MAX_FILES = 1000;
/** File types a gadget package may contain (plus LICENSE, README, CHANGELOG … without an extension). */
const HB_GADGET_PACKAGE_EXT = ['json', 'js', 'css', 'php', 'md', 'txt', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico',
    'mp3', 'wav', 'ogg', 'm4a', 'woff', 'woff2', 'ttf', 'otf'];

function hb_gadget_install_allowed(): bool
{
    return (string) hb_cfg('HB_GADGET_INSTALL', '1') !== '0';
}

function hb_gadget_dir_writable(): bool
{
    $d = hb_gadgets_dir();
    return is_dir($d) ? is_writable($d) : is_writable(dirname($d));
}

/** [number of files, bytes] in a folder. */
function hb_gadget_dir_size(string $dir): array
{
    $n = 0;
    $bytes = 0;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if ($f->isFile()) {
            $n++;
            $bytes += $f->getSize();
        }
    }
    return [$n, $bytes];
}

/** Delete a folder and everything in it; links are removed, never followed. */
function hb_rrmdir(string $path): void
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
            hb_rrmdir($path . '/' . $f);
        }
    }
    @rmdir($path);
}

/** Leftovers: unconfirmed uploads older than an hour, and replaced or deleted versions. */
function hb_gadget_clean_stages(): void
{
    $base = hb_gadgets_dir();
    foreach (glob($base . '/.stage-*', GLOB_ONLYDIR) ?: [] as $d) {
        if (filemtime($d) < time() - 3600) {
            hb_rrmdir($d);
        }
    }
    foreach (array_merge(glob($base . '/.old-*') ?: [], glob($base . '/.del-*') ?: []) as $d) {
        hb_rrmdir($d);
    }
}

function hb_gadget_tile_counts(): array
{
    $out = [];
    foreach (hb_q('SELECT type, COUNT(*) c FROM tiles WHERE deleted_at IS NULL GROUP BY type')->fetchAll() as $r) {
        $out[(string) $r['type']] = (int) $r['c'];
    }
    return $out;
}

/** Everything the Gadgets page shows. */
function hb_gadget_admin_list(): array
{
    $counts = hb_gadget_tile_counts();
    $list = [];
    foreach (hb_gadget_all() as $type => $m) {
        [$files, $bytes] = hb_gadget_dir_size($m['_dir']);
        $list[] = [
            'type' => $type, 'label' => $m['label'], 'icon' => $m['icon'], 'version' => $m['version'],
            'author' => (string) ($m['author'] ?? ''), 'description' => (string) ($m['description'] ?? ($m['hint'] ?? '')),
            'group' => (string) ($m['group'] ?? ''), 'on' => !$m['_off'], 'server' => $m['_server'],
            'tiles' => $counts[$type] ?? 0, 'files' => $files, 'bytes' => $bytes,
        ];
        unset($counts[$type]);
    }
    $missing = []; // tiles whose gadget is no longer installed
    foreach ($counts as $type => $n) {
        $missing[] = ['type' => $type, 'tiles' => $n];
    }
    return [
        'gadgets' => $list, 'missing' => $missing, 'version' => HB_VERSION,
        'install' => hb_gadget_install_allowed(), 'writable' => hb_gadget_dir_writable(), 'zip' => class_exists('ZipArchive'),
        'max_mb' => (int) (HB_GADGET_ZIP_MAX / 1048576),
    ];
}

// ---- install / update ----------------------------------------------------------------------------

/** Step 1: receive a .zip, check it, unpack it into a staging folder, and describe it. Nothing is live yet. */
function hb_gadget_upload(): array
{
    if (!hb_gadget_install_allowed()) {
        throw new HttpError(403, 'Installing gadgets from the web is switched off (HB_GADGET_INSTALL=0 in .env). Upload the gadget folder by FTP instead.');
    }
    if (!class_exists('ZipArchive')) {
        throw new HttpError(500, 'This server has no PHP "zip" extension. Ask your host to enable it, or upload the unzipped gadget folder by FTP into homebase-private/gadgets/.');
    }
    $base = hb_gadgets_dir();
    if (!is_dir($base)) {
        @mkdir($base, 0755, true);
    }
    if (!is_dir($base) || !is_writable($base)) {
        throw new HttpError(409, 'The folder homebase-private/gadgets cannot be written by PHP. Make it writable (permissions 755 or 775), or upload the gadget folder by FTP.');
    }
    $f = $_FILES['file'] ?? null;
    $err = is_array($f) ? (int) ($f['error'] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE;
    if ($err !== UPLOAD_ERR_OK) {
        throw new HttpError(in_array($err, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 413 : 400,
            $err === UPLOAD_ERR_NO_FILE ? 'Choose a gadget .zip file' : 'The upload failed (PHP upload error ' . $err . ')');
    }
    if ((int) $f['size'] > HB_GADGET_ZIP_MAX) {
        throw new HttpError(413, 'A gadget .zip may be at most ' . (HB_GADGET_ZIP_MAX / 1048576) . ' MB');
    }
    hb_gadget_clean_stages();
    $token = bin2hex(random_bytes(12));
    $stage = $base . '/.stage-' . $token;
    try {
        $m = hb_gadget_unpack((string) $f['tmp_name'], $stage);
    } catch (Throwable $e) {
        hb_rrmdir($stage);
        throw $e;
    }
    $_SESSION['gadget_stage'][$token] = ['type' => $m['type'], 'at' => time()];
    return ['token' => $token, 'preview' => hb_gadget_preview($m, $stage)];
}

/** Check every entry of the zip, then write the files into $dest. Returns the manifest. */
function hb_gadget_unpack(string $zipFile, string $dest): array
{
    $za = new ZipArchive();
    if ($za->open($zipFile) !== true) {
        throw new HttpError(400, 'That file is not a valid .zip');
    }
    try {
        $entries = [];
        $total = 0;
        for ($i = 0; $i < $za->numFiles; $i++) {
            $st = $za->statIndex($i);
            if ($st === false) {
                throw new HttpError(400, 'The zip is damaged');
            }
            $name = (string) $st['name'];
            if (str_starts_with($name, '__MACOSX/') || preg_match('#(^|/)(\.DS_Store|Thumbs\.db|desktop\.ini)$#i', $name)) {
                continue; // junk some zip tools add
            }
            $plain = rtrim($name, '/');
            if (!preg_match('#^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$#', $plain) || preg_match('#(^|/)\.#', $plain)) {
                throw new HttpError(400, 'Not allowed in a gadget: "' . mb_substr($name, 0, 80) . '" (use plain file names: no hidden files, spaces or ../ paths)');
            }
            if (str_ends_with($name, '/')) {
                continue; // a folder entry
            }
            if ((int) ($st['encryption_method'] ?? 0) !== 0) {
                throw new HttpError(400, 'Password-protected zips are not supported');
            }
            $opsys = 0;
            $attr = 0;
            if ($za->getExternalAttributesIndex($i, $opsys, $attr) && $opsys === ZipArchive::OPSYS_UNIX && (($attr >> 16) & 0170000) === 0120000) {
                throw new HttpError(400, 'The zip contains a link ("' . $name . '"); links are not allowed');
            }
            $size = (int) $st['size'];
            if ($size > HB_GADGET_FILE_MAX) {
                throw new HttpError(400, '"' . $name . '" is larger than ' . (HB_GADGET_FILE_MAX / 1048576) . ' MB');
            }
            $total += $size;
            if ($total > HB_GADGET_UNPACKED_MAX) {
                throw new HttpError(400, 'Unpacked, the gadget would be larger than ' . (HB_GADGET_UNPACKED_MAX / 1048576) . ' MB');
            }
            $entries[] = [$i, $name, $size];
            if (count($entries) > HB_GADGET_MAX_FILES) {
                throw new HttpError(400, 'A gadget may hold at most ' . HB_GADGET_MAX_FILES . ' files');
            }
        }
        if (!$entries) {
            throw new HttpError(400, 'The zip is empty');
        }
        // most zips hold one folder (pomodoro/…): look inside it
        $top = explode('/', $entries[0][1])[0] . '/';
        $strip = str_contains($entries[0][1], '/') && !array_filter($entries, fn($e) => !str_starts_with($e[1], $top)) ? $top : '';
        $files = [];
        foreach ($entries as [$i, $name, $size]) {
            $rel = substr($name, strlen($strip));
            $base = basename($rel);
            $ext = strtolower(pathinfo($rel, PATHINFO_EXTENSION));
            $ok = str_contains($base, '.') ? in_array($ext, HB_GADGET_PACKAGE_EXT, true) : (bool) preg_match('/^(LICEN[CS]E|README|CHANGELOG|NOTICE|AUTHORS)$/i', $base);
            if (!$ok) {
                throw new HttpError(400, 'Not allowed in a gadget: "' . $rel . '" (this type of file)');
            }
            if (isset($files[strtolower($rel)])) {
                throw new HttpError(400, 'The zip holds "' . $rel . '" twice');
            }
            $files[strtolower($rel)] = [$i, $rel, $size];
        }
        if (($files['manifest.json'][1] ?? '') !== 'manifest.json') {
            throw new HttpError(400, 'manifest.json is missing (it must be at the top of the zip, or inside its one folder)');
        }
        if (($files['gadget.js'][1] ?? '') !== 'gadget.js') {
            throw new HttpError(400, 'gadget.js is missing (next to manifest.json)');
        }
        $m = json_decode((string) $za->getFromIndex($files['manifest.json'][0]), true);
        if (($p = hb_gadget_manifest_problem($m)) !== null) {
            throw new HttpError(400, $p);
        }
        foreach ((array) ($m['entryKinds'] ?? []) as $k) {
            $owner = hb_entry_tile()[$k] ?? null;
            if ($owner !== null && $owner !== $m['type']) {
                throw new HttpError(400, 'Its data kind "' . $k . '" already belongs to the "' . $owner . '" gadget');
            }
        }
        if (!@mkdir($dest, 0755, true) && !is_dir($dest)) {
            throw new HttpError(500, 'Could not create a staging folder in homebase-private/gadgets');
        }
        foreach ($files as [$i, $rel, $size]) {
            $data = $size > 0 ? $za->getFromIndex($i, $size) : '';
            if (!is_string($data) || strlen($data) !== $size) {
                throw new HttpError(400, 'The zip is damaged ("' . $rel . '")');
            }
            if (str_ends_with(strtolower($rel), '.php')) {
                try {
                    token_get_all($data, TOKEN_PARSE);
                } catch (ParseError $e) {
                    throw new HttpError(400, '"' . $rel . '" has a PHP error on line ' . $e->getLine() . ': ' . $e->getMessage());
                }
            }
            $path = $dest . '/' . $rel;
            if (!is_dir(dirname($path)) && !@mkdir(dirname($path), 0755, true)) {
                throw new HttpError(500, 'Could not write the gadget files');
            }
            if (file_put_contents($path, $data) === false) {
                throw new HttpError(500, 'Could not write the gadget files');
            }
        }
        return $m;
    } finally {
        $za->close();
    }
}

/** What the confirm dialog shows about a staged gadget. */
function hb_gadget_preview(array $m, string $dir): array
{
    $cur = hb_gadget_all()[$m['type']] ?? null;
    [$files, $bytes] = hb_gadget_dir_size($dir);
    $server = is_file($dir . '/server.php');
    $notes = [];
    if ($server) {
        $notes[] = 'It includes server code (server.php) that runs on your web server and can reach all your Home Base data.';
    }
    if ($cur && version_compare((string) ($m['version'] ?? '0'), $cur['version'], '<')) {
        $notes[] = 'This is an OLDER version than the one installed (' . $cur['version'] . ').';
    }
    return [
        'type' => $m['type'], 'label' => $m['label'], 'icon' => $m['icon'], 'version' => (string) ($m['version'] ?? '1.0.0'),
        'author' => (string) ($m['author'] ?? ''), 'description' => (string) ($m['description'] ?? ($m['hint'] ?? '')),
        'server' => $server, 'files' => $files, 'bytes' => $bytes, 'tiles' => hb_gadget_tile_counts()[$m['type']] ?? 0,
        'current' => $cur ? ['version' => $cur['version'], 'on' => !$cur['_off']] : null, 'notes' => $notes,
    ];
}

/** Step 2: the owner confirmed with the passphrase; put the staged folder in place (replacing an older one). */
function hb_gadget_install(array $in): array
{
    if (!hb_gadget_install_allowed()) {
        throw new HttpError(403, 'Installing gadgets from the web is switched off (HB_GADGET_INSTALL=0 in .env)');
    }
    $token = (string) ($in['token'] ?? '');
    $staged = $_SESSION['gadget_stage'][$token] ?? null;
    $stage = hb_gadgets_dir() . '/.stage-' . $token;
    if (!preg_match('/^[a-f0-9]{24}$/', $token) || !is_array($staged) || $staged['at'] < time() - 3600 || !is_dir($stage)) {
        throw new HttpError(410, 'That upload has expired. Drop the zip again.');
    }
    hb_reauth((string) ($in['passphrase'] ?? ''));
    $m = json_decode((string) @file_get_contents($stage . '/manifest.json'), true);
    if (hb_gadget_manifest_problem($m) !== null || $m['type'] !== $staged['type']) {
        throw new HttpError(400, 'The staged gadget changed. Drop the zip again.');
    }
    $type = $m['type'];
    $target = hb_gadgets_dir() . '/' . $type;
    $old = null;
    if (file_exists($target) || is_link($target)) {
        $old = hb_gadgets_dir() . '/.old-' . $type . '-' . bin2hex(random_bytes(4));
        if (!@rename($target, $old)) {
            throw new HttpError(500, 'Could not replace the installed version (is homebase-private/gadgets/' . $type . ' writable?)');
        }
    }
    if (!@rename($stage, $target)) {
        if ($old !== null) {
            @rename($old, $target);
        }
        throw new HttpError(500, 'Could not move the gadget into place');
    }
    unset($_SESSION['gadget_stage'][$token]);
    if ($old !== null) {
        hb_rrmdir($old);
    }
    hb_gadget_reset();
    return ['ok' => true, 'type' => $type, 'updated' => $old !== null, 'version' => (string) ($m['version'] ?? '1.0.0')];
}

// ---- switch, delete, download --------------------------------------------------------------------

function hb_gadget_switch(array $in): array
{
    $type = (string) ($in['type'] ?? '');
    if (!isset(hb_gadget_all()[$type])) {
        throw new HttpError(404, 'That gadget is not installed');
    }
    $off = hb_gadget_off_list();
    hb_gadget_save_off_list(!empty($in['on']) ? array_diff($off, [$type]) : array_merge($off, [$type]));
    return ['ok' => true];
}

/** Remove a gadget's folder; optionally move all its tiles (with their content) to the trash. */
function hb_gadget_delete(array $in): array
{
    $type = (string) ($in['type'] ?? '');
    if (!preg_match(HB_GADGET_TYPE_RE, $type)) {
        throw new HttpError(400, 'Unknown gadget');
    }
    $dir = hb_gadgets_dir() . '/' . $type;
    $exists = is_dir($dir) || is_link($dir);
    $trash = !empty($in['trash_tiles']);
    if (!$exists && !$trash) {
        throw new HttpError(404, 'That gadget is not installed');
    }
    if ($exists) {
        if (!hb_gadget_dir_writable()) {
            throw new HttpError(409, 'The folder homebase-private/gadgets cannot be written by PHP. Delete the "' . $type . '" folder by FTP instead.');
        }
        $gone = hb_gadgets_dir() . '/.del-' . $type . '-' . bin2hex(random_bytes(4));
        if (is_link($dir)) {
            @unlink($dir);
        } elseif (!@rename($dir, $gone)) {
            throw new HttpError(500, 'Could not remove homebase-private/gadgets/' . $type);
        }
        hb_rrmdir($gone);
    }
    $tiles = $trash ? hb_q('UPDATE tiles SET deleted_at = UTC_TIMESTAMP() WHERE type = ? AND deleted_at IS NULL', [$type])->rowCount() : 0;
    hb_gadget_save_off_list(array_diff(hb_gadget_off_list(), [$type]));
    return ['ok' => true, 'tiles' => $tiles];
}

/** Send an installed gadget as <type>-<version>.zip (the same format the Gadgets page installs). */
function hb_gadget_export(string $type): void
{
    $m = hb_gadget_all()[$type] ?? null;
    if (!$m) {
        throw new HttpError(404, 'That gadget is not installed');
    }
    if (!class_exists('ZipArchive')) {
        throw new HttpError(500, 'This server has no PHP "zip" extension');
    }
    $tmp = hb_storage('tmp') . '/gadget-' . bin2hex(random_bytes(6)) . '.zip';
    $za = new ZipArchive();
    if ($za->open($tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new HttpError(500, 'Could not build the zip');
    }
    $root = $m['_dir'];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        $rel = str_replace(DIRECTORY_SEPARATOR, '/', substr($f->getPathname(), strlen($root) + 1));
        if ($f->isFile() && !$f->isLink() && !preg_match('#(^|/)\.#', $rel)) {
            $za->addFile($f->getPathname(), $type . '/' . $rel);
        }
    }
    $za->close();
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $type . '-' . preg_replace('/[^0-9A-Za-z.+-]/', '', $m['version']) . '.zip"');
    header('Content-Length: ' . (string) filesize($tmp));
    readfile($tmp);
    @unlink($tmp);
    exit;
}
