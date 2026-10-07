<?php
declare(strict_types=1);

/** Server actions of the Pronounce names gadget: look up IPA / recordings, and play recordings from two allowed hosts. */

const HB_PR_UA = 'User-Agent: HomeBase-Pronounce/1.0 (private start page; https://task.francistsoi.com)';

function hb_pr_name(string $q): string
{
    $q = trim(preg_replace('/\s+/u', ' ', $q) ?? '');
    $q = trim($q, " \"'“”‘’.,;:!?");
    return mb_substr($q, 0, 120);
}

/** All /…/ or […] transcriptions in a piece of plain text. */
function hb_pr_ipas(string $text): array
{
    preg_match_all('~(/[^/\n]{1,80}/|\[[^\]\n]{1,80}\])~u', $text, $m);
    return array_values(array_unique(array_map('trim', $m[1])));
}

function hb_pr_json(string $url): ?array
{
    $res = hb_fetch($url, 2097152, [HB_PR_UA, 'Accept: application/json']);
    $j = json_decode($res['body'], true);
    return is_array($j) ? $j : null;
}

/** Recording addresses inside rendered Wikimedia HTML, as https URLs, mp3 transcodes first. */
function hb_pr_audio_urls(string $html): array
{
    preg_match_all('~(?:https:)?//upload\.wikimedia\.org/wikipedia/commons/[^"\'\s<>]+?\.(?:mp3|ogg|oga|wav)~i', $html, $m);
    $out = [];
    foreach ($m[0] as $u) {
        $u = str_starts_with($u, '//') ? 'https:' . $u : $u;
        $out[] = html_entity_decode($u, ENT_QUOTES);
    }
    $out = array_values(array_unique($out));
    return array_values(array_filter($out, fn($u) => str_ends_with(strtolower($u), '.mp3'))) ?: $out;
}

function hb_pr_accent(string $text): string
{
    if (preg_match('/\b(UK|RP|Received Pronunciation|British)\b/i', $text)) {
        return 'uk';
    }
    if (preg_match('/\b(US|GA|GenAm|General American|American)\b/i', $text)) {
        return 'us';
    }
    return '';
}

function hb_pr_wiktionary(string $name): ?array
{
    $tries = array_values(array_unique([$name, mb_convert_case($name, MB_CASE_TITLE), mb_strtolower($name)]));
    foreach ($tries as $page) {
        try {
            $j = hb_pr_json('https://en.wiktionary.org/w/api.php?action=parse&format=json&prop=text&redirects=1&page=' . rawurlencode($page));
        } catch (Throwable $e) {
            continue;
        }
        $html = (string) ($j['parse']['text']['*'] ?? '');
        if ($html === '') {
            continue;
        }
        $start = strpos($html, 'id="English"');
        if ($start === false) {
            continue;
        }
        $sec = substr($html, $start);
        if (preg_match('/<h2[\s>]/', $sec, $mm, PREG_OFFSET_MATCH, 20)) {
            $sec = substr($sec, 0, $mm[0][1]);
        }
        $r = ['ipa' => '', 'uk' => '', 'us' => '', 'audio' => ['uk' => '', 'us' => ''], 'source' => 'wiktionary',
              'url' => 'https://en.wiktionary.org/wiki/' . rawurlencode(str_replace(' ', '_', $page))];
        preg_match_all('~<li[^>]*>(.*?)</li>~s', $sec, $lis);
        foreach ($lis[1] as $li) {
            $acc = hb_pr_accent(hb_clean_text($li, 300));
            if (strpos($li, 'class="IPA') !== false) {
                $ipas = hb_pr_ipas(hb_clean_text($li, 600));
                if ($ipas) {
                    if ($r['ipa'] === '') {
                        $r['ipa'] = $ipas[0];
                    }
                    if ($acc !== '' && $r[$acc] === '') {
                        $r[$acc] = $ipas[0];
                    }
                }
            }
            foreach (hb_pr_audio_urls($li) as $u) {
                $a = $acc ?: (preg_match('~/En-(uk|gb)-~i', $u) ? 'uk' : (preg_match('~/En-us-~i', $u) ? 'us' : ''));
                if ($a !== '' && $r['audio'][$a] === '') {
                    $r['audio'][$a] = $u;
                }
            }
        }
        if ($r['ipa'] !== '' || $r['audio']['uk'] !== '' || $r['audio']['us'] !== '') {
            return $r;
        }
    }
    return null;
}

