<?php
declare(strict_types=1);

/**
 * Finds the private folder and loads the gateway. The private folder must sit OUTSIDE the
 * web root, e.g. /home/USER/homebase-private. See DEPLOY.md.
 */
(function () {
    // 1) an explicit path, 2) a one-line file public/.private-path, 3) usual places next to / above the web root
    $candidates = [(string) ($_SERVER['HB_PRIVATE_DIR'] ?? getenv('HB_PRIVATE_DIR') ?: '')];
    $hint = __DIR__ . '/.private-path';
    if (is_file($hint)) {
        $candidates[] = trim((string) file_get_contents($hint));
    }
    foreach (['homebase-private', 'private'] as $name) {
        foreach (['/..', '/../..', '/../../..'] as $up) {
            $candidates[] = __DIR__ . $up . '/' . $name;
        }
    }
    foreach ($candidates as $dir) {
        if ($dir !== '' && is_file($dir . '/src/bootstrap.php')) {
            require $dir . '/src/bootstrap.php';
            return;
        }
    }
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Home Base: the private folder was not found.\n"
        . "Upload the 'homebase-private' folder next to (not inside) the web folder. See DEPLOY.md.\n";
    exit;
})();
