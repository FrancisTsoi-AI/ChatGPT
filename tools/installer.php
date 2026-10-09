<?php
declare(strict_types=1);

/**
 * Home Base: the one-file installer (dist/homebase-setup.php).
 *
 * tools/build-zip.py builds it from this program + private/src/package.php, and appends the whole Home Base
 * package after __halt_compiler() (ZipArchive opens this very file). Like installing WordPress, but in one file:
 *
 *   Upload homebase-setup.php into the web folder of the (sub)domain and open it in the browser.
 *   - A new site: it checks the host, asks for the database and a passphrase, puts the web files here and
 *     the private folder next to this one (homebase-private, outside the web), creates the tables, adds
 *     every built-in gadget, and deletes itself.
 *   - A site that already runs Home Base: it asks for your passphrase and updates it (the same as dropping
 *     the file on ⋯ → Gadgets & updates). Your data, files, settings and gadgets stay.
 *   For safety it only works for 2 hours after it was uploaded; then it deletes itself.
 */

/*@@PACKAGE@@*/

const HBI_WINDOW = 7200; // seconds (HB_INSTALLER_WINDOW in the environment can shorten it, e.g. for tests)
const HBI_CSS = 'body{margin:0;background:#f1f2f6;color:#1b1f2a;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
    . 'main{max-width:620px;margin:40px auto;background:#fff;border:1px solid #e3e6ee;border-radius:16px;padding:24px 28px;box-shadow:0 4px 14px rgba(20,25,50,.06)}'
    . 'h1{font-size:22px;margin:0 0 12px}h2{font-size:16px;margin:20px 0 8px}label{display:block;margin:10px 0 4px;font-weight:600;font-size:14px}'
    . 'input{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #cfd4e0;border-radius:9px;font:inherit}'
    . 'button,.btn{display:inline-block;margin-top:16px;background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:10px 18px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}'
    . '.err{background:#fde8e8;color:#991b1b;border-radius:9px;padding:10px 12px}.ok{color:#15803d}.bad{color:#b91c1c}.warn{color:#b45309}'
    . '.muted{color:#6b7385;font-size:13px}ul{padding-left:20px}li{margin:3px 0}.row{display:flex;gap:12px}.row>div{flex:1}'
    . '@media(prefers-color-scheme:dark){body{background:#0e1015;color:#e6e8ef}main{background:#171a21;border-color:#2a2f3a}input{background:#1d212a;color:#e6e8ef;border-color:#2a2f3a}.err{background:#3b1414;color:#fecaca}}';

hbi_main();

function hbi_h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

function hbi_page(string $title, string $body, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="robots" content="noindex, nofollow"><title>' . hbi_h($title) . ' · Home Base</title><style>' . HBI_CSS . '</style></head>'
        . '<body><main><h1>🏠 ' . hbi_h($title) . '</h1>' . $body . '</main></body></html>';
    exit;
}

function hbi_main(): void
{
    header('Cache-Control: no-store');
    header('X-Frame-Options: DENY');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    if (PHP_VERSION_ID < 80000) {
        hbi_page('PHP 8 is needed', '<p>This server runs PHP ' . hbi_h(PHP_VERSION) . '. Home Base needs PHP 8.0 or later. In your hosting panel '
            . '(cPanel: <i>Select PHP Version</i> or <i>MultiPHP Manager</i>) choose 8.0 or newer for this site, then reload this page.</p>', 500);
    }
    if (!class_exists('ZipArchive')) {
        hbi_page('The PHP "zip" extension is needed', '<p>Switch on the <b>zip</b> extension for this site in your hosting panel '
            . '(cPanel: <i>Select PHP Version → Extensions</i>), then reload this page.</p>', 500);
    }
    $self = __FILE__;
    // when the file arrived on this server: ctime cannot be set by an FTP client that keeps old timestamps
    $arrived = max((int) @filemtime($self), (int) @filectime($self));
    $window = (int) (getenv('HB_INSTALLER_WINDOW') ?: HBI_WINDOW);
    if ($arrived < time() - $window) {
        @unlink($self);
        hbi_page('This installer has expired', '<p>For safety it only works for 2 hours after it was uploaded, and it has now removed itself. '
            . 'Upload <b>homebase-setup.php</b> again and open it right away.</p>', 410);
    }
    try {
        $pkg = hbp_open($self);
    } catch (Throwable $e) {
        hbi_page('This file is damaged', '<p>' . hbi_h($e->getMessage()) . '</p><p>Download <b>homebase-setup.php</b> again and upload it once more.</p>', 500);
    }
    $web = __DIR__;
    $priv = hbi_find_private($web);
    if ($priv !== null && (string) (hbi_env($priv)['HB_PASSPHRASE_HASH'] ?? '') !== '') {
        hbi_update($pkg, $web, $priv);
    }
    hbi_install($pkg, $web, $priv);
}

