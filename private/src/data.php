<?php
declare(strict_types=1);

/**
 * Table spec. Column types: int | str:N | json | dt (nullable datetime) | enum:a,b,c
 * Only these columns can be written by the browser. `parent` = [column, parent table].
 */
// Tile types and entry kinds come from the gadget manifests: hb_tile_types(), hb_entry_tile() in gadgets.php.

function hb_spec(): array
{
    static $spec = null;
    return $spec ??= [
        'scenarios' => [
            'parent' => null,
            'cols' => ['name' => 'str:80', 'position' => 'int'],
        ],
        'tiles' => [
            'parent' => ['scenario_id', 'scenarios'],
            'cols' => [
                'scenario_id' => 'int', 'type' => 'enum:' . implode(',', hb_tile_types()),
                'x' => 'int', 'y' => 'int', 'width' => 'int', 'height' => 'int',
                'title' => 'str:120', 'colour' => 'str:20', 'settings' => 'json',
            ],
        ],
        'links' => [
            'parent' => ['tile_id', 'tiles'],
            'cols' => [
                'tile_id' => 'int', 'kind' => 'enum:link,header', 'name' => 'str:160', 'url' => 'str:2000',
                'icon' => 'str:16', 'colour' => 'str:20', 'tags' => 'str:255', 'position' => 'int',
            ],
        ],
        'tasks' => [
            'parent' => ['tile_id', 'tiles'],
            'cols' => [
                'tile_id' => 'int', 'bucket' => 'str:40', 'text' => 'str:1000', 'colour' => 'str:20',
                'tags' => 'str:255', 'position' => 'int', 'done_at' => 'dt',
            ],
        ],
        'files' => [
            'parent' => ['tile_id', 'tiles'],
            // size / stored_name / type are set by the upload endpoint only
            'cols' => [
                'tile_id' => 'int', 'original_name' => 'str:255', 'colour' => 'str:20',
                'tags' => 'str:255', 'position' => 'int',
            ],
            'no_create' => true,
        ],
        'thoughts' => [
            'parent' => ['tile_id', 'tiles'],
            'cols' => ['tile_id' => 'int', 'text' => 'str:20000', 'tags' => 'str:255'],
        ],
        'entries' => [
            'parent' => ['tile_id', 'tiles'],
            'cols' => [
                'tile_id' => 'int', 'kind' => 'enum:' . implode(',', array_keys(hb_entry_tile()) ?: ['none']),
                'a' => 'str:1000000', 'b' => 'str:20000', 'tags' => 'str:255', 'colour' => 'str:20',
                'position' => 'int', 'day' => 'date', 'due_at' => 'dt', 'num' => 'int', 'data' => 'json',
            ],
        ],
    ];
}

function hb_spec_for(string $table): array
{
    $spec = hb_spec();
    if (!isset($spec[$table])) {
        throw new HttpError(400, 'Unknown type: ' . $table);
    }
    return $spec[$table];
}

/** Coerce one incoming value according to its column type. */
function hb_coerce(string $col, string $type, mixed $v): mixed
{
    [$kind, $arg] = array_pad(explode(':', $type, 2), 2, null);
    switch ($kind) {
        case 'int':
            if (!is_numeric($v)) {
                throw new HttpError(400, "$col must be a number");
            }
            return (int) $v;
        case 'str':
            $s = is_scalar($v) ? (string) $v : '';
            return mb_substr($s, 0, (int) $arg);
        case 'enum':
            if (!in_array($v, explode(',', (string) $arg), true)) {
                throw new HttpError(400, "$col has an invalid value");
            }
            return $v;
        case 'json':
            if ($v === null || $v === '') {
                return null;
            }
            $s = is_string($v) ? $v : json_encode($v, JSON_UNESCAPED_UNICODE);
            if (strlen((string) $s) > 60000 || json_decode((string) $s) === null) {
                throw new HttpError(400, "$col is not valid JSON or is too large");
            }
            return $s;
        case 'date':
            if ($v === null || $v === '') {
                return null;
            }
            if (!is_string($v) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) || !checkdate((int) substr($v, 5, 2), (int) substr($v, 8, 2), (int) substr($v, 0, 4))) {
                throw new HttpError(400, "$col is not a date (YYYY-MM-DD)");
            }
            return $v;
        case 'dt':
            if ($v === null || $v === '') {
                return null;
            }
            $t = strtotime((string) $v);
            if ($t === false) {
                throw new HttpError(400, "$col is not a date");
            }
            return gmdate('Y-m-d H:i:s', $t);
    }
    throw new HttpError(500, 'Bad column spec');
}

