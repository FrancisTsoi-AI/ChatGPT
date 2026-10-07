<?php
declare(strict_types=1);

class HttpError extends RuntimeException
{
    public function __construct(public int $status, string $message, public array $extra = [])
    {
        parent::__construct($message);
    }
}

function hb_security_headers(bool $page = false): void
{
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header('X-Frame-Options: DENY');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    if (hb_is_https()) {
        header('Strict-Transport-Security: max-age=31536000');
    }
    if ($page) {
        header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob: https://i.ytimg.com; "
            . "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; "
            . "media-src 'self' blob:; frame-src 'self' https:; object-src 'self'; base-uri 'none'; form-action 'self'");
    }
}

function hb_json(mixed $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function hb_input(): array
{
    static $body = null;
    if ($body !== null) {
        return $body;
    }
    $raw = file_get_contents('php://input') ?: '';
    $body = [];
    if ($raw !== '') {
        $dec = json_decode($raw, true);
        if (!is_array($dec)) {
            throw new HttpError(400, 'Invalid JSON body');
        }
        $body = $dec;
    }
    return $body;
}

function hb_method(): string
{
    $m = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($m === 'POST' && !empty($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
        $o = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
        if (in_array($o, ['PATCH', 'DELETE', 'PUT'], true)) {
            return $o;
        }
    }
    return $m;
}

/** Map any uncaught error to a JSON response (details only when HB_DEBUG=1). */
function hb_handle_exception(Throwable $e): void
{
    if ($e instanceof HttpError) {
        hb_json(['error' => $e->getMessage()] + $e->extra, $e->status);
    }
    error_log('[homebase] ' . $e);
    $debug = (string) hb_cfg('HB_DEBUG', '0') === '1';
    hb_json(['error' => $debug ? $e->getMessage() : 'Server error'], 500);
}
