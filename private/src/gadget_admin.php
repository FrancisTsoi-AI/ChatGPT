<?php
declare(strict_types=1);

/**
 * The Gadgets & updates page, like WordPress's Plugins and Updates screens: install or update a gadget
 * from a .zip, add built-in gadgets from the catalog with one click, switch one off or on, download one
 * as a .zip, delete one, and update Home Base itself by dropping its one file (homebase.zip or
 * homebase-setup.php, see package.php). Owner only, and every write needs the CSRF token.
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
    hbp_rrmdir($path);
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
    foreach (glob(hb_storage('tmp') . '/core-*.zip') ?: [] as $f) { // Home Base updates dropped but not confirmed
        if (filemtime($f) < time() - 3600) {
            @unlink($f);
        }
    }
}

// ---- the catalog: built-in gadgets shipped with Home Base (homebase-private/catalog/<type>.zip) ----

/** type => ['file' => zip path, 'm' => manifest] for every gadget in the catalog. */
function hb_gadget_catalog(): array
{
    $out = [];
    foreach (glob(HB_PRIVATE . '/catalog/*.zip') ?: [] as $f) {
        $m = hbp_gadget_manifest($f);
        if ($m && preg_match(HB_GADGET_TYPE_RE, $m['type']) && basename($f, '.zip') === $m['type'] && hb_gadget_manifest_problem($m) === null) {
            $out[$m['type']] = ['file' => $f, 'm' => $m];
        }
    }
    return $out;
}

/** Put a checked, staged gadget folder in place (replacing an older version). True if it was an update. */
function hb_gadget_place(string $stage, string $type): bool
{
    try {
        $updated = hbp_swap_in($stage, hb_gadgets_dir() . '/' . $type);
    } catch (HbpError $e) {
        throw new HttpError(500, $e->getMessage() . ' (is homebase-private/gadgets writable?)');
    }
    hb_gadget_reset();
    return $updated;
}

/** Install a built-in gadget from the catalog, or update it to the catalog's version (one click, no zip). */
function hb_gadget_from_catalog(array $in): array
{
    $type = (string) ($in['type'] ?? '');
    $c = hb_gadget_catalog()[$type] ?? null;
    if (!$c) {
        throw new HttpError(404, 'That gadget is not in the catalog');
    }
    if (!hb_gadget_dir_writable()) {
        throw new HttpError(409, 'The folder homebase-private/gadgets cannot be written by PHP. Make it writable (permissions 755 or 775).');
    }
    hb_gadget_clean_stages();
    $stage = hb_gadgets_dir() . '/.stage-' . bin2hex(random_bytes(12));
    try {
        $m = hb_gadget_unpack($c['file'], $stage); // the same checks as an uploaded zip
    } catch (Throwable $e) {
        hb_rrmdir($stage);
        throw $e;
    }
    $updated = hb_gadget_place($stage, $type);
    return ['ok' => true, 'type' => $type, 'updated' => $updated, 'version' => (string) ($m['version'] ?? '1.0.0')];
}

// ---- Home Base itself: the same drop box takes homebase.zip / homebase-setup.php ---------------------

/** Does this zip hold a Home Base package (homebase.json) rather than a gadget? */
function hb_is_core_package(string $file): bool
{
    $za = new ZipArchive();
    if ($za->open($file) !== true) {
        return false;
    }
    $found = false;
    for ($i = 0; $i < min($za->numFiles, 5000) && !$found; $i++) {
        $found = (bool) preg_match('#^([A-Za-z0-9_.-]+/)?homebase\.json$#', (string) $za->getNameIndex($i));
    }
    $za->close();
    return $found;
}

/** The running version: what the last install / update recorded (core.json), else the code's own. */
function hb_core_version(): string
{
    return hbp_installed_version(HB_PRIVATE) ?? HB_VERSION;
}

/** Why Home Base cannot update itself here (null = it can). */
function hb_core_update_problem(): ?string
{
    $pub = hb_public_dir();
    if ($pub === null) {
        return 'The web folder was not found';
    }
    if (is_dir(dirname($pub) . '/.git')) {
        return 'This copy of Home Base runs from a source checkout; update it with git, not here.';
    }
    foreach ([$pub, HB_PRIVATE, HB_PRIVATE . '/src'] as $d) {
        if (!is_writable($d)) {
            return 'PHP cannot write to ' . $d . ', so Home Base cannot update itself. Make the web folder and homebase-private writable (permissions 755).';
        }
    }
    return null;
}

