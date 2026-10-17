<?php

declare(strict_types=1);

/**
 * Estonian radio speech (POST /api/tts, docs/SERVER.md 4.1): a radio line becomes a WAV clip from
 * TartuNLP Neurokõne, the University of Tartu's neural text-to-speech.
 *
 * The container has no internet of its own, only WireGuard to the relay. EPD_TTS_UPSTREAM therefore
 * points at the relay (default http://10.99.0.1/text-to-speech/v2), whose Caddy forwards the request to
 * https://api.tartunlp.ai (deploy/relee/lisa-tts.sh). The player's browser only ever talks to us.
 *
 * Every clip is cached in EPD_DATA/tts/<2 hex>/<sha256>.wav, so a line is synthesised once. Uncached
 * synthesis is rate limited per client IP; a failing upstream is remembered for a minute, so it is not
 * hammered and the API answers 503 at once. EPD_TTS_UPSTREAM=off switches synthesis off (local dev).
 */

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

const EPD_TTS_DEFAULT_UPSTREAM = 'http://10.99.0.1/text-to-speech/v2';
/** TartuNLP v2 speakers (female: mari, liivika, külli, vesta). */
const EPD_TTS_VOICES = ['mari', 'tambet', 'kalev', 'liivika', 'külli', 'meelis', 'albert', 'indrek', 'vesta', 'peeter'];
/** Accepted spellings for a speaker, mapped to the name sent upstream. */
const EPD_TTS_ALIASES = ['kylli' => 'külli', 'kulli' => 'külli'];
const EPD_TTS_MAX_CHARS = 400;
const EPD_TTS_SPEED_MIN = 0.75;
const EPD_TTS_SPEED_MAX = 1.35;
/** Seconds for connecting to the upstream and for each read from it. */
const EPD_TTS_TIMEOUT = 12.0;
/** Upper bound for one clip (400 characters are well under a minute of 22 kHz mono). */
const EPD_TTS_MAX_BYTES = 8 * 1024 * 1024;
/** Uncached syntheses per client IP and window (EPD_TTS_LIMIT overrides the count). */
const EPD_TTS_RATE_LIMIT = 150;
const EPD_TTS_RATE_WINDOW = 600;
/** A failed upstream call makes the next ones answer 503 at once for this long (seconds). */
const EPD_TTS_DOWN_FOR = 60;
/** Concurrent upstream calls (each holds a PHP worker for up to EPD_TTS_TIMEOUT). */
const EPD_TTS_SLOTS = 4;
/** Cache limit in MB (EPD_TTS_CACHE_MB overrides it); pruning goes down to 80 % of it. */
const EPD_TTS_CACHE_MB = 300;
/** About one request in this many checks the cache size. */
const EPD_TTS_PRUNE_CHANCE = 100;

/** Upstream URL, or '' when synthesis is switched off. */
function epd_tts_upstream(): string
{
    $url = trim(epd_env('EPD_TTS_UPSTREAM'));
    if ($url === '') {
        return EPD_TTS_DEFAULT_UPSTREAM;
    }
    if (strtolower($url) === 'off' || preg_match('#^https?://[^\s/]+(/\S*)?$#i', $url) !== 1) {
        return '';
    }
    return $url;
}

function epd_tts_rate_limit(): int
{
    $limit = epd_env('EPD_TTS_LIMIT');
    return ctype_digit($limit) && (int) $limit > 0 ? (int) $limit : EPD_TTS_RATE_LIMIT;
}

function epd_tts_cache_bytes(): int
{
    $mb = epd_env('EPD_TTS_CACHE_MB');
    return (ctype_digit($mb) && (int) $mb > 0 ? (int) $mb : EPD_TTS_CACHE_MB) * 1024 * 1024;
}

/** Cache directory EPD_DATA/tts (under the persistent /data mount in the container). */
function epd_tts_dir(): string
{
    $dir = epd_data_dir() . '/tts';
    epd_ensure_dir($dir, 0770);
    return $dir;
}