/** The private folder of an existing Home Base, found the same way the app finds it (_boot.php). */
function hbi_find_private(string $web): ?string
{
    $candidates = [(string) ($_SERVER['HB_PRIVATE_DIR'] ?? (getenv('HB_PRIVATE_DIR') ?: ''))];
    if (is_file($web . '/.private-path')) {
        $candidates[] = trim((string) file_get_contents($web . '/.private-path'));
    }
    foreach (['homebase-private', 'private'] as $name) {
        foreach (['/..', '/../..', '/../../..'] as $up) {
            $candidates[] = $web . $up . '/' . $name;
        }
    }
    foreach ($candidates as $d) {
        if ($d !== '' && is_file($d . '/src/bootstrap.php')) {
            return realpath($d) ?: $d;
        }
    }
    return null;
}

/** .env as an array (the same rules as the app: KEY=value, # comments, optional quotes). */
function hbi_env(string $priv): array
{
    $env = [];
    foreach (@file($priv . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
            continue;
        }
        list($k, $v) = explode('=', $line, 2);
        $v = trim($v);
        if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && substr($v, -1) === $v[0]) {
            $v = substr($v, 1, -1);
        }
        $env[trim($k)] = $v;
    }
    return $env;
}

/** Set keys in .env text (replacing their lines, or adding them). */
function hbi_env_set(string $text, array $vals): string
{
    foreach ($vals as $k => $v) {
        $line = $k . "='" . $v . "'";
        $text = preg_match('/^' . preg_quote($k, '/') . '=.*$/m', $text)
            ? (string) preg_replace('/^' . preg_quote($k, '/') . '=.*$/m', str_replace(['\\', '$'], ['\\\\', '\\$'], $line), $text)
            : rtrim($text) . "\n" . $line . "\n";
    }
    return $text;
}

// ---- the same "5 wrong tries, 15 minutes" lock as signing in (shares the app's counter file) ----------

function hbi_rl_file(string $priv): string
{
    $d = $priv . '/storage/ratelimit';
    if (!is_dir($d)) {
        @mkdir($d, 0755, true);
    }
    return $d . '/' . hash('sha256', '|' . ($_SERVER['REMOTE_ADDR'] ?? 'cli')) . '.json';
}

function hbi_rl_read(string $priv): array
{
    $d = json_decode((string) @file_get_contents(hbi_rl_file($priv)), true);
    return is_array($d) ? $d + ['fails' => 0, 'until' => 0] : ['fails' => 0, 'until' => 0];
}

function hbi_rl_write(string $priv, array $d): void
{
    @file_put_contents(hbi_rl_file($priv), json_encode($d), LOCK_EX);
}

// ---- update an existing Home Base ---------------------------------------------------------------------