/** Convert a DB row to the shape the browser sees. */
function hb_row(string $table, array $r): array
{
    foreach ($r as $k => $v) {
        if ($v === null) {
            continue;
        }
        if (in_array($k, ['created_at', 'updated_at', 'deleted_at', 'done_at', 'due_at'], true)) {
            $r[$k] = hb_iso($v);
        } elseif (in_array($k, ['id', 'scenario_id', 'tile_id', 'x', 'y', 'width', 'height', 'position', 'size', 'num'], true)) {
            $r[$k] = (int) $v;
        }
    }
    if ($table === 'tiles') {
        $s = isset($r['settings']) ? json_decode((string) $r['settings'], true) : null;
        $r['settings'] = is_array($s) ? $s : new stdClass();
    }
    if ($table === 'entries') {
        $d = isset($r['data']) ? json_decode((string) $r['data'], true) : null;
        $r['data'] = is_array($d) ? $d : new stdClass();
    }
    if ($table === 'files') {
        unset($r['stored_name']); // never leaves the server; files are fetched by id
    }
    return $r;
}

function hb_get_row(string $table, int $id): ?array
{
    $r = hb_q("SELECT * FROM `$table` WHERE id = ?", [$id])->fetch();
    return $r ?: null;
}

// ---- snapshot ----------------------------------------------------------------------------

/** Joins that keep only rows whose whole parent chain is alive. */
function hb_alive_sql(string $table): string
{
    return match ($table) {
        'scenarios' => 'SELECT x.* FROM scenarios x WHERE x.deleted_at IS NULL ORDER BY x.position, x.id',
        'tiles' => 'SELECT x.* FROM tiles x JOIN scenarios s ON s.id = x.scenario_id
                    WHERE x.deleted_at IS NULL AND s.deleted_at IS NULL ORDER BY x.y, x.x, x.id',
        default => "SELECT x.* FROM `$table` x JOIN tiles t ON t.id = x.tile_id JOIN scenarios s ON s.id = t.scenario_id
                    WHERE x.deleted_at IS NULL AND t.deleted_at IS NULL AND s.deleted_at IS NULL "
                    // day-based rows (habit ticks, time log) are sent for the last 400 days only; older ones stay in the database and the export
                    . ($table === 'entries' ? 'AND (x.day IS NULL OR x.day >= (UTC_DATE() - INTERVAL 400 DAY)) ' : '')
                    . ($table === 'thoughts' ? 'ORDER BY x.created_at, x.id' : 'ORDER BY x.position, x.id'),
    };
}

function hb_settings(): array
{
    $out = [];
    foreach (hb_q('SELECT `key`, `value` FROM settings')->fetchAll() as $r) {
        if (!str_starts_with($r['key'], '_')) { // keys starting with _ are server-internal
            $out[$r['key']] = $r['value'];
        }
    }
    return $out;
}

/**
 * Upgrades without phpMyAdmin: when a table added by a newer version is missing, run schema.sql
 * (it only creates what is missing). Needs the DB user to have CREATE rights, which it normally does.
 */
function hb_ensure_schema(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    try {
        foreach (['entries', 'shares'] as $t) { // tables added by later versions
            hb_db()->query("SELECT 1 FROM `$t` LIMIT 0");
        }
        $checked = true;
        return;
    } catch (PDOException $e) {
        if ($e->getCode() !== '42S02') {
            throw $e;
        }
    }
    $file = null;
    foreach ([HB_PRIVATE . '/schema.sql', HB_PRIVATE . '/../schema.sql'] as $f) {
        if (is_readable($f)) {
            $file = $f;
            break;
        }
    }
    if ($file === null) {
        throw new HttpError(500, 'The database needs upgrading: import schema.sql in phpMyAdmin (see DEPLOY.md).');
    }
    $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
    foreach (array_filter(array_map('trim', explode(';', (string) $sql))) as $stmt) {
        hb_db()->exec($stmt);
    }
    $checked = true;
}

function hb_state(): array
{
    hb_ensure_schema();
    hb_seed_if_empty();
    hb_maybe_purge();
    $state = ['server_time' => gmdate('Y-m-d\TH:i:s\Z')];
    foreach (array_keys(hb_spec()) as $t) {
        $state[$t] = array_map(fn($r) => hb_row($t, $r), hb_q(hb_alive_sql($t))->fetchAll());
    }
    $state['settings'] = (object) hb_settings();
    $state['limits'] = hb_limits();
    return $state;
}

