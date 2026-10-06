<?php
declare(strict_types=1);

require __DIR__ . '/_boot.php';

hb_security_headers();
try {
    hb_session_start();
    hb_require_auth();
    ($_GET['format'] ?? 'json') === 'zip' ? hb_export_zip() : hb_export_json();
} catch (Throwable $e) {
    hb_handle_exception($e);
}