function hbi_update(array $pkg, string $web, string $priv): void
{
    $from = hbp_installed_version($priv);
    $to = (string) $pkg['info']['version'];
    $err = '';
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && ($_POST['do'] ?? '') === 'update') {
        $rl = hbi_rl_read($priv);
        if ((int) $rl['until'] > time()) {
            $err = 'Too many wrong tries. Try again in ' . (int) ceil(((int) $rl['until'] - time()) / 60) . ' min.';
        } elseif (!password_verify((string) ($_POST['passphrase'] ?? ''), (string) hbi_env($priv)['HB_PASSPHRASE_HASH'])) {
            usleep(400000);
            $rl['fails'] = (int) $rl['fails'] + 1;
            if ($rl['fails'] >= 5) {
                $rl = ['fails' => 0, 'until' => time() + 900];
                $err = 'Too many wrong tries. Locked for 15 minutes.';
            } else {
                $err = 'Wrong passphrase (' . (5 - $rl['fails']) . ' tries left).';
            }
            hbi_rl_write($priv, $rl);
        } else {
            hbi_rl_write($priv, ['fails' => 0, 'until' => 0]);
            $env = hbi_env($priv);
            try {
                $report = hbp_apply($pkg, $web, $priv, ['gadgets' => (string) ($env['HB_GADGETS_DIR'] ?? '') ?: $priv . '/gadgets']);
            } catch (Throwable $e) {
                $err = $e->getMessage();
            }
            if ($err === '') {
                $gone = @unlink(__FILE__);
                hbi_page('Home Base is updated', '<p class="ok">Home Base is now <b>' . hbi_h($to) . '</b>.</p>' . hbi_report($report)
                    . ($gone ? '' : '<p class="warn">Delete <b>homebase-setup.php</b> from your web folder.</p>')
                    . '<a class="btn" href="./">Open Home Base</a>');
            }
        }
    }
    hbi_page('Update Home Base', '<p>Home Base ' . hbi_h($from ?: '(an earlier version)') . ' is installed here. This file updates it to <b>' . hbi_h($to)
        . '</b>. Your tiles, files, settings, share links and the gadgets you added are kept; built-in gadgets you have are updated.</p>'
        . ($err !== '' ? '<p class="err">' . hbi_h($err) . '</p>' : '')
        . '<form method="post"><input type="hidden" name="do" value="update"><label for="p">Your Home Base passphrase</label>'
        . '<input id="p" name="passphrase" type="password" autocomplete="current-password" required autofocus>'
        . '<button type="submit">Update Home Base</button></form>'
        . '<p class="muted">Updating later is easier: drop the new file on ⋯ → Gadgets &amp; updates inside Home Base.</p>');
}

function hbi_report(array $r): string
{
    $out = '<ul>';
    if ($r['installed']) {
        $out .= '<li>' . count($r['installed']) . ' gadgets added: ' . hbi_h(implode(', ', $r['installed'])) . '</li>';
    }
    if ($r['updated']) {
        $out .= '<li>Gadgets updated: ' . hbi_h(implode(', ', $r['updated'])) . '</li>';
    }
    if ($r['available']) {
        $out .= '<li>New built-in gadgets you can add on the Gadgets &amp; updates page: ' . hbi_h(implode(', ', $r['available'])) . '</li>';
    }
    if ($r['removed']) {
        $out .= '<li>' . (int) $r['removed'] . ' old file(s) or folder(s) removed</li>';
    }
    foreach ($r['notes'] as $n) {
        $out .= '<li class="warn">' . hbi_h($n) . '</li>';
    }
    return $out . '</ul>';
}

// ---- install a new Home Base --------------------------------------------------------------------------

/** [label, ok, detail, required] rows for the host check. */
function hbi_checks(string $web, string $priv): array
{
    $rows = [['PHP ' . PHP_VERSION, true, '8.0 or later', true]];
    foreach (['pdo_mysql' => true, 'mbstring' => true, 'json' => true, 'zip' => true, 'fileinfo' => false, 'curl' => false] as $ext => $req) {
        $rows[] = ['PHP extension ' . $ext, extension_loaded($ext), extension_loaded($ext) ? 'on'
            : ($req ? 'missing: switch it on in your hosting panel' : 'missing (optional' . ($ext === 'curl' ? ': news feeds, weather and link titles need it)' : ')')), $req];
    }
    $rows[] = ['This web folder is writable', is_writable($web), is_writable($web) ? $web : 'PHP cannot write here: ask your host (PHP must run as your own user)', true];
    $parent = dirname($priv);
    $privOk = is_dir($priv) ? is_writable($priv) : is_writable($parent);
    $rows[] = ['Private folder (outside the web)', $privOk, $privOk ? $priv : 'PHP cannot create ' . $priv . '. In your hosting file manager, create an empty folder named '
        . basename($priv) . ' in ' . $parent . ', then reload this page.', true];
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $rows[] = ['HTTPS', $https, $https ? 'yes' : 'not detected: turn on SSL for this (sub)domain in your hosting panel (fine for a local test)', false];
    $idx = $web . '/index.php';
    if (is_file($idx) && strpos((string) file_get_contents($idx), 'Home Base') === false) {
        $rows[] = ['Empty web folder', false, 'this folder already holds another site (index.php); Home Base replaces files with the same names', false];
    }
    return $rows;
}