function hb_limits(): array
{
    $upload = hb_ini_bytes('upload_max_filesize') ?: 2 * 1024 ** 2;
    $post = hb_ini_bytes('post_max_size') ?: $upload;
    $per = min($upload, $post);
    // chunk: stay well under the per-request limit, cap at 4 MB
    $chunk = (int) max(256 * 1024, min(4 * 1024 ** 2, (int) ($per * 0.8)));
    return [
        'max_file' => (int) hb_cfg('HB_MAX_FILE_MB', 2048) * 1024 ** 2,
        'chunk' => $chunk,
        'single_max' => (int) ($per * 0.9),
        'trash_days' => (int) hb_cfg('HB_TRASH_DAYS', 30),
    ];
}

// ---- first-run seed ----------------------------------------------------------------------

function hb_default_buckets(): array
{
    return [
        ['id' => 'urgent', 'name' => 'Urgent'], ['id' => 'later', 'name' => 'Later'],
        ['id' => 'brainoff', 'name' => 'Brain-off'], ['id' => 'none', 'name' => 'No category'],
    ];
}

function hb_seed_if_empty(): void
{
    $any = hb_q('SELECT COUNT(*) c FROM scenarios')->fetch()['c'];
    if ((int) $any > 0) {
        return;
    }
    $layouts = [
        'Work' => [
            ['clock', 'Clock', 0, 0, 3, 3, null], ['todo', 'To-do', 3, 0, 6, 7, ['buckets' => hb_default_buckets()]],
            ['toolbox', 'Toolbox', 9, 0, 3, 7, null], ['thoughts', 'Thought dump', 0, 3, 3, 4, null],
        ],
        'Idea' => [
            ['thoughts', 'Thought dump', 0, 0, 6, 6, null], ['toolbox', 'Toolbox', 6, 0, 3, 6, null],
            ['clock', 'Clock', 9, 0, 3, 3, null],
        ],
        'PhD' => [
            ['todo', 'To-do', 0, 0, 6, 7, ['buckets' => hb_default_buckets()]], ['countdown', 'Deadlines', 6, 0, 3, 4, null],
            ['toolbox', 'Toolbox', 9, 0, 3, 7, null], ['thoughts', 'Thought dump', 6, 4, 3, 3, null],
        ],
    ];
    $pos = 0;
    foreach ($layouts as $name => $tiles) {
        hb_q('INSERT INTO scenarios (name, position) VALUES (?, ?)', [$name, $pos++]);
        $sid = (int) hb_db()->lastInsertId();
        foreach ($tiles as [$type, $title, $x, $y, $w, $h, $settings]) {
            hb_q(
                'INSERT INTO tiles (scenario_id, type, x, y, width, height, title, settings) VALUES (?,?,?,?,?,?,?,?)',
                [$sid, $type, $x, $y, $w, $h, $title, $settings ? json_encode($settings) : null]
            );
        }
    }
}

// ---- batch writes ------------------------------------------------------------------------

