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
    if ($route === 'auth/logout-all' && $method === 'POST') {
        hb_require_auth();
        $keep = !empty(hb_input()['keep_this']);
        hb_logout_all($keep);
        hb_json(['authed' => $keep, 'csrf' => $keep ? hb_csrf() : null]);
    }

    // ---- visitors of a share link: unlock, then only the shared scenario, read-only ----------------
    if ($route === 'share/unlock' && $method === 'POST') {
        $in = hb_input();
        hb_share_unlock((string) ($in['slug'] ?? ''), (string) ($in['password'] ?? ''));
        hb_json(['ok' => true]);
    }
    $shareSlug = (string) ($_GET['share'] ?? '');
    if ($shareSlug !== '') {
        $share = hb_share_require($shareSlug);
        if ($route === 'share/state' && $method === 'GET') {
            hb_json(hb_share_state($share));
        }
        if ($method === 'GET' && preg_match('#^g/([a-z][a-z0-9_]*)/([a-z][a-z0-9_]*)$#', $route, $m)) {
            hb_json(hb_gadget_action($m[1], $m[2], $share));
        }
        throw new HttpError(403, 'This shared page is read-only');
    }

    hb_require_auth();

    // ---- share links (owner) ----
    if ($route === 'shares' && $method === 'GET') {
        hb_json(['shares' => hb_share_list()]);
    }
    if ($route === 'shares/save' && $method === 'POST') {
        hb_json(['share' => hb_share_save(hb_input())]);
    }
    if ($route === 'shares/delete' && $method === 'POST') {
        hb_q('DELETE FROM shares WHERE id = ?', [(int) (hb_input()['id'] ?? 0)]);
        hb_json(['ok' => true]);
    }

    // Upload bodies bigger than post_max_size arrive empty; say so instead of a vague error.
    if (in_array($route, ['upload', 'upload-chunk', 'gadgets/upload'], true) && $method === 'POST' && !$_POST && !$_FILES
        && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        throw new HttpError(413, 'Upload is larger than the server allows (post_max_size)');
    }

    // ---- the Gadgets page: install / update from a zip, switch off / on, delete, download ----
    if ($route === 'gadgets' && $method === 'GET') {
        hb_json(hb_gadget_admin_list());
    }
    if ($route === 'gadgets/upload' && $method === 'POST') {
        hb_json(hb_gadget_upload());
    }
    if ($route === 'gadgets/install' && $method === 'POST') {
        hb_json(hb_gadget_install(hb_input()));
    }
    if ($route === 'gadgets/switch' && $method === 'POST') {
        hb_json(hb_gadget_switch(hb_input()));
    }
    if ($route === 'gadgets/delete' && $method === 'POST') {
        hb_json(hb_gadget_delete(hb_input()));
    }
    if ($route === 'gadgets/export' && $method === 'GET') {
        hb_gadget_export((string) ($_GET['type'] ?? ''));
    }

    // a gadget's own server actions: g/<type>/<action>  (homebase-private/gadgets/<type>/server.php)
    if (preg_match('#^g/([a-z][a-z0-9_]*)/([a-z][a-z0-9_]*)$#', $route, $m)) {
        hb_json(hb_gadget_action($m[1], $m[2], null));
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
