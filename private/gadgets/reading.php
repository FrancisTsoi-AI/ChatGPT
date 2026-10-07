<?php
declare(strict_types=1);

/** Server actions of the Reading list gadget: look up a page's title when a bare link is pasted. */

function hb_page_title(string $url): array
{
    $res = hb_fetch($url, 524288, ['Accept: text/html,application/xhtml+xml']);
    $html = $res['body'];
    $title = '';
    if (preg_match('/<meta[^>]+property=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']/i', $html, $m)) {
        $title = $m[1];
    } elseif (preg_match('/<title[^>]*>(.*?)<\/title>/is', $html, $m)) {
        $title = $m[1];
    }
    return ['title' => hb_clean_text($title, 200), 'url' => $res['url']];
}

return [
    'title' => function (array $c): array {
        if ($c['share'] !== null) {
            throw new HttpError(403, 'Read-only');
        }
        return hb_page_title((string) ($_GET['url'] ?? ''));
    },
];
