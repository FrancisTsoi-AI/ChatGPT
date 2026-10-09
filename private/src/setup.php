<?php
declare(strict_types=1);

/** Host and configuration checks shared by public/setup.php and bin/check-host.php. */
function hb_host_checks(): array
{
    $rows = [];
    $add = function (string $name, bool $ok, string $detail, bool $required = true) use (&$rows) {
        $rows[] = ['name' => $name, 'ok' => $ok, 'detail' => $detail, 'required' => $required];
    };
    $add('PHP 8.0 or later (8.2+ recommended)', PHP_VERSION_ID >= 80000, PHP_VERSION);
    foreach (['pdo_mysql' => true, 'mbstring' => true, 'json' => true, 'fileinfo' => false, 'zip' => false, 'curl' => false, 'simplexml' => false] as $ext => $req) {
        $add("PHP extension $ext", extension_loaded($ext), extension_loaded($ext) ? 'loaded' : ($req ? 'missing' : 'missing (optional' . ($ext === 'zip' ? ': needed for the zip backup and to install gadgets from a .zip)' : (in_array($ext, ['curl', 'simplexml'], true) ? ': needed for the Feeds, Weather and link-title features)' : ')'))), $req);
    }
    $up = hb_ini_bytes('upload_max_filesize');
    $post = hb_ini_bytes('post_max_size');
    $add('upload_max_filesize', true, ini_get('upload_max_filesize') . ' (bigger files upload in chunks)', false);
    $add('post_max_size', $post === 0 || $post >= 1024 ** 2, (string) ini_get('post_max_size') . ($post < $up ? ' (smaller than upload_max_filesize: chunk size follows the smaller one)' : ''), false);
    foreach (['files', 'sessions', 'ratelimit', 'tmp', 'cache'] as $d) {
        $p = hb_storage($d);
        $add("Writable private/storage/$d", is_dir($p) && is_writable($p), $p);
    }
    $g = hb_gadgets_dir();
    $n = count(glob($g . '/*/manifest.json') ?: []);
    $add('Gadgets folder', $n > 0, $n ? $n . ' gadgets in ' . $g : 'none found in ' . $g . ': upload homebase-private/gadgets');
    $add('Gadgets folder writable (to install gadgets from the web)', is_dir($g) && is_writable($g), is_dir($g) && is_writable($g) ? 'yes' : 'no: gadgets can then only be added by FTP', false);
    $env = hb_env();
    $add('private/.env found', (bool) $env, $env ? 'yes' : 'missing: copy .env.example to .env');
    $add('Database settings filled in', !empty($env['DB_NAME']) && !empty($env['DB_USER']), !empty($env['DB_NAME']) ? 'DB_NAME=' . $env['DB_NAME'] : 'DB_NAME / DB_USER empty');
    $add('Passphrase hash set', !empty($env['HB_PASSPHRASE_HASH']), !empty($env['HB_PASSPHRASE_HASH']) ? 'yes' : 'HB_PASSPHRASE_HASH is empty');
    $add('HTTPS', hb_is_https(), hb_is_https() ? 'yes' : 'not detected (fine locally; required in production)', false);
    if (!empty($env['DB_NAME'])) {
        try {
            $v = hb_db()->query('SELECT VERSION() v')->fetch()['v'];
            $add('Database connection', true, "connected, server $v");
            $have = hb_db()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
            $need = ['scenarios', 'tiles', 'links', 'tasks', 'files', 'thoughts', 'settings'];
            $miss = array_diff($need, $have);
            $add('7 core tables present (schema.sql)', !$miss, $miss ? 'missing: ' . implode(', ', $miss) : 'all 7 found');
            $add('Table "entries" (flashcards, notes, habits…)', true, in_array('entries', $have, true) ? 'present' : 'will be created automatically on first sign-in', false);
        } catch (Throwable $e) {
            $add('Database connection', false, $e->getMessage());
        }
    }
    return $rows;
}
