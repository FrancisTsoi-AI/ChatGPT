<?php
declare(strict_types=1);

const HB_SESSION_NAME = 'hb_sess';

function hb_session_days(): int
{
    return max(1, (int) hb_cfg('HB_SESSION_DAYS', 90));
}

/** Start the (file-based, long-lived) session. Cookie is re-sent on every request so 90 days counts from last use. */
function hb_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $life = hb_session_days() * 86400;
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string) $life);
    session_save_path(hb_storage('sessions'));
    session_name(HB_SESSION_NAME);
    $cookie = [
        'lifetime' => $life,
        'path' => '/',
        'secure' => hb_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ];
    session_set_cookie_params($cookie);
    session_start();
    // Refresh expiry on every use.
    hb_send_session_cookie($life);
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
    }
}

function hb_send_session_cookie(int $life): void
{
    setcookie(HB_SESSION_NAME, session_id(), [
        'expires' => time() + $life, 'path' => '/', 'secure' => hb_is_https(),
        'httponly' => true, 'samesite' => 'Lax',
    ]);
}

/**
 * Signed in = this session logged in AND it belongs to the current "epoch". "Sign out on all devices"
 * starts a new epoch, so every older session stops working at once (settings key _auth_epoch).
 */
function hb_auth_epoch(): string
{
    static $epoch = null;
    if ($epoch !== null) {
        return $epoch;
    }
    try {
        $r = hb_q("SELECT `value` FROM settings WHERE `key` = '_auth_epoch'")->fetch();
        $epoch = $r ? (string) $r['value'] : '0';
    } catch (Throwable $e) {
        $epoch = '0'; // database not set up yet
    }
    return $epoch;
}

function hb_is_authed(): bool
{
    return !empty($_SESSION['authed']) && (string) ($_SESSION['epoch'] ?? '0') === hb_auth_epoch();
}

/** Invalidate every signed-in device; optionally keep this one. */
function hb_logout_all(bool $keepThis): void
{
    $new = bin2hex(random_bytes(8));
    hb_q("INSERT INTO settings (`key`, `value`) VALUES ('_auth_epoch', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)", [$new]);
    $mine = session_id();
    // the new epoch already locks every other sign-in out; also free their session files, but keep the
    // ones that only hold share-link unlocks (visitors are managed per link: new password or switch off)
    foreach (glob(hb_storage('sessions') . '/sess_*') ?: [] as $f) {
        $c = (string) @file_get_contents($f);
        if (basename($f) !== 'sess_' . $mine && (str_contains($c, 'authed|b:1') || str_contains($c, 's:6:"authed";b:1'))) {
            @unlink($f);
        }
    }
    if ($keepThis) {
        $_SESSION['epoch'] = $new;
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
        hb_send_session_cookie(hb_session_days() * 86400);
    } else {
        hb_logout();
    }
}

function hb_csrf(): string
{
    return (string) ($_SESSION['csrf'] ?? '');
}

function hb_require_auth(): void
{
    if (!hb_is_authed()) {
        throw new HttpError(401, 'Not signed in');
    }
}

function hb_require_csrf(): void
{
    $sent = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($sent === '' || !hash_equals(hb_csrf(), $sent)) {
        throw new HttpError(403, 'Bad or missing CSRF token. Reload the page.');
    }
}

// ---- rate limit (per client IP, kept in private/storage/ratelimit) -------------------------

/** $bucket separates counters: '' = owner sign-in, 'share:<slug>' = one share link's password. */
function hb_rl_file(string $bucket = ''): string
{
    return hb_storage('ratelimit') . '/' . hash('sha256', $bucket . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'cli')) . '.json';
}

function hb_rl_read(string $bucket = ''): array
{
    $f = hb_rl_file($bucket);
    $d = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    return is_array($d) ? $d + ['fails' => 0, 'until' => 0] : ['fails' => 0, 'until' => 0];
}

function hb_rl_write(array $d, string $bucket = ''): void
{
    file_put_contents(hb_rl_file($bucket), json_encode($d), LOCK_EX);
}

/** Seconds the client is still locked out (0 = free to try). */
function hb_rl_wait(string $bucket = ''): int
{
    return max(0, (int) hb_rl_read($bucket)['until'] - time());
}

/**
 * Check the owner's passphrase, with the sign-in limit (5 wrong tries → 15 min pause, per address).
 * $wrongStatus: 401 on the sign-in page; 403 when asking again inside the app (a 401 would reload it).
 */
function hb_check_passphrase(string $passphrase, int $wrongStatus = 401): void
{
    $wait = hb_rl_wait();
    if ($wait > 0) {
        throw new HttpError(429, 'Too many wrong tries. Try again in ' . (int) ceil($wait / 60) . ' min.', ['retry_after' => $wait]);
    }
    $hash = (string) hb_cfg('HB_PASSPHRASE_HASH', '');
    if ($hash === '') {
        throw new HttpError(500, 'No passphrase is set. Run hash-passphrase and put the result in private/.env');
    }
    if ($passphrase !== '' && password_verify($passphrase, $hash)) {
        hb_rl_write(['fails' => 0, 'until' => 0]);
        return;
    }
    usleep(400000); // slow down guessing
    $d = hb_rl_read();
    $d['fails']++;
    $max = max(1, (int) hb_cfg('HB_LOGIN_MAX_TRIES', 5));
    if ($d['fails'] >= $max) {
        $d = ['fails' => 0, 'until' => time() + max(1, (int) hb_cfg('HB_LOGIN_PAUSE_MIN', 15)) * 60];
        hb_rl_write($d);
        throw new HttpError(429, 'Too many wrong tries. Locked for ' . (int) hb_cfg('HB_LOGIN_PAUSE_MIN', 15) . ' minutes.', ['retry_after' => $d['until'] - time()]);
    }
    hb_rl_write($d);
    throw new HttpError($wrongStatus, 'Wrong passphrase (' . ($max - $d['fails']) . ' tries left)');
}

function hb_login(string $passphrase): void
{
    hb_check_passphrase($passphrase, 401);
    hb_housekeeping();
    session_regenerate_id(true);
    $_SESSION['authed'] = true;
    $_SESSION['epoch'] = hb_auth_epoch();
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    hb_send_session_cookie(hb_session_days() * 86400);
}

/** Ask a signed-in owner for the passphrase again before something powerful (installing code). */
function hb_reauth(string $passphrase): void
{
    hb_check_passphrase($passphrase, 403);
}

/** Remove expired session files and stale rate-limit records (runs on each successful sign-in). */
function hb_housekeeping(): void
{
    $life = hb_session_days() * 86400;
    foreach (glob(hb_storage('sessions') . '/sess_*') ?: [] as $f) {
        if (@filemtime($f) < time() - $life) {
            @unlink($f);
        }
    }
    foreach (glob(hb_storage('ratelimit') . '/*.json') ?: [] as $f) {
        if (@filemtime($f) < time() - 86400) {
            @unlink($f);
        }
    }
}

function hb_logout(): void
{
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
    setcookie(HB_SESSION_NAME, '', ['expires' => 1, 'path' => '/']);
}
