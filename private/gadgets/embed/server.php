<?php
declare(strict_types=1);

/**
 * Server actions of the Embed gadget (this folder: gadgets/embed/).
 *   check     does the site allow being shown inside another page? (X-Frame-Options / CSP frame-ancestors)
 *   snapshot  a simplified, script-free copy of a page that refuses embedding, served from Home Base
 *             under a sandbox CSP (no scripts, no forms, opaque origin) so it can never touch Home Base.
 * A share visitor may only use them for addresses that the shared scenario's embed tiles hold.
 */

function hb_embed_scope(?array $share, string $url): void
{
    if ($share !== null && !hb_share_allows_setting($share, 'embed', fn($st) => ($st['url'] ?? '') === $url)) {
        throw new HttpError(403, 'Not part of this shared page');
    }
}

/** null = embeddable as far as the headers say; otherwise a short reason. */
function hb_embed_blocked(array $headers): ?string
{
    $xfo = strtolower($headers['x-frame-options'] ?? '');
    if ($xfo !== '' && (str_contains($xfo, 'deny') || str_contains($xfo, 'sameorigin'))) {
        return 'The site sends X-Frame-Options: ' . strtoupper($xfo);
    }
    $csp = strtolower($headers['content-security-policy'] ?? '');
    if (preg_match('/frame-ancestors\s+([^;]*)/', $csp, $m)) {
        $src = trim($m[1]);
        $self = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        if ($src !== '*' && !preg_match('#(^|\s)(https:|\*\.?)(\s|$)#', $src) && ($self === '' || !str_contains($src, $self))) {
            return 'The site only allows: frame-ancestors ' . $src;
        }
    }
    return null;
}

return [
    'check' => function (array $c): array {
        $url = (string) ($_GET['url'] ?? '');
        hb_embed_scope($c['share'], $url);
        $key = 'framecheck:' . $url;
        $hit = hb_cache_get($key, 21600);
        if ($hit !== null) {
            return json_decode($hit, true);
        }
        $res = hb_fetch($url, 65536, ['Accept: text/html,*/*'], true);
        $why = hb_embed_blocked($res['headers']);
        $out = ['ok' => $why === null, 'reason' => $why, 'final' => $res['url']];
        hb_cache_put($key, json_encode($out));
        return $out;
    },
    'snapshot' => function (array $c): array {
        $url = (string) ($_GET['url'] ?? '');
        hb_embed_scope($c['share'], $url);
        $type = 'text/html; charset=utf-8';
        try {
            $res = hb_fetch($url, 3145728, ['Accept: text/html,application/xhtml+xml']);
            if (!preg_match('#^(text/html|application/xhtml\+xml)#i', $res['type'])) {
                throw new HttpError(415, 'That address is not a web page');
            }
            $html = $res['body'];
            // no auto-redirects, no scripts (the CSP below blocks them anyway), links open outside
            $html = preg_replace('#<meta[^>]+http-equiv\s*=\s*["\']?refresh[^>]*>#i', '', $html) ?? '';
            $html = preg_replace('#<script\b[^>]*>.*?</script\s*>#is', '', $html) ?? '';
            $base = '<base href="' . htmlspecialchars($res['url'], ENT_QUOTES) . '" target="_blank">';
            $html = preg_match('#<head[^>]*>#i', $html) ? preg_replace('#<head[^>]*>#i', '$0' . $base, $html, 1) : $base . $html;
            $type = preg_match('#charset=([\w-]+)#i', $res['type'], $m) ? 'text/html; charset=' . $m[1] : 'text/html';
        } catch (HttpError $e) {
            // the frame shows a short note instead of the browser's broken-page icon
            http_response_code($e->status);
            $html = '<!doctype html><meta charset="utf-8"><base target="_blank"><body style="font:14px system-ui,sans-serif;color:#666;padding:16px">'
                . '<p>Could not load a copy of this page: ' . htmlspecialchars($e->getMessage(), ENT_QUOTES) . '.</p>'
                . (preg_match('#^https?://#i', $url) ? '<p><a href="' . htmlspecialchars($url, ENT_QUOTES) . '" rel="noopener noreferrer">Open it in a new tab</a></p>' : '') . '</body>';
        }
        header_remove('X-Frame-Options');
        header('X-Frame-Options: SAMEORIGIN');
        header('Content-Type: ' . $type);
        header("Content-Security-Policy: sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; "
            . "img-src https: http: data:; style-src https: http: 'unsafe-inline'; font-src https: http: data:; media-src https:");
        header('Referrer-Policy: no-referrer');
        header('Cache-Control: ' . (http_response_code() === 200 ? 'private, max-age=600' : 'no-store'));
        echo $html;
        exit;
    },
];
