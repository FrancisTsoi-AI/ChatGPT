<?php
declare(strict_types=1);

/**
 * Server actions of the News feeds gadget (this folder: gadgets/feeds/).
 * feed: fetch one RSS / Atom feed through the guarded fetcher and return clean items.
 * A share visitor may only load feeds that the shared scenario's feed tiles list.
 */

function hb_feed(string $url): array
{
    $cached = hb_cache_get('feed:' . $url, 900);
    if ($cached !== null) {
        return json_decode($cached, true);
    }
    $res = hb_fetch($url, 3145728, ['Accept: application/rss+xml, application/atom+xml, application/xml, text/xml, */*']);
    $body = $res['body'];
    if (stripos($body, '<!ENTITY') !== false) {
        throw new HttpError(400, 'That feed uses features that are not allowed');
    }
    libxml_use_internal_errors(true);
    $xml = simplexml_load_string($body, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA);
    if (!$xml) {
        throw new HttpError(422, 'That address is not an RSS or Atom feed');
    }
    $items = [];
    $title = '';
    $ns = $xml->getNamespaces(true);
    if (isset($xml->channel)) { // RSS 2.0 / RSS 0.9x
        $title = (string) $xml->channel->title;
        foreach ($xml->channel->item as $it) {
            $dc = isset($ns['dc']) ? $it->children($ns['dc']) : null;
            $items[] = [(string) $it->title, (string) $it->link, (string) ($it->pubDate ?: ($dc ? $dc->date : '')), (string) ($it->description ?: ''), (string) ($it->guid ?: $it->link)];
        }
    } elseif ($xml->getName() === 'feed') { // Atom
        $title = (string) $xml->title;
        foreach ($xml->entry as $it) {
            $link = '';
            foreach ($it->link as $l) {
                if (!isset($l['rel']) || (string) $l['rel'] === 'alternate') {
                    $link = (string) $l['href'];
                    break;
                }
            }
            $items[] = [(string) $it->title, $link, (string) ($it->updated ?: $it->published), (string) ($it->summary ?: $it->content), (string) $it->id];
        }
    } elseif ($xml->getName() === 'RDF') { // RSS 1.0
        $rdf = isset($ns['']) ? $xml->children($ns['']) : $xml;
        $title = (string) ($rdf->channel->title ?? '');
        foreach ($rdf->item as $it) {
            $dc = isset($ns['dc']) ? $it->children($ns['dc']) : null;
            $items[] = [(string) $it->title, (string) $it->link, $dc ? (string) $dc->date : '', (string) $it->description, (string) $it->link];
        }
    } else {
        throw new HttpError(422, 'That address is not an RSS or Atom feed');
    }
    $out = [];
    foreach (array_slice($items, 0, 30) as [$t, $l, $d, $s, $g]) {
        $link = hb_safe_link($l);
        $ts = $d !== '' ? strtotime($d) : false;
        $out[] = [
            'title' => hb_clean_text($t, 200) ?: '(untitled)', 'link' => $link,
            'date' => $ts ? gmdate('Y-m-d\TH:i:s\Z', $ts) : null,
            'summary' => hb_clean_text($s, 280), 'id' => substr(hash('sha256', $g !== '' ? $g : $link . $t), 0, 10),
        ];
    }
    $result = ['title' => hb_clean_text($title, 120), 'items' => $out];
    hb_cache_put('feed:' . $url, json_encode($result, JSON_UNESCAPED_UNICODE));
    return $result;
}

return [
    'feed' => function (array $c): array {
        $url = (string) ($_GET['url'] ?? '');
        if ($c['share'] !== null && !hb_share_allows_setting($c['share'], 'feeds', fn($st) => in_array($url, array_column((array) ($st['feeds'] ?? []), 'url'), true))) {
            throw new HttpError(403, 'Not part of this shared page');
        }
        return hb_feed($url);
    },
];
