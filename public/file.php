<?php
declare(strict_types=1);

require __DIR__ . '/_boot.php';

hb_security_headers();
try {
    hb_session_start();
    $id = (int) ($_GET['id'] ?? 0);
    if (!hb_is_authed()) { // a visitor of a share link may fetch the files that link shows
        $f = hb_q('SELECT * FROM files WHERE id = ? AND deleted_at IS NULL', [$id])->fetch();
        if (!$f || !hb_share_any_allows_file($f)) {
            throw new HttpError(401, 'Not signed in');
        }
    }
    hb_serve_file($id, isset($_GET['dl']));
} catch (Throwable $e) {
    hb_handle_exception($e);
}
