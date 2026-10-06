<?php
declare(strict_types=1);

require __DIR__ . '/_boot.php';

hb_security_headers();
try {
    hb_session_start();
    hb_require_auth();
    hb_serve_file((int) ($_GET['id'] ?? 0), isset($_GET['dl']));
} catch (Throwable $e) {
    hb_handle_exception($e);
}
