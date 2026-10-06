<?php
declare(strict_types=1);

function hb_db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $name = (string) hb_cfg('DB_NAME', '');
    if ($name === '') {
        throw new RuntimeException('Database is not configured: fill in private/.env');
    }
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        hb_cfg('DB_HOST', 'localhost'),
        (int) hb_cfg('DB_PORT', 3306),
        $name
    );
    $pdo = new PDO($dsn, (string) hb_cfg('DB_USER', ''), (string) hb_cfg('DB_PASS', ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

/** Run a statement with bound params; returns the PDOStatement. */
function hb_q(string $sql, array $params = []): PDOStatement
{
    $st = hb_db()->prepare($sql);
    $st->execute($params);
    return $st;
}

/** MySQL "YYYY-MM-DD HH:MM:SS" (UTC) to ISO 8601 with Z, null-safe. */
function hb_iso(?string $dt): ?string
{
    return $dt === null ? null : str_replace(' ', 'T', $dt) . 'Z';
}