/** Step 1 for an update of Home Base: check the package, keep it aside, describe what will change. */
function hb_core_stage(string $tmp): array
{
    if (($p = hb_core_update_problem()) !== null) {
        throw new HttpError(409, $p);
    }
    try {
        $pkg = hbp_open($tmp);
    } catch (HbpError $e) {
        throw new HttpError(400, $e->getMessage());
    }
    $to = (string) $pkg['info']['version'];
    $installed = hb_gadget_all();
    $catalog = hb_gadget_catalog();
    $updates = [];
    $new = [];
    $probe = hb_storage('tmp') . '/probe-' . bin2hex(random_bytes(6)) . '.zip';
    foreach ($pkg['cat'] as $type => $i) {
        file_put_contents($probe, hbp_read($pkg['za'], $i));
        $m = hbp_gadget_manifest($probe);
        $v = (string) ($m['version'] ?? '1.0.0');
        if (isset($installed[$type])) {
            if (version_compare($v, $installed[$type]['version'], '>')) {
                $updates[] = ['type' => $type, 'label' => (string) ($m['label'] ?? $type), 'from' => $installed[$type]['version'], 'to' => $v];
            }
        } elseif (!isset($catalog[$type])) {
            $new[] = ['type' => $type, 'label' => (string) ($m['label'] ?? $type), 'icon' => (string) ($m['icon'] ?? ''), 'version' => $v];
        }
    }
    @unlink($probe);
    $pkg['za']->close();
    $token = bin2hex(random_bytes(12));
    if (!@copy($tmp, hb_storage('tmp') . '/core-' . $token . '.zip')) {
        throw new HttpError(500, 'Could not keep the update file in homebase-private/storage/tmp');
    }
    $_SESSION['gadget_stage'][$token] = ['kind' => 'core', 'type' => 'homebase', 'at' => time()];
    $notes = ['Home Base\'s program files are replaced. Your tiles, files, settings, share links and the gadgets you added are kept.'];
    $running = hb_core_version();
    if (version_compare($to, $running, '<')) {
        $notes[] = 'This is an OLDER version than the one running (' . $running . ').';
    } elseif (version_compare($to, $running, '==')) {
        $notes[] = 'This is the version already running; installing it again repairs the program files.';
    }
    return ['token' => $token, 'preview' => [
        'kind' => 'core', 'type' => 'homebase', 'label' => 'Home Base', 'icon' => '🏠', 'version' => $to, 'author' => 'Home Base',
        'description' => 'The platform itself: page, gateway and the built-in gadget catalog.', 'server' => true,
        'files' => count($pkg['web']) + count($pkg['priv']) + count($pkg['cat']), 'bytes' => (int) filesize($tmp), 'tiles' => 0,
        'current' => ['version' => $running, 'on' => true], 'updates' => $updates, 'new' => $new, 'notes' => $notes,
    ]];
}

/** Step 2 for an update of Home Base: apply the kept package (see hbp_apply: journaled, rolled back on failure). */
function hb_core_install(string $token): array
{
    $file = hb_storage('tmp') . '/core-' . $token . '.zip';
    if (!is_file($file)) {
        throw new HttpError(410, 'That upload has expired. Drop the file again.');
    }
    if (($p = hb_core_update_problem()) !== null) {
        throw new HttpError(409, $p);
    }
    try {
        $pkg = hbp_open($file);
        try {
            $report = hbp_apply($pkg, (string) hb_public_dir(), HB_PRIVATE, ['gadgets' => hb_gadgets_dir()]);
        } finally {
            $pkg['za']->close();
        }
    } catch (HbpError $e) {
        throw new HttpError(500, $e->getMessage());
    } finally {
        @unlink($file);
        unset($_SESSION['gadget_stage'][$token]);
    }
    hb_gadget_reset();
    return ['ok' => true, 'core' => true, 'type' => 'homebase', 'version' => $report['to'], 'updated' => true, 'report' => $report];
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
    $catalog = hb_gadget_catalog();
    $all = hb_gadget_all();
    $list = [];
    foreach ($all as $type => $m) {
        [$files, $bytes] = hb_gadget_dir_size($m['_dir']);
        $list[] = [
            'type' => $type, 'label' => $m['label'], 'icon' => $m['icon'], 'version' => $m['version'],
            'author' => (string) ($m['author'] ?? ''), 'description' => (string) ($m['description'] ?? ($m['hint'] ?? '')),
            'group' => (string) ($m['group'] ?? ''), 'on' => !$m['_off'], 'server' => $m['_server'],
            'tiles' => $counts[$type] ?? 0, 'files' => $files, 'bytes' => $bytes,
            'update' => isset($catalog[$type]) && version_compare((string) ($catalog[$type]['m']['version'] ?? '0'), $m['version'], '>')
                ? (string) $catalog[$type]['m']['version'] : null,
        ];
        unset($counts[$type]);
    }
    $available = []; // built-in gadgets you do not have: one click away
    foreach ($catalog as $type => $c) {
        if (!isset($all[$type])) {
            $m = $c['m'];
            $available[] = ['type' => $type, 'label' => (string) $m['label'], 'icon' => (string) $m['icon'], 'version' => (string) ($m['version'] ?? '1.0.0'),
                'description' => (string) ($m['description'] ?? ($m['hint'] ?? '')), 'group' => (string) ($m['group'] ?? '')];
        }
    }
    $missing = []; // tiles whose gadget is no longer installed
    foreach ($counts as $type => $n) {
        $missing[] = ['type' => $type, 'tiles' => $n];
    }
    return [
        'gadgets' => $list, 'available' => $available, 'missing' => $missing, 'version' => hb_core_version(),
        'core_update' => hb_core_update_problem(),
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
    if (hb_is_core_package((string) $f['tmp_name'])) { // homebase.zip or homebase-setup.php: an update of Home Base itself
        return hb_core_stage((string) $f['tmp_name']);
    }
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
    $core = is_array($staged) && ($staged['kind'] ?? '') === 'core';
    if (!preg_match('/^[a-f0-9]{24}$/', $token) || !is_array($staged) || $staged['at'] < time() - 3600 || (!$core && !is_dir($stage))) {
        throw new HttpError(410, 'That upload has expired. Drop the zip again.');
    }
    hb_reauth((string) ($in['passphrase'] ?? ''));
    if ($core) {
        return hb_core_install($token);
    }
    $m = json_decode((string) @file_get_contents($stage . '/manifest.json'), true);
    if (hb_gadget_manifest_problem($m) !== null || $m['type'] !== $staged['type']) {
        throw new HttpError(400, 'The staged gadget changed. Drop the zip again.');
    }
    $type = $m['type'];
    $updated = hb_gadget_place($stage, $type);
    unset($_SESSION['gadget_stage'][$token]);
    return ['ok' => true, 'type' => $type, 'updated' => $updated, 'version' => (string) ($m['version'] ?? '1.0.0')];
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
