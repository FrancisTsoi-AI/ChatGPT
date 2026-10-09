<?php
declare(strict_types=1);

/** Server actions of the Weather gadget (Open-Meteo: free, no key). */

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

return [
    'geocode' => function (array $c): array {
        if ($c['share'] !== null) {
            throw new HttpError(403, 'Read-only');
        }
        return hb_geocode((string) ($_GET['q'] ?? ''));
    },
    'weather' => function (array $c): array {
        $lat = (float) ($_GET['lat'] ?? 0);
        $lon = (float) ($_GET['lon'] ?? 0);
        if ($c['share'] !== null && !hb_share_allows_setting($c['share'], 'weather', fn($st) => isset($st['place']['lat'])
            && abs((float) $st['place']['lat'] - $lat) < 0.001 && abs((float) $st['place']['lon'] - $lon) < 0.001)) {
            throw new HttpError(403, 'Not part of this shared page');
        }
        return hb_weather($lat, $lon, (string) ($_GET['units'] ?? 'c'));
    },
];