function hb_pr_wikipedia(string $name): ?array
{
    $j = hb_pr_json('https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=3&srsearch=' . rawurlencode($name));
    foreach ($j['query']['search'] ?? [] as $hit) {
        $title = (string) ($hit['title'] ?? '');
        if ($title === '' || mb_stripos($title, $name) === false) {
            continue;
        }
        $p = hb_pr_json('https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&section=0&redirects=1&page=' . rawurlencode($title));
        $html = (string) ($p['parse']['text']['*'] ?? '');
        $pos = strpos($html, 'class="IPA');
        if ($pos === false) {
            continue;
        }
        $chunk = substr($html, max(0, $pos - 400), 4000);
        $text = hb_clean_text($chunk, 1500);
        $ipas = hb_pr_ipas($text);
        if (!$ipas) {
            continue;
        }
        $r = ['ipa' => $ipas[0], 'uk' => '', 'us' => '', 'audio' => ['uk' => '', 'us' => ''], 'source' => 'wikipedia',
              'url' => 'https://en.wikipedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $title)), 'title' => hb_clean_text($title, 200)];
        if (preg_match('~UK:?\s*(/[^/]{1,80}/)~u', $text, $m)) {
            $r['uk'] = $m[1];
        }
        if (preg_match('~US:?\s*(/[^/]{1,80}/)~u', $text, $m)) {
            $r['us'] = $m[1];
        }
        if (preg_match('~class="[^"]*respell[^"]*"[^>]*>(.*?)</span>\s*</span>~s', $chunk, $m) || preg_match('~class="[^"]*respell[^"]*"[^>]*>(.*?)</span>~s', $chunk, $m)) {
            $say = hb_clean_text($m[1], 120);
            if ($say !== '') {
                $r['say'] = $say;
            }
        }
        $aud = hb_pr_audio_urls($chunk);
        if ($aud) {
            $r['audio']['us'] = $aud[0];
        }
        return $r;
    }
    return null;
}

function hb_pr_dictionary(string $name): ?array
{
    if (!preg_match('/^[\p{L}\'-]+$/u', $name)) {
        return null;
    }
    $j = hb_pr_json('https://api.dictionaryapi.dev/api/v2/entries/en/' . rawurlencode(mb_strtolower($name)));
    $r = ['ipa' => '', 'uk' => '', 'us' => '', 'audio' => ['uk' => '', 'us' => ''], 'source' => 'dictionary', 'url' => ''];
    foreach ($j ?? [] as $entry) {
        if ($r['ipa'] === '' && !empty($entry['phonetic'])) {
            $r['ipa'] = hb_clean_text((string) $entry['phonetic'], 100);
        }
        foreach ($entry['phonetics'] ?? [] as $ph) {
            $t = hb_clean_text((string) ($ph['text'] ?? ''), 100);
            $au = (string) ($ph['audio'] ?? '');
            $acc = preg_match('/-uk\.mp3$/i', $au) ? 'uk' : (preg_match('/-us\.mp3$/i', $au) ? 'us' : '');
            if ($r['ipa'] === '' && $t !== '') {
                $r['ipa'] = $t;
            }
            if ($acc !== '') {
                if ($t !== '' && $r[$acc] === '') {
                    $r[$acc] = $t;
                }
                if ($r['audio'][$acc] === '' && preg_match('~^https://api\.dictionaryapi\.dev/media/~', $au)) {
                    $r['audio'][$acc] = $au;
                }
            }
        }
        $src = $entry['sourceUrls'][0] ?? '';
        if ($r['url'] === '' && is_string($src)) {
            $r['url'] = hb_safe_link($src);
        }
    }
    return ($r['ipa'] !== '' || $r['audio']['uk'] !== '' || $r['audio']['us'] !== '') ? $r : null;
}

/** Address allowed for the audio proxy, with Commons .ogg swapped for its mp3 transcode; '' if not allowed. */
function hb_pr_audio_target(string $u): string
{
    if (preg_match('~^https://api\.dictionaryapi\.dev/media/[\w./%-]+\.mp3$~i', $u)) {
        return $u;
    }
    if (preg_match('~^https://upload\.wikimedia\.org/wikipedia/commons/transcoded/[0-9a-f]/[0-9a-f]{2}/[^/?#]+/[^/?#]+\.mp3$~i', $u)) {
        return $u;
    }
    if (preg_match('~^https://upload\.wikimedia\.org/wikipedia/commons/([0-9a-f])/([0-9a-f]{2})/([^/?#]+)$~i', $u, $m)) {
        $ext = strtolower(pathinfo($m[3], PATHINFO_EXTENSION));
        if ($ext === 'mp3') {
            return $u;
        }
        if (in_array($ext, ['ogg', 'oga', 'wav'], true)) {
            return "https://upload.wikimedia.org/wikipedia/commons/transcoded/{$m[1]}/{$m[2]}/{$m[3]}/{$m[3]}.mp3";
        }
    }
    return '';
}

return [
    // GET api.php?r=g/pronounce/lookup&q=Name
    'lookup' => function (array $c): array {
        if ($c['share'] !== null) {
            throw new HttpError(403, 'Read-only');
        }
        $q = hb_pr_name((string) ($_GET['q'] ?? ''));
        if ($q === '') {
            throw new HttpError(400, 'Type a name first');
        }
        $key = 'pr:' . mb_strtolower($q);
        $hit = hb_cache_get($key, 30 * 86400);
        if ($hit !== null) {
            $j = json_decode($hit, true);
            if (is_array($j) && ($j['found'] || hb_cache_get($key, 86400) !== null)) {
                return $j;
            }
        }
        $out = ['q' => $q, 'found' => false, 'ipa' => '', 'uk' => '', 'us' => '', 'say' => '', 'audio' => ['uk' => '', 'us' => ''],
                'source' => '', 'url' => '', 'tried' => []];
        $sources = ['wiktionary' => 'hb_pr_wiktionary', 'wikipedia' => 'hb_pr_wikipedia', 'dictionary' => 'hb_pr_dictionary'];
        foreach ($sources as $label => $fn) {
            $out['tried'][] = $label;
            try {
                $r = $fn($q);
            } catch (Throwable $e) {
                $r = null;
            }
            if (!$r) {
                continue;
            }
            if ($out['ipa'] === '' && $r['ipa'] !== '') {
                $out['ipa'] = $r['ipa'];
                $out['source'] = $r['source'];
                $out['url'] = $r['url'];
            }
            foreach (['uk', 'us'] as $a) {
                if ($out[$a] === '' && $r[$a] !== '') {
                    $out[$a] = $r[$a];
                }
                if ($out['audio'][$a] === '' && $r['audio'][$a] !== '') {
                    $out['audio'][$a] = $r['audio'][$a];
                }
            }
            if ($out['say'] === '' && !empty($r['say'])) {
                $out['say'] = $r['say'];
            }
            if ($out['ipa'] !== '' && $out['uk'] !== '' && $out['us'] !== '' && $out['audio']['uk'] !== '' && $out['audio']['us'] !== '') {
                break;
            }
        }
        $out['found'] = $out['ipa'] !== '' || $out['audio']['uk'] !== '' || $out['audio']['us'] !== '';
        if ($out['source'] === '' && $out['found']) {
            $out['source'] = 'wiktionary';
        }
        hb_cache_put($key, json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $out;
    },

    // GET api.php?r=g/pronounce/audio&u=<recording url>[&tile=<id> for share visitors]
    'audio' => function (array $c): array {
        $u = (string) ($_GET['u'] ?? '');
        $target = hb_pr_audio_target($u);
        if ($target === '') {
            throw new HttpError(400, 'That recording address is not allowed');
        }
        if ($c['share'] !== null) {
            $tile = (int) ($_GET['tile'] ?? 0);
            if (!hb_share_has_tile($c['share'], $tile)) {
                throw new HttpError(403, 'Not part of this shared page');
            }
            $ok = false;
            foreach (hb_q("SELECT data FROM entries WHERE tile_id = ? AND kind = 'pron' AND deleted_at IS NULL", [$tile])->fetchAll() as $row) {
                $d = json_decode((string) ($row['data'] ?? ''), true);
                if (is_array($d) && in_array($u, array_values((array) ($d['audio'] ?? [])), true)) {
                    $ok = true;
                    break;
                }
            }
            if (!$ok) {
                throw new HttpError(403, 'Not part of this shared page');
            }
        }
        $key = 'pra:' . $target;
        $body = hb_cache_get($key, 30 * 86400);
        if ($body === null) {
            $res = hb_fetch($target, 2097152, [HB_PR_UA, 'Accept: audio/*']);
            $body = $res['body'];
            if (strpos(strtolower($res['type']), 'audio/') !== 0 && strpos(strtolower($res['type']), 'application/ogg') !== 0) {
                throw new HttpError(502, 'That address is not a recording');
            }
            hb_cache_put($key, $body);
        }
        $type = str_ends_with(strtolower($target), '.mp3') ? 'audio/mpeg' : 'audio/ogg';
        header('Content-Type: ' . $type);
        header('Content-Length: ' . strlen($body));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, max-age=86400');
        echo $body;
        exit;
    },
];
