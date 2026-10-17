<?php

declare(strict_types=1);

/**
 * HTTP helpers shared by every route: replies and errors, request body parsing,
 * client IP and HTTPS detection behind the relay, and the CSRF guard.
 */

const EPD_JSON_FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR;

/** Default body limit for the small JSON endpoints (login, register, score, ...). */
const EPD_BODY_LIMIT = 64 * 1024;

/** A finished response: status, already encoded JSON body and extra headers. */
final class ApiReply
{
    /** @param array<string, string> $headers */
    public function __construct(
        public readonly int $status,
        public readonly string $json,
        public readonly array $headers = [],
    ) {
    }
}

/** Thrown anywhere to answer with `{ error, message }` and a fitting status. */
final class ApiError extends RuntimeException
{
    /**
     * @param array<string, string> $headers
     * @param array<string, scalar> $extra additional fields for the error body
     */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $headers = [],
        public readonly array $extra = [],
    ) {
        parent::__construct($message);
    }
}

function epd_json(mixed $data): string
{
    return json_encode($data, EPD_JSON_FLAGS);
}

/** @param array<string, string> $headers */
function epd_reply(array|object $data, int $status = 200, array $headers = []): ApiReply
{
    return new ApiReply($status, epd_json($data), $headers);
}

/**
 * @param array<string, string> $headers
 * @param array<string, scalar> $extra
 */
function epd_fail(int $status, string $code, string $message, array $headers = [], array $extra = []): never
{
    throw new ApiError($status, $code, $message, $headers, $extra);
}

function epd_error_reply(ApiError $e): ApiReply
{
    $body = ['error' => $e->errorCode, 'message' => $e->getMessage()] + $e->extra;
    return epd_reply($body, $e->status, $e->headers);
}

/** Environment variable, also looked up in $_SERVER (FrankenPHP `env` directive). */
function epd_env(string $name): string
{
    $value = getenv($name);
    if (is_string($value) && $value !== '') {
        return $value;
    }
    $server = $_SERVER[$name] ?? '';
    return is_string($server) ? $server : '';
}

function epd_now_ms(): int
{
    return (int) floor(microtime(true) * 1000);
}

/** Request method; HEAD is answered like GET (the body is dropped when sending). */
function epd_method(): string
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    return $method === 'HEAD' ? 'GET' : $method;
}

/** Path of the request without the query string and without a trailing slash. */
function epd_path(): string
{
    $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
    $path = explode('?', $uri, 2)[0];
    if (strlen($path) > 1) {
        $path = rtrim($path, '/');
    }
    return $path === '' ? '/' : $path;
}

/** A request header by its HTTP name, e.g. epd_header('X-EPD'). */
function epd_header(string $name): ?string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $value = $_SERVER[$key] ?? null;
    return is_string($value) ? $value : null;
}

function epd_too_large(): never
{
    epd_fail(413, 'too_large', 'Andmed on liiga suured.');
}

/** Raw request body, at most $limit bytes (413 above that). */
function epd_raw_body(int $limit): string
{
    $declared = (string) ($_SERVER['CONTENT_LENGTH'] ?? '');
    if ($declared !== '' && ctype_digit($declared) && (int) $declared > $limit) {
        epd_too_large();
    }
    $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
    if ($raw === false) {
        return '';
    }
    if (strlen($raw) > $limit) {
        epd_too_large();
    }
    return $raw;
}

/**
 * Body of a small JSON endpoint as an associative array. An empty body counts as `{}`.
 *
 * @return array<string, mixed>
 */
function epd_json_body(int $limit = EPD_BODY_LIMIT): array
{
    $raw = trim(epd_raw_body($limit));
    if ($raw === '') {
        return [];
    }
    if ($raw[0] !== '{') {
        epd_fail(400, 'bad_json', 'Päringu sisu peab olema JSON-objekt.');
    }
    try {
        $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        epd_fail(400, 'bad_json', 'Vigane JSON.');
    }
    return is_array($data) ? $data : [];
}

/** True when the direct peer is the relay configured in EPD_TRUSTED_PROXY. */
function epd_from_trusted_proxy(): bool
{
    $trusted = trim(epd_env('EPD_TRUSTED_PROXY'));
    return $trusted !== '' && ($_SERVER['REMOTE_ADDR'] ?? '') === $trusted;
}

/**
 * Client IP. X-Forwarded-For is only believed when the request came from the trusted
 * proxy; then the right-most entry (the address the relay itself saw) is used.
 */
function epd_client_ip(): string
{
    $peer = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    if (epd_from_trusted_proxy()) {
        $hops = explode(',', epd_header('X-Forwarded-For') ?? '');
        $last = trim((string) end($hops));
        if (filter_var($last, FILTER_VALIDATE_IP) !== false) {
            return $last;
        }
    }
    return $peer !== '' ? $peer : 'unknown';
}

/** HTTPS directly, or reported by the trusted relay (TLS ends there). */
function epd_is_https(): bool
{
    $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
    if ($https !== '' && $https !== 'off') {
        return true;
    }
    return epd_from_trusted_proxy() && strtolower(trim(epd_header('X-Forwarded-Proto') ?? '')) === 'https';
}

/**
 * Simple CSRF guard: state-changing requests must carry `X-EPD: 1`. A cross-site form
 * cannot set custom headers and a cross-site fetch with one needs a CORS preflight,
 * which this API never grants. The GitHub webhook is exempt (it is HMAC-signed).
 */
function epd_csrf_guard(string $method, string $path): void
{
    if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true) || $path === '/api/deploy-hook') {
        return;
    }
    if (trim(epd_header('X-EPD') ?? '') !== '1') {
        epd_fail(403, 'csrf', 'Keelatud päring: puudub X-EPD päis.');
    }
}

function epd_send(ApiReply $reply): void
{
    if (!headers_sent()) {
        header_remove('X-Powered-By');
        http_response_code($reply->status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        foreach ($reply->headers as $name => $value) {
            header($name . ': ' . $value);
        }
    }
    if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'HEAD') {
        echo $reply->json;
    }
}

if (!function_exists('json_validate')) {
    /** Polyfill for PHP < 8.3 (the server itself runs 8.4). */
    function json_validate(string $json, int $depth = 512, int $flags = 0): bool
    {
        json_decode($json, null, $depth, $flags);
        return json_last_error() === JSON_ERROR_NONE;
    }
}
