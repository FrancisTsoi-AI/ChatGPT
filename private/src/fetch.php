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
    foreach ($ips as $ip) {
        // link-local / cloud-metadata addresses are refused even when the test switch is on
        $metadata = (bool) preg_match('/^(169\.254\.|fe[89ab][0-9a-f]:|fd00:ec2:)/i', $ip);
        if ($metadata || (!hb_fetch_allowed_private() && !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE))) {
            throw new HttpError(400, 'That address is not allowed');
        }
    }
    return [$scheme, $host, $port, $ips[0]];
}

/**
 * @param bool $partial true = keep the first $maxBytes and stop quietly (used when only headers or the top matter)
 * @return array{status:int, body:string, type:string, url:string, headers:array<string,string>}
 */
function hb_fetch(string $url, int $maxBytes = 2097152, array $headers = [], bool $partial = false): array
{
    if (!function_exists('curl_init')) {
        throw new HttpError(501, 'This server has no cURL, so it cannot fetch web addresses');
    }
    for ($hop = 0; $hop < 4; $hop++) {
        [$scheme, $host, $port, $ip] = hb_fetch_check_url($url);
        $body = '';
        $resp = [];
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
            CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$resp) {
                $p = strpos($line, ':');
                if ($p !== false) {
                    $resp[strtolower(trim(substr($line, 0, $p)))] = trim(substr($line, $p + 1));
                }
                return strlen($line);
            },
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
            if (!$partial) {
                throw new HttpError(413, 'That page is too large');
            }
            $body = substr($body, 0, $maxBytes);
        }
        if ($status >= 400) {
            throw new HttpError(502, 'The site answered with an error (' . $status . ')');
        }
        return ['status' => $status, 'body' => $body, 'type' => $type, 'url' => $url, 'headers' => $resp];
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