/** Apply a list of ops in one transaction. Returns one result per op. */
function hb_batch(array $ops): array
{
    if (count($ops) > 500) {
        throw new HttpError(400, 'Too many operations in one batch');
    }
    $db = hb_db();
    $db->beginTransaction();
    $after = []; // disk cleanups to run once the transaction commits
    try {
        $results = [];
        foreach ($ops as $op) {
            $results[] = hb_apply_op(is_array($op) ? $op : [], $after);
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
    foreach ($after as $stored) {
        hb_unlink_stored($stored);
    }
    return $results;
}

function hb_apply_op(array $op, array &$after): array
{
    $kind = $op['op'] ?? '';
    if ($kind === 'setting') {
        return hb_op_setting((string) ($op['key'] ?? ''), $op['value'] ?? null);
    }
    $table = (string) ($op['type'] ?? '');
    $spec = hb_spec_for($table);
    $id = isset($op['id']) ? (int) $op['id'] : 0;
    switch ($kind) {
        case 'create':
            return hb_op_create($table, $spec, (array) ($op['data'] ?? []));
        case 'update':
            return hb_op_update($table, $spec, $id, (array) ($op['data'] ?? []));
        case 'delete':
            return hb_op_delete($table, $id);
        case 'restore':
            hb_q("UPDATE `$table` SET deleted_at = NULL WHERE id = ?", [$id]);
            return ['ok' => true];
        case 'purge':
            $row = hb_get_row($table, $id);
            if ($row && $row['deleted_at'] !== null) { // only items already in the trash
                hb_purge_rows($table, [$id], $after);
            }
            return ['ok' => true];
    }
    throw new HttpError(400, 'Unknown operation');
}

function hb_check_parent(array $spec, array $data): void
{
    if ($spec['parent'] && isset($data[$spec['parent'][0]])) {
        [$col, $ptable] = $spec['parent'];
        $p = hb_get_row($ptable, (int) $data[$col]);
        if (!$p || $p['deleted_at'] !== null) {
            throw new HttpError(400, 'Parent does not exist');
        }
    }
}

function hb_clean(array $spec, array $data, bool $strict): array
{
    $out = [];
    foreach ($spec['cols'] as $col => $type) {
        if (array_key_exists($col, $data)) {
            $out[$col] = hb_coerce($col, $type, $data[$col]);
        }
    }
    return $out;
}

function hb_op_create(string $table, array $spec, array $data): array
{
    if (!empty($spec['no_create'])) {
        throw new HttpError(400, "$table can only be created by upload");
    }
    $row = hb_clean($spec, $data, true);
    if ($spec['parent'] && !isset($row[$spec['parent'][0]])) {
        throw new HttpError(400, 'Missing parent');
    }
    hb_check_parent($spec, $row);
    if (isset($spec['cols']['position']) && !isset($row['position'])) {
        $row['position'] = hb_next_position($table, $spec, $row);
    }
    if ($table === 'scenarios' && trim((string) ($row['name'] ?? '')) === '') {
        $row['name'] = 'Scenario';
    }
    if ($table === 'thoughts' && isset($data['created_at'])) {
        $row['created_at'] = hb_coerce('created_at', 'dt', $data['created_at']);
    }
    if ($table === 'entries') {
        hb_check_entry($row);
    }
    if (!$row) {
        throw new HttpError(400, 'Nothing to create');
    }
    $cols = array_keys($row);
    hb_q(
        "INSERT INTO `$table` (`" . implode('`,`', $cols) . '`) VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')',
        array_values($row)
    );
    $id = (int) hb_db()->lastInsertId();
    return ['id' => $id, 'row' => hb_row($table, hb_get_row($table, $id))];
}

function hb_next_position(string $table, array $spec, array $row): int
{
    if ($spec['parent']) {
        $col = $spec['parent'][0];
        $r = hb_q("SELECT COALESCE(MAX(position), -1) + 1 p FROM `$table` WHERE `$col` = ?", [$row[$col]])->fetch();
    } else {
        $r = hb_q("SELECT COALESCE(MAX(position), -1) + 1 p FROM `$table`")->fetch();
    }
    return (int) $r['p'];
}

/** An entry's kind must match the tile type that holds it. */
function hb_check_entry(array $row, ?array $existing = null): void
{
    $kind = $row['kind'] ?? ($existing['kind'] ?? null);
    $tileId = $row['tile_id'] ?? ($existing['tile_id'] ?? null);
    $tile = $tileId ? hb_get_row('tiles', (int) $tileId) : null;
    if (!$kind || !$tile || (hb_entry_tile()[$kind] ?? null) !== $tile['type']) {
        throw new HttpError(400, 'That kind of entry does not belong in this tile');
    }
}

function hb_op_update(string $table, array $spec, int $id, array $data): array
{
    unset($data['id']);
    if ($table === 'entries') {
        unset($data['kind']); // fixed at creation
    }
    $row = hb_clean($spec, $data, false);
    $existing = hb_get_row($table, $id);
    if (!$existing) {
        throw new HttpError(404, 'Not found');
    }
    if ($table === 'entries' && isset($row['tile_id'])) {
        hb_check_entry($row, $existing);
    }
    hb_check_parent($spec, $row);
    if ($row) {
        $sets = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($row)));
        hb_q("UPDATE `$table` SET $sets WHERE id = ?", [...array_values($row), $id]);
    }
    return ['row' => hb_row($table, hb_get_row($table, $id))];
}

