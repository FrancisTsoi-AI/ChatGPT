<?php
declare(strict_types=1);

/** Server actions of the YouTube playlist gadget: look up a video's or playlist's title (YouTube oEmbed). */
return [
    'info' => function (array $c): array {
        if ($c['share'] !== null) {
            throw new HttpError(403, 'Read-only');
        }
        $url = (string) ($_GET['url'] ?? '');
        if (!preg_match('#^https://(www\.|m\.|music\.)?(youtube\.com|youtu\.be)/#i', $url)) {
            throw new HttpError(400, 'Not a YouTube address');
        }
        $key = 'yt:' . $url;
        $hit = hb_cache_get($key, 86400);
        if ($hit !== null) {
            return json_decode($hit, true);
        }
        $j = json_decode(hb_fetch('https://www.youtube.com/oembed?format=json&url=' . rawurlencode($url), 262144)['body'], true);
        $out = ['title' => hb_clean_text((string) ($j['title'] ?? ''), 200), 'author' => hb_clean_text((string) ($j['author_name'] ?? ''), 100)];
        hb_cache_put($key, json_encode($out, JSON_UNESCAPED_UNICODE));
        return $out;
    },
];
