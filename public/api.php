<?php
declare(strict_types=1);

require __DIR__ . '/_boot.php';

hb_security_headers();
header('Cache-Control: no-store');

try {
    hb_session_start();
    $route = (string) ($_GET['r'] ?? '');
    $method = hb_method();

    if ($route === 'auth/status' && $method === 'GET') {
        hb_json(['authed' => hb_is_authed(), 'csrf' => hb_csrf()]);
    }
    if ($method !== 'GET') {
        hb_require_csrf();
    }
    if ($route === 'auth/login' && $method === 'POST') {
        hb_login((string) (hb_input()['passphrase'] ?? ''));
        hb_json(['authed' => true, 'csrf' => hb_csrf()]);
    }
    if ($route === 'auth/logout' && $method === 'POST') {
        hb_logout();
        hb_json(['authed' => false]);
    }

    hb_require_auth();

    // Upload bodies bigger than post_max_size arrive empty; say so instead of a vague error.
    if (($route === 'upload' || $route === 'upload-chunk') && $method === 'POST' && !$_POST && !$_FILES
        && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        throw new HttpError(413, 'Upload is larger than the server allows (post_max_size)');
    }

    switch ($route) {
        case 'state':
            hb_json(hb_state());
        case 'batch':
            if ($method !== 'POST') {
                throw new HttpError(405, 'POST only');
            }
            hb_json(['results' => hb_batch((array) (hb_input()['ops'] ?? []))]);
        case 'trash':
            hb_json(['items' => hb_trash_list()]);
        case 'search':
            hb_json(['results' => hb_search((string) ($_GET['q'] ?? ''))]);
        case 'upload':
            if ($method !== 'POST') {
                throw new HttpError(405, 'POST only');
            }
            hb_json(hb_handle_upload());
        case 'upload-chunk':
            if ($method !== 'POST') {
                throw new HttpError(405, 'POST only');
            }
            hb_json(hb_handle_chunk());
    }
    throw new HttpError(404, 'Unknown route');
} catch (Throwable $e) {
    hb_handle_exception($e);
}
