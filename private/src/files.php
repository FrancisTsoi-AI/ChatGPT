<?php
declare(strict_types=1);

const HB_STORED_RE = '/^[a-f0-9]{32}$/';

function hb_unlink_stored(string $stored): void
{
    if (preg_match(HB_STORED_RE, $stored)) {
        @unlink(hb_storage('files') . '/' . $stored);
    }
}

function hb_clean_stale_uploads(): void
{
    foreach (glob(hb_storage('tmp') . '/*.part') ?: [] as $p) {
        if (filemtime($p) < time() - 86400) {
            @unlink($p);
        }
    }
}

function hb_clean_name(string $name): string
{
    $name = str_replace('\\', '/', $name);
    $name = basename($name);
    $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
    $name = trim(mb_substr($name, 0, 255));
    return $name !== '' ? $name : 'file';
}

function hb_guess_mime(string $path, string $name): string
{
    static $map = [
        'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'aac' => 'audio/aac', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg',
        'oga' => 'audio/ogg', 'opus' => 'audio/ogg', 'flac' => 'audio/flac', 'weba' => 'audio/webm',
        'pdf' => 'application/pdf', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif', 'webp' => 'image/webp', 'svg' => 'image/svg+xml', 'avif' => 'image/avif',
        'txt' => 'text/plain', 'md' => 'text/plain', 'csv' => 'text/plain', 'log' => 'text/plain',
        'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime', 'm4v' => 'video/mp4',
    ];
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (isset($map[$ext])) {
        return $map[$ext];
    }
    if (function_exists('finfo_open')) {
        $fi = finfo_open(FILEINFO_MIME_TYPE);
        $m = $fi ? finfo_file($fi, $path) : false;
        if (is_string($m) && preg_match('#^[\w.+-]+/[\w.+-]+$#', $m)) {
            return $m;
        }
    }
    return 'application/octet-stream';
}

