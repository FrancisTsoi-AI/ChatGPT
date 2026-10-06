<?php
declare(strict_types=1);

/**
 * Safe outbound HTTP for the Feeds, Weather and link-title features.
 * The URL comes from the browser, so it is treated as hostile: only http(s) on the usual ports, every
 * address the host resolves to must be public (no localhost / LAN / cloud-metadata ranges), the connection
 * is pinned to the address that was checked, redirects are followed by hand and re-checked, and the
 * download is size- and time-limited. HB_ALLOW_PRIVATE_FETCH=1 switches the address check off (tests only).
 */
function hb_fetch_allowed_private(): bool
{
    return (string) hb_cfg('HB_ALLOW_PRIVATE_FETCH', '0') === '1';
}

function hb_fetch_check_url(string $url): array
{
    $p = parse_url($url);
    if (!$p || empty($p['host']) || !in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) || isset($p['user']) || isset($p['pass'])) {
        throw new HttpError(400, 'Only plain http(s) addresses are allowed');
    }
    $scheme = strtolower($p['scheme']);
    $port = (int) ($p['port'] ?? ($scheme === 'https' ? 443 : 80));
    $host = trim(strtolower($p['host']), '[]');
    if (!hb_fetch_allowed_private() && !in_array($port, [80, 443], true)) {
        throw new HttpError(400, 'Only ports 80 and 443 are allowed');
    }
    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ips = [$host];
    } else {
        $ips = gethostbynamel($host) ?: [];
        foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $r) {
            if (!empty($r['ipv6'])) {
                $ips[] = $r['ipv6'];
            }
        }
    }
    if (!$ips) {
        throw new HttpError(502, 'Could not find that server');
    }
    if (!hb_fetch_allowed_private()) {
        foreach ($ips as $ip) {
            if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                throw new HttpError(400, 'That address is not allowed');
            }
        }
    }
    return [$scheme, $host, $port, $ips[0]];
}

/** @return array{status:int, body:string, type:string, url:string} */
function hb_fetch(string $url, int $maxBytes = 2097152, array $headers = []): array
{
    if (!function_exists('curl_init')) {
        throw new HttpError(501, 'This server has no cURL, so it cannot fetch web addresses');
    }
    for ($hop = 0; $hop < 4; $hop++) {
        [$scheme, $host, $port, $ip] = hb_fetch_check_url($url);
        $body = '';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_USERAGENT => 'HomeBase/1.0 (+personal start page)',
            CURLOPT_HTTPHEADER => array_merge(['Accept: */*'], $headers),
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_ENCODING => '',
            CURLOPT_RESOLVE => [$host . ':' . $port . ':' . (str_contains($ip, ':') ? '[' . $ip . ']' : $ip)],
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, $maxBytes) {
                $body .= $chunk;
                return strlen($body) > $maxBytes ? 0 : strlen($chunk); // 0 aborts an oversize download
            },
        ]);
        $ok = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $redirect = (string) curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        $err = curl_error($ch);
        curl_close($ch);
        if ($status >= 300 && $status < 400 && $redirect !== '') {
            $url = $redirect;
            continue;
        }
        if ($ok === false && strlen($body) <= $maxBytes) {
            throw new HttpError(502, 'Could not load that address' . ($err !== '' ? ' (' . $err . ')' : ''));
        }
        if (strlen($body) > $maxBytes) {
            throw new HttpError(413, 'That page is too large');
        }
        if ($status >= 400) {
            throw new HttpError(502, 'The site answered with an error (' . $status . ')');
        }
        return ['status' => $status, 'body' => $body, 'type' => $type, 'url' => $url];
    }
    throw new HttpError(502, 'Too many redirects');
}

/** Tiny file cache in private/storage/cache so repeated page loads do not hammer other sites. */
function hb_cache_get(string $key, int $ttl): ?string
{
    $f = hb_storage('cache') . '/' . hash('sha256', $key) . '.json';
    return is_file($f) && filemtime($f) > time() - $ttl ? (string) file_get_contents($f) : null;
}

function hb_cache_put(string $key, string $value): void
{
    $dir = hb_storage('cache');
    file_put_contents($dir . '/' . hash('sha256', $key) . '.json', $value, LOCK_EX);
    if (random_int(1, 40) === 1) { // occasional cleanup
        foreach (glob($dir . '/*.json') ?: [] as $f) {
            if (filemtime($f) < time() - 86400) {
                @unlink($f);
            }
        }
    }
}

// ---- RSS / Atom ----------------------------------------------------------------------------

function hb_clean_text(string $html, int $max): string
{
    $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = trim((string) preg_replace('/\s+/u', ' ', $t));
    return mb_strlen($t) > $max ? mb_substr($t, 0, $max - 1) . '…' : $t;
}

function hb_safe_link(string $u): string
{
    $u = trim($u);
    return preg_match('#^https?://#i', $u) ? $u : '';
}

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

// ---- page title (for the reading list) --------------------------------------------------------

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

// ---- weather (Open-Meteo: free, no key) ------------------------------------------------------

function hb_om_url(string $envKey, string $default): string
{
    return (string) hb_cfg($envKey, $default);
}

function hb_geocode(string $q): array
{
    $q = trim(mb_substr($q, 0, 80));
    if ($q === '') {
        return ['results' => []];
    }
    $url = hb_om_url('HB_OPENMETEO_GEOCODE', 'https://geocoding-api.open-meteo.com/v1/search') . '?count=6&language=en&format=json&name=' . rawurlencode($q);
    $j = json_decode(hb_fetch($url, 262144)['body'], true) ?: [];
    $out = [];
    foreach ($j['results'] ?? [] as $r) {
        $out[] = ['name' => (string) ($r['name'] ?? ''), 'region' => (string) ($r['admin1'] ?? ''), 'country' => (string) ($r['country'] ?? ''),
            'lat' => round((float) $r['latitude'], 3), 'lon' => round((float) $r['longitude'], 3)];
    }
    return ['results' => $out];
}

function hb_weather(float $lat, float $lon, string $units): array
{
    if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
        throw new HttpError(400, 'Bad coordinates');
    }
    $unit = $units === 'f' ? 'fahrenheit' : 'celsius';
    $key = sprintf('weather:%.2f:%.2f:%s', $lat, $lon, $unit);
    $cached = hb_cache_get($key, 600);
    if ($cached !== null) {
        return json_decode($cached, true);
    }
    $url = hb_om_url('HB_OPENMETEO_FORECAST', 'https://api.open-meteo.com/v1/forecast') . '?' . http_build_query([
        'latitude' => $lat, 'longitude' => $lon, 'timezone' => 'auto', 'forecast_days' => 6, 'temperature_unit' => $unit,
        'current' => 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
        'daily' => 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    ]);
    $j = json_decode(hb_fetch($url, 524288)['body'], true);
    if (!is_array($j) || !isset($j['current'])) {
        throw new HttpError(502, 'The weather service sent something unexpected');
    }
    $out = ['current' => $j['current'], 'daily' => $j['daily'] ?? [], 'units' => $j['current_units'] ?? [], 'fetched' => gmdate('Y-m-d\TH:i:s\Z')];
    hb_cache_put($key, json_encode($out));
    return $out;
}