/** Trimmed text without control characters, NFC; 400 unless 1 to 400 characters. */
function epd_tts_text(mixed $text): string
{
    $clean = is_string($text) ? preg_replace('/[\p{Cc}\p{Cf}\x{2028}\x{2029}]+/u', ' ', $text) : null;
    if (is_string($clean) && class_exists('Normalizer')) {
        $normalized = Normalizer::normalize($clean, Normalizer::FORM_C);
        $clean = is_string($normalized) ? $normalized : null;
    }
    $clean = is_string($clean) ? trim((string) preg_replace('/\s+/u', ' ', $clean)) : '';
    $length = mb_strlen($clean, 'UTF-8');
    if ($length < 1 || $length > EPD_TTS_MAX_CHARS) {
        epd_fail(400, 'invalid_text', 'Tekst peab olema 1 kuni 400 märki.', [], ['field' => 'text']);
    }
    return $clean;
}

/** A TartuNLP speaker name (aliases resolved), else 400. */
function epd_tts_voice(mixed $voice): string
{
    $name = is_string($voice) ? mb_strtolower(trim($voice), 'UTF-8') : '';
    $name = EPD_TTS_ALIASES[$name] ?? $name;
    if (!in_array($name, EPD_TTS_VOICES, true)) {
        epd_fail(400, 'invalid_voice', 'Tundmatu hääl.', [], ['field' => 'voice']);
    }
    return $name;
}

/** Speed 0.75 to 1.35 rounded to 0.01 (default 1), else 400. */
function epd_tts_speed(mixed $speed): float
{
    if ($speed === null) {
        return 1.0;
    }
    if ((!is_int($speed) && !is_float($speed)) || !is_finite((float) $speed)
        || $speed < EPD_TTS_SPEED_MIN || $speed > EPD_TTS_SPEED_MAX) {
        epd_fail(400, 'invalid_speed', 'Kiirus peab olema 0,75 kuni 1,35.', [], ['field' => 'speed']);
    }
    return round((float) $speed, 2);
}

function epd_tts_is_wav(string $data): bool
{
    return strlen($data) > 44 && str_starts_with($data, 'RIFF') && substr($data, 8, 4) === 'WAVE';
}

/** A cached clip, or null. Old hits get a fresh mtime, so pruning removes the least used clips. */
function epd_tts_cached(string $file): ?string
{
    clearstatcache(true, $file);
    if (!is_file($file)) {
        return null;
    }
    $data = @file_get_contents($file);
    if (!is_string($data) || !epd_tts_is_wav($data)) {
        return null;
    }
    $mtime = @filemtime($file);
    if (is_int($mtime) && time() - $mtime > 86400) {
        @touch($file);
    }
    return $data;
}

/** Exclusive lock on $path, polled until $wait seconds have passed. The handle, or null. */
function epd_tts_lock(string $path, float $wait): mixed
{
    $handle = @fopen($path, 'c');
    if ($handle === false) {
        return null;
    }
    $deadline = microtime(true) + $wait;
    do {
        if (flock($handle, LOCK_EX | LOCK_NB)) {
            return $handle;
        }
        usleep(50_000);
    } while (microtime(true) < $deadline);
    fclose($handle);
    return null;
}