function hb_upload_target_tile(int $tileId): array
{
    $t = hb_q('SELECT t.* FROM tiles t JOIN scenarios s ON s.id = t.scenario_id
               WHERE t.id = ? AND t.deleted_at IS NULL AND s.deleted_at IS NULL', [$tileId])->fetch();
    if (!$t || !in_array($t['type'], ['files', 'music', 'sketch'], true)) {
        throw new HttpError(400, 'Choose a Files, Music or Sketch tile to upload into');
    }
    return $t;
}

/** Move a finished file (already on disk at $path) into storage and insert its record. */
function hb_store_file(string $path, string $origName, int $tileId, bool $isUploaded, int $replaceId = 0): array
{
    $tile = hb_upload_target_tile($tileId);
    $name = hb_clean_name($origName);
    $mime = hb_guess_mime($path, $name);
    if ($tile['type'] === 'music' && !str_starts_with($mime, 'audio/')) {
        @unlink($path);
        throw new HttpError(400, "\"$name\" is not an audio file");
    }
    if ($tile['type'] === 'sketch' && $mime !== 'image/png') {
        @unlink($path);
        throw new HttpError(400, 'A sketch must be a PNG image');
    }
    $size = (int) filesize($path);
    if ($size > (int) hb_limits()['max_file']) {
        @unlink($path);
        throw new HttpError(413, 'File is larger than the allowed maximum');
    }
    $stored = bin2hex(random_bytes(16));
    $dest = hb_storage('files') . '/' . $stored;
    $ok = $isUploaded ? move_uploaded_file($path, $dest) : rename($path, $dest);
    if (!$ok) {
        throw new HttpError(500, 'Could not store the file (is private/storage/files writable?)');
    }
    @chmod($dest, 0600);
    if ($replaceId > 0) { // overwrite an existing record in place (used by the sketch tile)
        $old = hb_q('SELECT * FROM files WHERE id = ? AND tile_id = ?', [$replaceId, $tileId])->fetch();
        if (!$old || $tile['type'] !== 'sketch') {
            @unlink($dest);
            throw new HttpError(400, 'Nothing to replace');
        }
        hb_q('UPDATE files SET stored_name = ?, size = ?, type = ?, original_name = ?, deleted_at = NULL WHERE id = ?', [$stored, $size, $mime, $name, $replaceId]);
        hb_unlink_stored((string) $old['stored_name']);
        return hb_row('files', hb_get_row('files', $replaceId));
    }
    $pos = (int) hb_q('SELECT COALESCE(MAX(position), -1) + 1 p FROM files WHERE tile_id = ?', [$tileId])->fetch()['p'];
    hb_q('INSERT INTO files (tile_id, original_name, stored_name, size, type, position) VALUES (?,?,?,?,?,?)',
        [$tileId, $name, $stored, $size, $mime, $pos]);
    return hb_row('files', hb_get_row('files', (int) hb_db()->lastInsertId()));
}

function hb_upload_error_text(int $code): string
{
    return match ($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'File is bigger than the server upload limit',
        UPLOAD_ERR_PARTIAL => 'Upload was interrupted',
        UPLOAD_ERR_NO_FILE => 'No file received',
        UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE => 'Server could not write the upload',
        default => 'Upload failed',
    };
}

/** POST api.php?r=upload  — multipart: tile_id, file (or files[]). Whole files up to the PHP limit. */
function hb_handle_upload(): array
{
    $tileId = (int) ($_POST['tile_id'] ?? 0);
    $f = $_FILES['file'] ?? null;
    if (!$f) {
        throw new HttpError(400, 'No file received (it may exceed post_max_size)');
    }
    $out = [];
    $replace = (int) ($_POST['replace_id'] ?? 0);
    $names = (array) $f['name'];
    foreach ($names as $i => $n) {
        $err = (int) (((array) $f['error'])[$i] ?? UPLOAD_ERR_NO_FILE);
        if ($err !== UPLOAD_ERR_OK) {
            throw new HttpError(400, hb_upload_error_text($err));
        }
        $out[] = hb_store_file(((array) $f['tmp_name'])[$i], (string) $n, $tileId, true, $replace);
    }
    return ['files' => $out];
}

/** POST api.php?r=upload-chunk — multipart: upload_id, offset, total, name, tile_id, file(blob). */
function hb_handle_chunk(): array
{
    $uid = (string) ($_POST['upload_id'] ?? '');
    if (!preg_match('/^[a-f0-9]{16,40}$/', $uid)) {
        throw new HttpError(400, 'Bad upload id');
    }
    $offset = (int) ($_POST['offset'] ?? -1);
    $total = (int) ($_POST['total'] ?? 0);
    $tileId = (int) ($_POST['tile_id'] ?? 0);
    $name = (string) ($_POST['name'] ?? 'file');
    $f = $_FILES['file'] ?? null;
    if ($offset < 0 || $total < 1 || !$f || (int) $f['error'] !== UPLOAD_ERR_OK) {
        throw new HttpError(400, $f ? hb_upload_error_text((int) $f['error']) : 'Chunk missing');
    }
    if ($total > (int) hb_limits()['max_file']) {
        throw new HttpError(413, 'File is larger than the allowed maximum');
    }
    hb_upload_target_tile($tileId);
    $part = hb_storage('tmp') . '/' . $uid . '.part';
    $have = is_file($part) ? (int) filesize($part) : 0;
    if ($offset === 0) {
        $have = 0;
        @unlink($part);
    }
    if ($have !== $offset) {
        throw new HttpError(409, 'Chunk out of order', ['have' => $have]);
    }
    $in = fopen($f['tmp_name'], 'rb');
    $outH = fopen($part, 'ab');
    if (!$in || !$outH) {
        throw new HttpError(500, 'Could not write the upload (is private/storage/tmp writable?)');
    }
    stream_copy_to_stream($in, $outH);
    fclose($in);
    fclose($outH);
    clearstatcache(true, $part);
    $size = (int) filesize($part);
    if ($size > $total) {
        @unlink($part);
        throw new HttpError(400, 'Upload is bigger than announced');
    }
    if ($size < $total) {
        return ['done' => false, 'received' => $size];
    }
    return ['done' => true, 'file' => hb_store_file($part, $name, $tileId, false)];
}

// ---- download / inline view ------------------------------------------------------------------

function hb_serve_file(int $id, bool $download): void
{
    $r = hb_q('SELECT f.* FROM files f JOIN tiles t ON t.id = f.tile_id JOIN scenarios s ON s.id = t.scenario_id
               WHERE f.id = ? AND f.deleted_at IS NULL AND t.deleted_at IS NULL AND s.deleted_at IS NULL', [$id])->fetch();
    if (!$r || !preg_match(HB_STORED_RE, $r['stored_name'])) {
        throw new HttpError(404, 'File not found');
    }
    $path = hb_storage('files') . '/' . $r['stored_name'];
    if (!is_file($path)) {
        throw new HttpError(404, 'File is missing on disk');
    }
    session_write_close(); // do not block other requests while streaming
    $mime = (string) $r['type'];
    $inlineOk = !$download && (preg_match('#^(image|audio|video)/#', $mime) || in_array($mime, ['application/pdf', 'text/plain'], true));
    $name = (string) $r['original_name'];
    $size = (int) filesize($path);
    $etag = '"' . $r['stored_name'] . '"';

    header('X-Content-Type-Options: nosniff');
    header('Content-Type: ' . ($inlineOk ? $mime : 'application/octet-stream'));
    header('Content-Disposition: ' . ($inlineOk ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($name)
        . '; filename="' . addcslashes(preg_replace('/[^\x20-\x7E]/', '_', $name) ?? 'file', '"\\') . '"');
    header('Cache-Control: private, max-age=86400');
    header('ETag: ' . $etag);
    header('Accept-Ranges: bytes');
    if ($inlineOk && $mime !== 'application/pdf') {
        header("Content-Security-Policy: sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
    }
    header('X-Frame-Options: SAMEORIGIN');
    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
        http_response_code(304);
        exit;
    }

    $start = 0;
    $end = $size - 1;
    if (isset($_SERVER['HTTP_RANGE']) && preg_match('/^bytes=(\d*)-(\d*)$/', trim($_SERVER['HTTP_RANGE']), $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') { // suffix range: last N bytes
            $start = max(0, $size - (int) $m[2]);
        } else {
            $start = (int) $m[1];
            if ($m[2] !== '') {
                $end = min($end, (int) $m[2]);
            }
        }
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header("Content-Range: bytes */$size");
            exit;
        }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
    header('Content-Length: ' . ($end - $start + 1));
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
        exit;
    }
    @set_time_limit(0);
    $h = fopen($path, 'rb');
    fseek($h, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !feof($h) && !connection_aborted()) {
        $buf = fread($h, min(65536, $left));
        if ($buf === false || $buf === '') {
            break;
        }
        echo $buf;
        $left -= strlen($buf);
        flush();
    }
    fclose($h);
    exit;
}

// ---- backup ------------------------------------------------------------------------------

function hb_export_json(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="homebase-' . gmdate('Ymd-His') . '.json"');
    header('Cache-Control: no-store');
    echo json_encode(hb_export_data(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function hb_export_zip(): void
{
    if (!class_exists('ZipArchive')) {
        throw new HttpError(501, 'This server has no ZipArchive. Use the JSON export and copy private/storage/files by FTP.');
    }
    session_write_close();
    @set_time_limit(0);
    $tmp = tempnam(hb_storage('tmp'), 'zip');
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) {
        throw new HttpError(500, 'Could not create the zip');
    }
    $data = hb_export_data();
    $zip->addFromString('homebase.json', json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE));
    foreach ($data['files'] as $f) {
        $p = hb_storage('files') . '/' . $f['stored_name'];
        if (preg_match(HB_STORED_RE, $f['stored_name']) && is_file($p)) {
            $zip->addFile($p, 'files/' . $f['id'] . '-' . str_replace('/', '_', hb_clean_name($f['original_name'])));
        }
    }
    $zip->close();
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="homebase-' . gmdate('Ymd-His') . '.zip"');
    header('Content-Length: ' . filesize($tmp));
    header('Cache-Control: no-store');
    readfile($tmp);
    @unlink($tmp);
    exit;
}
