<?php
declare(strict_types=1);

// Usage:  php private/bin/check-host.php     (stage S0 host check, from a terminal)
require __DIR__ . '/../src/config.php';
require __DIR__ . '/../src/db.php';
require __DIR__ . '/../src/setup.php';

foreach (hb_host_checks() as $r) {
    printf("[%s] %-34s %s\n", $r['ok'] ? ' OK ' : ($r['required'] ? 'FAIL' : 'warn'), $r['name'], $r['detail']);
}