function epd_tts_unlock(mixed $handle): void
{
    if (is_resource($handle)) {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

/** One of the EPD_TTS_SLOTS upstream slots (waits up to 3 s), or null when all are busy. */
function epd_tts_slot(string $dir): mixed
{
    $deadline = microtime(true) + 3.0;
    do {
        for ($i = 0; $i < EPD_TTS_SLOTS; $i++) {
            $handle = @fopen($dir . '/.slot-' . $i, 'c');
            if ($handle === false) {
                return null;
            }
            if (flock($handle, LOCK_EX | LOCK_NB)) {
                return $handle;
            }
            fclose($handle);
        }
        usleep(100_000);
    } while (microtime(true) < $deadline);
    return null;
}

/** True while a recent upstream failure is remembered (EPD_DATA/tts/.down, its mtime). */
function epd_tts_is_down(string $dir): bool
{
    $file = $dir . '/.down';
    clearstatcache(true, $file);
    $mtime = @filemtime($file);
    return is_int($mtime) && time() - $mtime < EPD_TTS_DOWN_FOR;
}

function epd_tts_unavailable(): never
{
    epd_fail(503, 'tts_unavailable', 'Kõnesüntees pole praegu kättesaadav.', ['Retry-After' => (string) EPD_TTS_DOWN_FOR]);
}

/**
 * POST the line to the upstream (TartuNLP v2: JSON { text, speaker, speed }, answer audio/wav).
 * PHP streams only, the curl extension is not needed. The WAV, or null on any failure.
 */
function epd_tts_fetch(string $url, string $text, string $voice, float $speed): ?string
{
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\nAccept: audio/wav\r\nUser-Agent: EPD-politsei.eu\r\nConnection: close\r\n",
            'content' => epd_json(['text' => $text, 'speaker' => $voice, 'speed' => $speed]),
            'timeout' => EPD_TTS_TIMEOUT,
            'ignore_errors' => true,
            'follow_location' => 0,
            'protocol_version' => 1.1,
        ],
    ]);
    $body = false;
    $headers = [];
    try {
        $stream = @fopen($url, 'rb', false, $context);
        if (is_resource($stream)) {
            // ignore_errors: the stream opens for any status, the headers say which one it was.
            $headers = stream_get_meta_data($stream)['wrapper_data'] ?? [];
            $body = @stream_get_contents($stream, EPD_TTS_MAX_BYTES + 1);
            fclose($stream);
        }
    } catch (Throwable) {
        $body = false;
    }
    $status = 0;
    foreach (is_array($headers) ? $headers : [] as $line) {
        // The last status line counts (a 100 Continue may come first).
        if (is_string($line) && preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m) === 1) {
            $status = (int) $m[1];
        }
    }
    if (!is_string($body) || $status !== 200 || strlen($body) > EPD_TTS_MAX_BYTES || !epd_tts_is_wav($body)) {
        error_log(sprintf('EPD TTS: upstream failed (HTTP %d, %s bytes)', $status, is_string($body) ? (string) strlen($body) : 'no'));
        return null;
    }
    return $body;
}

/** Write $data to $file atomically: a temporary file in the same directory, then rename. */
function epd_tts_store(string $file, string $data): void
{
    $dir = dirname($file);
    $tmp = @tempnam($dir, '.tmp-');
    if (!is_string($tmp) || dirname($tmp) !== $dir) {
        if (is_string($tmp)) {
            @unlink($tmp);
        }
        return;
    }
    if (@file_put_contents($tmp, $data) === strlen($data)) {
        @chmod($tmp, 0640);
        if (@rename($tmp, $file)) {
            return;
        }
    }
    @unlink($tmp);
}

/**
 * When the cache is over its limit, delete the oldest clips (mtime) down to 80 % of it, plus
 * temporary and lock files older than an hour. Only one request prunes at a time.
 */
function epd_tts_prune(string $dir): void
{
    $lock = epd_tts_lock($dir . '/.prune', 0.0);
    if ($lock === null) {
        return;
    }
    try {
        $files = [];
        $total = 0;
        foreach (glob($dir . '/[0-9a-f][0-9a-f]', GLOB_ONLYDIR) ?: [] as $shard) {
            foreach (scandir($shard) ?: [] as $name) {
                $path = $shard . '/' . $name;
                $stat = @stat($path);
                if ($stat === false || !is_file($path)) {
                    continue;
                }
                if (str_starts_with($name, '.tmp-') || str_ends_with($name, '.lock')) {
                    // Left behind by a request that died; a live one is at most a few seconds old.
                    if (time() - $stat['mtime'] > 3600) {
                        @unlink($path);
                    }
                    continue;
                }
                if (str_ends_with($name, '.wav')) {
                    $files[] = [$stat['mtime'], $stat['size'], $path];
                    $total += $stat['size'];
                }
            }
        }
        $limit = epd_tts_cache_bytes();
        if ($total <= $limit) {
            return;
        }
        sort($files);
        $target = (int) ($limit * 0.8);
        foreach ($files as [, $size, $path]) {
            if ($total <= $target) {
                break;
            }
            if (@unlink($path)) {
                $total -= $size;
            }
        }
    } finally {
        epd_tts_unlock($lock);
    }
}