function hb_op_delete(string $table, int $id): array
{
    if ($table === 'scenarios') {
        $left = (int) hb_q('SELECT COUNT(*) c FROM scenarios WHERE deleted_at IS NULL AND id <> ?', [$id])->fetch()['c'];
        if ($left < 1) {
            throw new HttpError(400, 'You cannot delete the last scenario');
        }
    }
    hb_q("UPDATE `$table` SET deleted_at = UTC_TIMESTAMP() WHERE id = ? AND deleted_at IS NULL", [$id]);
    return ['ok' => true];
}

function hb_op_setting(string $key, mixed $value): array
{
    if (!preg_match('/^[a-z][a-z0-9_.]{0,63}$/', $key)) {
        throw new HttpError(400, 'Bad setting key');
    }
    $v = $value === null ? null : (is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_UNICODE));
    if ($v !== null && strlen($v) > 20000) {
        throw new HttpError(400, 'Setting too large');
    }
    hb_q('INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)', [$key, $v]);
    return ['ok' => true];
}

// ---- purge / trash -----------------------------------------------------------------------

/** Hard-delete rows (children cascade) and queue their stored files for removal. */
function hb_purge_rows(string $table, array $ids, array &$after): void
{
    if (!$ids) {
        return;
    }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $stored = match ($table) {
        'files' => hb_q("SELECT stored_name FROM files WHERE id IN ($in)", $ids)->fetchAll(PDO::FETCH_COLUMN),
        'tiles' => hb_q("SELECT stored_name FROM files WHERE tile_id IN ($in)", $ids)->fetchAll(PDO::FETCH_COLUMN),
        'scenarios' => hb_q("SELECT f.stored_name FROM files f JOIN tiles t ON t.id = f.tile_id WHERE t.scenario_id IN ($in)", $ids)->fetchAll(PDO::FETCH_COLUMN),
        default => [],
    };
    hb_q("DELETE FROM `$table` WHERE id IN ($in)", $ids);
    foreach ($stored as $s) {
        $after[] = $s;
    }
}