function hbi_install(array $pkg, string $web, ?string $found): void
{
    $priv = $found ?? dirname($web) . '/homebase-private';
    $checks = hbi_checks($web, $priv);
    $blocked = false;
    foreach ($checks as $c) {
        $blocked = $blocked || ($c[3] && !$c[1]);
    }
    $env = $found ? hbi_env($found) : [];
    $post = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && ($_POST['do'] ?? '') === 'install';
    $v = [];
    foreach (['db_host' => ['DB_HOST', 'localhost'], 'db_port' => ['DB_PORT', '3306'], 'db_name' => ['DB_NAME', ''], 'db_user' => ['DB_USER', '']] as $k => $d) {
        $v[$k] = trim((string) ($post ? ($_POST[$k] ?? '') : ($env[$d[0]] ?? $d[1])));
    }
    $err = '';
    if ($post && !$blocked) {
        $dbPass = (string) ($_POST['db_pass'] ?? '');
        $p1 = (string) ($_POST['p1'] ?? '');
        $p2 = (string) ($_POST['p2'] ?? '');
        $all = implode('', $v) . $dbPass . $p1;
        if ($v['db_name'] === '' || $v['db_user'] === '' || $v['db_host'] === '') {
            $err = 'Fill in the database name, user and host.';
        } elseif (preg_match('/[\r\n\0]/', $all)) {
            $err = 'Line breaks are not supported in these fields.';
        } elseif (strlen($p1) < 10 || $p1 !== $p2) {
            $err = 'The passphrase needs at least 10 characters (a few random words is best), typed the same twice.';
        } else {
            try {
                $pdo = new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $v['db_host'], (int) $v['db_port'], $v['db_name']),
                    $v['db_user'], $dbPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 8]);
            } catch (Throwable $e) {
                $err = 'Could not connect to the database: ' . $e->getMessage();
            }
        }
        if ($err === '') {
            try {
                if (!is_dir($priv) && !@mkdir($priv, 0755, true)) {
                    throw new HbpError('Could not create ' . $priv);
                }
                $report = hbp_apply($pkg, $web, $priv, ['fresh' => true, 'gadgets' => $priv . '/gadgets']);
                $text = is_file($priv . '/.env') ? (string) file_get_contents($priv . '/.env') : (string) @file_get_contents($priv . '/.env.example');
                $text = hbi_env_set($text, ['DB_HOST' => $v['db_host'], 'DB_PORT' => (string) (int) $v['db_port'], 'DB_NAME' => $v['db_name'],
                    'DB_USER' => $v['db_user'], 'DB_PASS' => $dbPass, 'HB_PASSPHRASE_HASH' => password_hash($p1, PASSWORD_DEFAULT)]);
                if (@file_put_contents($priv . '/.env', $text) === false) {
                    throw new HbpError('Could not write ' . $priv . '/.env');
                }
                @chmod($priv . '/.env', 0600);
                $pdo->exec("SET time_zone = '+00:00'");
                $sql = (string) preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($priv . '/schema.sql'));
                foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
                    $pdo->exec($stmt);
                }
                hbi_selfcheck($web, $priv, $report);
            } catch (Throwable $e) {
                $err = $e->getMessage();
            }
        }
        if ($err === '') {
            $gone = @unlink(__FILE__);
            hbi_page('Home Base is installed', '<p class="ok">Home Base <b>' . hbi_h((string) $pkg['info']['version']) . '</b> is ready.</p>' . hbi_report($report)
                . '<p>Sign in with the passphrase you just chose. Gadgets, updates and everything else are managed inside Home Base from now on '
                . '(⋯ → Gadgets &amp; updates).</p>'
                . ($gone ? '' : '<p class="warn">Delete <b>homebase-setup.php</b> from your web folder.</p>')
                . '<a class="btn" href="./">Open Home Base</a>');
        }
    }
    $rows = '';
    foreach ($checks as $c) {
        $rows .= '<li><span class="' . ($c[1] ? 'ok">✓' : ($c[3] ? 'bad">✗' : 'warn">!')) . '</span> <b>' . hbi_h($c[0]) . '</b> <span class="muted">' . hbi_h($c[2]) . '</span></li>';
    }
    $field = function (string $name, string $label, string $type = 'text', string $value = '', string $extra = ''): string {
        return '<label for="' . $name . '">' . $label . '</label><input id="' . $name . '" name="' . $name . '" type="' . $type . '" value="' . hbi_h($value) . '" ' . $extra . '>';
    };
    hbi_page('Install Home Base ' . (string) $pkg['info']['version'],
        '<p>This puts Home Base on this site: the web files here, and its private folder (your settings, data files and gadgets) at <b>'
        . hbi_h($priv) . '</b>, outside the web.</p><h2>Your host</h2><ul>' . $rows . '</ul>'
        . ($blocked ? '<p class="err">Fix the items marked ✗ above, then reload this page.</p>'
            : ($err !== '' ? '<p class="err">' . hbi_h($err) . '</p>' : '')
            . '<form method="post" autocomplete="off"><input type="hidden" name="do" value="install">'
            . '<h2>Database</h2><p class="muted">Create an empty MySQL / MariaDB database and a user with all rights on it in your hosting panel '
            . '(cPanel: <i>MySQL Databases</i>), then fill them in.</p>'
            . '<div class="row"><div>' . $field('db_host', 'Host', 'text', $v['db_host'], 'required') . '</div><div style="flex:.4">' . $field('db_port', 'Port', 'number', $v['db_port']) . '</div></div>'
            . $field('db_name', 'Database name', 'text', $v['db_name'], 'required') . $field('db_user', 'Database user', 'text', $v['db_user'], 'required')
            . $field('db_pass', 'Database password', 'password', '', 'autocomplete="new-password"')
            . '<h2>Your passphrase</h2><p class="muted">The one key to Home Base: 10 characters or more; a few random words are best.</p>'
            . $field('p1', 'Passphrase', 'password', '', 'required minlength="10" autocomplete="new-password"')
            . $field('p2', 'The same again', 'password', '', 'required minlength="10" autocomplete="new-password"')
            . '<button type="submit">Install Home Base</button></form>'));
}