/** About one request in EPD_TTS_PRUNE_CHANCE; every request under `php -S` with EPD_TTS_PRUNE_EVERY=1 (tests). */
function epd_tts_should_prune(): bool
{
    if (PHP_SAPI === 'cli-server' && epd_env('EPD_TTS_PRUNE_EVERY') === '1') {
        return true;
    }
    return random_int(1, EPD_TTS_PRUNE_CHANCE) === 1;
}

function epd_tts_reply(string $wav, bool $hit): ApiReply
{
    return new ApiReply(200, $wav, [
        'Cache-Control' => 'private, max-age=604800',
        'Content-Length' => (string) strlen($wav),
        'X-EPD-TTS' => $hit ? 'hit' : 'miss',
    ], 'audio/wav');
}

/** POST /api/tts { text, voice, speed? } → audio/wav. */
function epd_route_tts(): ApiReply
{
    $body = epd_json_body(16 * 1024);
    $text = epd_tts_text($body['text'] ?? null);
    $voice = epd_tts_voice($body['voice'] ?? null);
    $speed = epd_tts_speed($body['speed'] ?? null);

    $root = epd_tts_dir();
    $hash = hash('sha256', $voice . '|' . sprintf('%.2f', $speed) . '|' . $text);
    $dir = $root . '/' . substr($hash, 0, 2);
    $file = $dir . '/' . $hash . '.wav';
    if (epd_tts_should_prune()) {
        epd_tts_prune($root);
    }

    $cached = epd_tts_cached($file);
    if ($cached !== null) {
        return epd_tts_reply($cached, true);
    }

    $upstream = epd_tts_upstream();
    if ($upstream === '' || epd_tts_is_down($root)) {
        epd_tts_unavailable();
    }
    $db = epd_db();
    $ip = epd_client_ip();
    if (epd_rate_events($db, 'tts', $ip, EPD_TTS_RATE_WINDOW) >= epd_tts_rate_limit()) {
        epd_fail(429, 'rate_limited', 'Liiga palju kõnepäringuid, proovi mõne minuti pärast uuesti.', ['Retry-After' => '60']);
    }

    // One upstream call per line: identical requests wait here and then read the cache.
    epd_ensure_dir($dir, 0770);
    $lockPath = $dir . '/' . $hash . '.lock';
    $lock = epd_tts_lock($lockPath, EPD_TTS_TIMEOUT + 3);
    if ($lock === null) {
        epd_tts_unavailable();
    }
    $slot = null;
    try {
        $cached = epd_tts_cached($file);
        if ($cached !== null) {
            return epd_tts_reply($cached, true);
        }
        if (epd_tts_is_down($root)) {
            epd_tts_unavailable();
        }
        $slot = epd_tts_slot($root);
        if ($slot === null) {
            epd_fail(503, 'tts_busy', 'Kõnesüntees on hõivatud, proovi kohe uuesti.', ['Retry-After' => '5']);
        }
        epd_rate_event($db, 'tts', $ip);
        $wav = epd_tts_fetch($upstream, $text, $voice, $speed);
        if ($wav === null) {
            @touch($root . '/.down');
            epd_tts_unavailable();
        }
        @unlink($root . '/.down');
        epd_tts_store($file, $wav);
        return epd_tts_reply($wav, false);
    } finally {
        epd_tts_unlock($slot);
        // Waiters that already opened this lock file re-check the cache after it; new requests find
        // the clip in the cache first, so the file can go (no lock file per clip piles up).
        @unlink($lockPath);
        epd_tts_unlock($lock);
    }
}