function hb_maybe_purge(): void
{
    $today = gmdate('Y-m-d');
    $last = hb_q("SELECT `value` FROM settings WHERE `key` = '_last_purge'")->fetch();
    if ($last && $last['value'] === $today) {
        return;
    }
    $days = max(1, (int) hb_cfg('HB_TRASH_DAYS', 30));
    $after = [];
    $db = hb_db();
    $db->beginTransaction();
    try {
        foreach (['scenarios', 'tiles', 'links', 'tasks', 'files', 'thoughts', 'entries'] as $t) {
            $ids = hb_q("SELECT id FROM `$t` WHERE deleted_at IS NOT NULL AND deleted_at < (UTC_TIMESTAMP() - INTERVAL $days DAY)")
                ->fetchAll(PDO::FETCH_COLUMN);
            hb_purge_rows($t, array_map('intval', $ids), $after);
        }
        hb_q("INSERT INTO settings (`key`, `value`) VALUES ('_last_purge', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)", [$today]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
    foreach ($after as $s) {
        hb_unlink_stored($s);
    }
    hb_clean_stale_uploads();
}

/** Everything in the trash whose parent chain is alive (so you restore top-down). */
function hb_trash_list(): array
{
    $out = [];
    $push = function (string $type, array $r, string $label, string $where) use (&$out) {
        $out[] = [
            'type' => $type, 'id' => (int) $r['id'], 'label' => $label !== '' ? $label : '(untitled)',
            'where' => $where, 'deleted_at' => hb_iso($r['deleted_at']),
        ];
    };
    foreach (hb_q('SELECT * FROM scenarios WHERE deleted_at IS NOT NULL')->fetchAll() as $r) {
        $push('scenarios', $r, $r['name'], 'Scenario');
    }
    foreach (hb_q('SELECT t.*, s.name sname FROM tiles t JOIN scenarios s ON s.id = t.scenario_id
                   WHERE t.deleted_at IS NOT NULL AND s.deleted_at IS NULL')->fetchAll() as $r) {
        $push('tiles', $r, $r['title'] !== '' ? $r['title'] : ucfirst($r['type']), 'Tile · ' . $r['sname']);
    }
    $leaf = [
        'links' => fn($r) => $r['name'] !== '' ? $r['name'] : $r['url'],
        'tasks' => fn($r) => $r['text'],
        'files' => fn($r) => $r['original_name'],
        'thoughts' => fn($r) => mb_substr($r['text'], 0, 80),
        'entries' => fn($r) => mb_substr(trim((string) ($r['a'] ?? '')) !== '' ? (string) $r['a'] : $r['kind'], 0, 80),
    ];
    foreach ($leaf as $t => $label) {
        $rows = hb_q("SELECT x.*, t.title ttitle, t.type ttype, s.name sname FROM `$t` x
                      JOIN tiles t ON t.id = x.tile_id JOIN scenarios s ON s.id = t.scenario_id
                      WHERE x.deleted_at IS NOT NULL AND t.deleted_at IS NULL AND s.deleted_at IS NULL")->fetchAll();
        foreach ($rows as $r) {
            $tt = $r['ttitle'] !== '' ? $r['ttitle'] : ucfirst($r['ttype']);
            $push($t, $r, (string) $label($r), rtrim($t, 's') . ' · ' . $r['sname'] . ' / ' . $tt);
        }
    }
    usort($out, fn($a, $b) => strcmp($b['deleted_at'], $a['deleted_at']));
    return $out;
}

// ---- search ------------------------------------------------------------------------------

function hb_search(string $q): array
{
    $q = trim($q);
    if ($q === '') {
        return [];
    }
    $like = '%' . addcslashes(mb_substr($q, 0, 100), '%_\\') . '%';
    $out = [];
    $run = function (string $type, string $sql, array $params, callable $label) use (&$out) {
        foreach (hb_q($sql, $params)->fetchAll() as $r) {
            $out[] = [
                'type' => $type, 'id' => (int) $r['id'], 'tile_id' => (int) $r['tile_id'],
                'scenario_id' => (int) $r['scenario_id'], 'label' => $label($r), 'url' => $r['url'] ?? null, 'kind' => $r['kind'] ?? null,
                'where' => $r['sname'] . ' / ' . ($r['ttitle'] !== '' ? $r['ttitle'] : ucfirst($r['ttype'])),
            ];
        }
    };
    $base = fn(string $t, string $cols) => "SELECT x.id, t.id tile_id, s.id scenario_id, $cols, s.name sname, t.title ttitle, t.type ttype
        FROM `$t` x JOIN tiles t ON t.id = x.tile_id JOIN scenarios s ON s.id = t.scenario_id
        WHERE x.deleted_at IS NULL AND t.deleted_at IS NULL AND s.deleted_at IS NULL AND ";
    $kinds = hb_search_kinds(); // from the gadget manifests ("searchKinds")
    if ($kinds) {
        $run('entries', $base('entries', 'x.a, x.kind') . 'x.kind IN (' . implode(',', array_fill(0, count($kinds), '?')) . ') AND (x.a LIKE ? OR x.b LIKE ? OR x.tags LIKE ?) ORDER BY x.id DESC LIMIT 20',
            array_merge($kinds, [$like, $like, $like]), function ($r) {
                $a = trim((string) $r['a']);
                return str_starts_with($a, '<') ? hb_clean_text($a, 100) : mb_substr($a, 0, 100); // Writer documents are HTML
            });
    }
    $run('links', $base('links', 'x.name, x.url, x.kind') . '(x.name LIKE ? OR x.url LIKE ? OR x.tags LIKE ?) ORDER BY x.name LIMIT 20',
        [$like, $like, $like], fn($r) => $r['name'] !== '' ? $r['name'] : $r['url']);
    $run('tasks', $base('tasks', 'x.text') . '(x.text LIKE ? OR x.tags LIKE ?) ORDER BY x.id DESC LIMIT 20',
        [$like, $like], fn($r) => $r['text']);
    $run('files', $base('files', 'x.original_name') . '(x.original_name LIKE ? OR x.tags LIKE ?) ORDER BY x.original_name LIMIT 20',
        [$like, $like], fn($r) => $r['original_name']);
    $run('thoughts', $base('thoughts', 'x.text') . '(x.text LIKE ? OR x.tags LIKE ?) ORDER BY x.id DESC LIMIT 20',
        [$like, $like], fn($r) => mb_substr($r['text'], 0, 100));
    return $out;
}

// ---- export ------------------------------------------------------------------------------

function hb_export_data(): array
{
    $data = ['exported_at' => gmdate('Y-m-d\TH:i:s\Z'), 'version' => 1];
    foreach (['scenarios', 'tiles', 'links', 'tasks', 'files', 'thoughts', 'entries', 'settings'] as $t) {
        $data[$t] = hb_q("SELECT * FROM `$t`")->fetchAll();
    }
    return $data;
}
