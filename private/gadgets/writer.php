<?php
declare(strict_types=1);

/**
 * Server actions of the Writer gadget (public/gadgets/writer/).
 *   run   serves the page a Writer holds in "HTML + JS" mode, so its scripts can run.
 *
 * Safety: the page is served under `Content-Security-Policy: sandbox allow-scripts …` WITHOUT
 * allow-same-origin, so the browser gives it an opaque origin. Its scripts cannot read Home Base's
 * cookies or pages, cannot call the API as you (no credentials, no CSRF token), and the iframe that
 * shows it is sandboxed the same way. It can load libraries from other websites (your choice).
 */
return [
    'run' => function (array $c): array {
        $id = (int) ($_GET['id'] ?? 0);
        $r = hb_q("SELECT e.* FROM entries e JOIN tiles t ON t.id = e.tile_id JOIN scenarios s ON s.id = t.scenario_id
                   WHERE e.id = ? AND e.kind = 'doc' AND t.type = 'writer'
                     AND e.deleted_at IS NULL AND t.deleted_at IS NULL AND s.deleted_at IS NULL", [$id])->fetch();
        $data = $r ? json_decode((string) $r['data'], true) : null;
        if (!$r || ($data['mode'] ?? '') !== 'web') {
            throw new HttpError(404, 'Nothing to run');
        }
        if ($c['share'] !== null && !hb_share_has_tile($c['share'], (int) $r['tile_id'])) {
            throw new HttpError(403, 'Not part of this shared page');
        }
        header_remove('X-Frame-Options');
        header('X-Frame-Options: SAMEORIGIN');
        header('Content-Type: text/html; charset=utf-8');
        header("Content-Security-Policy: sandbox allow-scripts allow-modals allow-popups allow-forms allow-downloads; "
            . "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'");
        header('Referrer-Policy: no-referrer');
        header('Cache-Control: no-store');
        echo (string) $r['a'];
        exit;
    },
];
