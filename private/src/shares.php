<?php
declare(strict_types=1);

/**
 * Read-only share links for one scenario.
 *
 *   Owner      creates a link: a name (the URL, e.g. https://task.francistsoi.com/home), a password,
 *              an expiry (or none) and whether files may be downloaded. Change or switch it off any time.
 *   Visitor    opens the link, types the password (5 wrong tries = 15 min pause), and sees the scenario
 *              live but read-only. Nothing else of Home Base is reachable: every request is checked
 *              against the share (scenario alive, link not expired, password not changed since).
 *
 * The unlock is remembered in the visitor's session as  $_SESSION['shares'][slug] = fingerprint of the
 * password hash, so changing the password or switching the link off locks everyone out at once.
 */

const HB_SHARE_SLUG_RE = '/^[a-z0-9][a-z0-9-]{2,39}$/';
const HB_SHARE_RESERVED = ['api', 'assets', 'css', 'export', 'file', 'files', 'gadgets', 'index', 'js', 'login', 'logout',
    'setup', 'share', 'shares', 'vendor', 'private', 'homebase-private', 'admin', 'static', 'favicon'];

function hb_share_fingerprint(array $share): string
{
    return substr(hash('sha256', (string) $share['pass_hash']), 0, 16);
}

function hb_share_by_slug(string $slug): ?array
{
    if (!preg_match(HB_SHARE_SLUG_RE, $slug)) {
        return null;
    }
    $r = hb_q('SELECT sh.*, s.name AS scenario_name FROM shares sh JOIN scenarios s ON s.id = sh.scenario_id
               WHERE sh.slug = ? AND s.deleted_at IS NULL', [$slug])->fetch();
    return $r ?: null;
}

function hb_share_expired(array $share): bool
{
    return $share['expires_at'] !== null && strtotime($share['expires_at'] . ' UTC') <= time();
}

/** The share a visitor may use right now (open link, not expired, unlocked in this session), else null. */
function hb_share_unlocked(string $slug): ?array
{
    $share = hb_share_by_slug($slug);
    if (!$share || hb_share_expired($share)) {
        return null;
    }
    return (($_SESSION['shares'][$slug] ?? '') === hb_share_fingerprint($share)) ? $share : null;
}

function hb_share_require(string $slug): array
{
    $share = hb_share_unlocked($slug);
    if (!$share) {
        throw new HttpError(401, 'This shared page is locked or no longer available');
    }
    return $share;
}

/** Check a visitor's password (rate limited per link and address). */
function hb_share_unlock(string $slug, string $password): array
{
    $bucket = 'share:' . $slug;
    $wait = hb_rl_wait($bucket);
    if ($wait > 0) {
        throw new HttpError(429, 'Too many wrong tries. Try again in ' . (int) ceil($wait / 60) . ' min.', ['retry_after' => $wait]);
    }
    $share = hb_share_by_slug($slug);
    if (!$share || hb_share_expired($share)) {
        throw new HttpError(404, 'This shared page is not available');
    }
    if ($password !== '' && password_verify($password, (string) $share['pass_hash'])) {
        hb_rl_write(['fails' => 0, 'until' => 0], $bucket);
        $_SESSION['shares'][$slug] = hb_share_fingerprint($share);
        hb_q('UPDATE shares SET views = views + 1, last_viewed_at = UTC_TIMESTAMP() WHERE id = ?', [$share['id']]);
        return $share;
    }
    usleep(400000);
    $d = hb_rl_read($bucket);
    $d['fails']++;
    if ($d['fails'] >= 5) {
        hb_rl_write(['fails' => 0, 'until' => time() + 900], $bucket);
        throw new HttpError(429, 'Too many wrong tries. Locked for 15 minutes.', ['retry_after' => 900]);
    }
    hb_rl_write($d, $bucket);
    throw new HttpError(401, 'Wrong password (' . (5 - $d['fails']) . ' tries left)');
}

// ---- what a share may see ------------------------------------------------------------------------

/** Tiles visible through a share: the scenario's tiles plus the originals of any shared (mirror) tiles. */
function hb_share_tiles(array $share): array
{
    static $cache = [];
    $key = (int) $share['id'];
    if (isset($cache[$key])) {
        return $cache[$key];
    }
    $tiles = hb_q('SELECT * FROM tiles WHERE scenario_id = ? AND deleted_at IS NULL', [$share['scenario_id']])->fetchAll();
    $byId = [];
    foreach ($tiles as $t) {
        $byId[(int) $t['id']] = $t;
    }
    foreach ($tiles as $t) {
        $src = (int) ((json_decode((string) $t['settings'], true) ?: [])['shared_from'] ?? 0);
        if ($src && !isset($byId[$src])) {
            $o = hb_q('SELECT t.* FROM tiles t JOIN scenarios s ON s.id = t.scenario_id
                       WHERE t.id = ? AND t.deleted_at IS NULL AND s.deleted_at IS NULL', [$src])->fetch();
            if ($o) {
                $byId[$src] = $o;
            }
        }
    }
    return $cache[$key] = $byId;
}

function hb_share_has_tile(array $share, int $tileId): bool
{
    return isset(hb_share_tiles($share)[$tileId]);
}

/** Does any tile of $type in the share have settings that pass $test? (used by gadget server actions) */
function hb_share_allows_setting(array $share, string $type, callable $test): bool
{
    foreach (hb_share_tiles($share) as $t) {
        if ($t['type'] === $type && $test(json_decode((string) $t['settings'], true) ?: [])) {
            return true;
        }
    }
    return false;
}

/** May this share hand out this file? Pictures inside Writer/Sketch tiles always; other files only if allowed. */
function hb_share_allows_file(array $share, array $file): bool
{
    $tile = hb_share_tiles($share)[(int) $file['tile_id']] ?? null;
    if (!$tile) {
        return false;
    }
    $rule = hb_gadget_upload_rule((string) $tile['type']);
    return !empty($share['include_files']) || in_array($rule, ['png', 'image'], true);
}

/** Any share unlocked in this session that may hand out the file (file.php needs no share name). */
function hb_share_any_allows_file(array $file): bool
{
    foreach (array_keys((array) ($_SESSION['shares'] ?? [])) as $slug) {
        $share = hb_share_unlocked((string) $slug);
        if ($share && hb_share_allows_file($share, $file)) {
            return true;
        }
    }
    return false;
}

/** The read-only snapshot a visitor's page draws, limited to the shared scenario. */
function hb_share_state(array $share): array
{
    $tiles = hb_share_tiles($share);
    $ids = array_keys($tiles);
    $state = [
        'server_time' => gmdate('Y-m-d\TH:i:s\Z'),
        'scenarios' => [hb_row('scenarios', hb_get_row('scenarios', (int) $share['scenario_id']))],
        'tiles' => array_values(array_map(fn($t) => hb_row('tiles', $t), $tiles)),
        'settings' => new stdClass(),
        'limits' => hb_limits(),
        'share' => ['slug' => $share['slug'], 'name' => $share['scenario_name'], 'expires_at' => hb_iso($share['expires_at']),
            'include_files' => (bool) $share['include_files']],
    ];
    $in = $ids ? implode(',', array_map('intval', $ids)) : '0';
    foreach (['links', 'tasks', 'files', 'thoughts', 'entries'] as $t) {
        $rows = hb_q("SELECT * FROM `$t` WHERE tile_id IN ($in) AND deleted_at IS NULL ORDER BY "
            . ($t === 'thoughts' ? 'created_at, id' : 'position, id'))->fetchAll();
        if ($t === 'files') {
            $rows = array_values(array_filter($rows, fn($f) => hb_share_allows_file($share, $f)));
        }
        $state[$t] = array_map(fn($r) => hb_row($t, $r), $rows);
    }
    return $state;
}

// ---- owner side ----------------------------------------------------------------------------------

function hb_share_list(): array
{
    $rows = hb_q('SELECT sh.*, s.name AS scenario_name FROM shares sh JOIN scenarios s ON s.id = sh.scenario_id
                  WHERE s.deleted_at IS NULL ORDER BY sh.created_at DESC')->fetchAll();
    return array_map(fn($r) => [
        'id' => (int) $r['id'], 'scenario_id' => (int) $r['scenario_id'], 'scenario' => $r['scenario_name'], 'slug' => $r['slug'],
        'expires_at' => hb_iso($r['expires_at']), 'expired' => hb_share_expired($r), 'include_files' => (bool) $r['include_files'],
        'views' => (int) $r['views'], 'last_viewed_at' => hb_iso($r['last_viewed_at']), 'created_at' => hb_iso($r['created_at']),
    ], $rows);
}

function hb_share_slug_problem(string $slug, int $exceptId = 0): ?string
{
    if (!preg_match(HB_SHARE_SLUG_RE, $slug)) {
        return 'Use 3–40 lowercase letters, digits or dashes (for example: home, phd-notes)';
    }
    $pub = hb_public_dir();
    if (in_array($slug, HB_SHARE_RESERVED, true) || ($pub && file_exists($pub . '/' . $slug)) || preg_match('/\.(php|js|css)$/', $slug)) {
        return '"' . $slug . '" is reserved by Home Base. Pick another name';
    }
    $r = hb_q('SELECT id FROM shares WHERE slug = ? AND id <> ?', [$slug, $exceptId])->fetch();
    return $r ? 'That link name is already used' : null;
}

/** Create (no id) or change a share. password '' on change = keep it. expires: ISO time or ''/null = never. */
function hb_share_save(array $in): array
{
    $id = (int) ($in['id'] ?? 0);
    $old = $id ? hb_q('SELECT * FROM shares WHERE id = ?', [$id])->fetch() : null;
    if ($id && !$old) {
        throw new HttpError(404, 'That link no longer exists');
    }
    $sid = (int) ($in['scenario_id'] ?? ($old['scenario_id'] ?? 0));
    $sc = hb_get_row('scenarios', $sid);
    if (!$sc || $sc['deleted_at'] !== null) {
        throw new HttpError(400, 'Choose a scenario to share');
    }
    $slug = strtolower(trim((string) ($in['slug'] ?? ($old['slug'] ?? ''))));
    if ($p = hb_share_slug_problem($slug, $id)) {
        throw new HttpError(400, $p);
    }
    $pw = (string) ($in['password'] ?? '');
    if ((!$old || $pw !== '') && strlen($pw) < 6) {
        throw new HttpError(400, 'The password needs at least 6 characters');
    }
    $exp = null;
    if (!empty($in['expires_at'])) {
        $t = strtotime((string) $in['expires_at']);
        if ($t === false || $t <= time()) {
            throw new HttpError(400, 'The expiry must be in the future');
        }
        $exp = gmdate('Y-m-d H:i:s', $t);
    }
    $files = !empty($in['include_files']) ? 1 : 0;
    if ($old) {
        $hash = $pw !== '' ? password_hash($pw, PASSWORD_DEFAULT) : $old['pass_hash'];
        hb_q('UPDATE shares SET scenario_id = ?, slug = ?, pass_hash = ?, expires_at = ?, include_files = ? WHERE id = ?', [$sid, $slug, $hash, $exp, $files, $id]);
    } else {
        hb_q('INSERT INTO shares (scenario_id, slug, pass_hash, expires_at, include_files) VALUES (?,?,?,?,?)', [$sid, $slug, password_hash($pw, PASSWORD_DEFAULT), $exp, $files]);
        $id = (int) hb_db()->lastInsertId();
    }
    foreach (hb_share_list() as $s) {
        if ($s['id'] === $id) {
            return $s;
        }
    }
    throw new HttpError(500, 'Could not save the link');
}
