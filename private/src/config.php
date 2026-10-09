<?php
declare(strict_types=1);

/** Root of the private folder (the one that holds .env, src/ and storage/). */
define('HB_PRIVATE', realpath(__DIR__ . '/..') ?: __DIR__ . '/..');

/** Parse private/.env (KEY=value, # comments, optional quotes). Cached per request. */
function hb_env(): array
{
    static $env = null;
    if ($env !== null) {
        return $env;
    }
    $env = [];
    $file = HB_PRIVATE . '/.env';
    if (is_readable($file)) {
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            $v = trim($v);
            if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && substr($v, -1) === $v[0]) {
                $v = substr($v, 1, -1);
            }
            $env[trim($k)] = $v;
        }
    }
    return $env;
}

function hb_cfg(string $key, string|int|null $default = null): string|int|null
{
    $env = hb_env();
    if (array_key_exists($key, $env) && $env[$key] !== '') {
        return $env[$key];
    }
    $os = getenv($key); // real environment variables also work (handy for tests)
    return $os !== false && $os !== '' ? $os : $default;
}

function hb_storage(string $sub = ''): string
{
    $dir = HB_PRIVATE . '/storage' . ($sub !== '' ? '/' . $sub : '');
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return $dir;
}

function hb_is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

/** Size strings from php.ini ("64M") to bytes. */
function hb_ini_bytes(string $name): int
{
    $v = trim((string) ini_get($name));
    if ($v === '') {
        return 0;
    }
    $n = (int) $v;
    return match (strtolower(substr($v, -1))) {
        'g' => $n * 1024 ** 3,
        'm' => $n * 1024 ** 2,
        'k' => $n * 1024,
        default => $n,
    };
}