/**
 * Some hosts refuse a line of the .htaccess ("Options -Indexes") with "500 Internal Server Error".
 * Ask the new site for its page; if it answers 500, leave that line out and remember it for updates.
 */
function hbi_selfcheck(string $web, string $priv, array &$report): void
{
    if (PHP_SAPI === 'cli-server' || !ini_get('allow_url_fopen') || empty($_SERVER['HTTP_HOST'])) {
        return;
    }
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $url = ($https ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/'))), '/') . '/index.php';
    $status = function () use ($url): int {
        $ctx = stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 6]]);
        @file_get_contents($url, false, $ctx);
        $line = isset($http_response_header[0]) ? (string) $http_response_header[0] : '';
        return preg_match('/\s(\d{3})\s/', $line . ' ', $m) ? (int) $m[1] : 0;
    };
    $ht = $web . '/.htaccess';
    if ($status() !== 500 || !is_file($ht) || strpos((string) file_get_contents($ht), 'Options -Indexes') === false) {
        return;
    }
    $new = (string) preg_replace('/^Options -Indexes\R/m', '', (string) file_get_contents($ht));
    file_put_contents($ht, $new);
    $core = hbp_core_state($priv);
    if ($core) {
        $core['state']['htaccess_no_options'] = true;
        $core['web']['.htaccess'] = sha1($new);
        file_put_contents($priv . '/core.json', (string) json_encode($core, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }
    $report['notes'][] = 'Your host does not allow "Options -Indexes" in .htaccess, so that line was left out.';
}

__halt_compiler();