<?php

declare(strict_types=1);

/**
 * Accounts: sessions, name and password rules, rate limits and the account routes
 * (/api/register, /api/login, /api/logout, /api/me).
 */

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/db.php';
// Account deletion clears the user's room seats (epd_rooms_forget_user); rooms.php only defines functions.
require_once __DIR__ . '/rooms.php';

const EPD_SESSION_NAME = 'EPDSESS';
/** Idle expiry of a session: 30 days. */
const EPD_SESSION_TTL = 30 * 24 * 3600;
/** The session cookie and the `seen` stamp are refreshed at most this often. */
const EPD_SESSION_TOUCH = 3600;

/** 3 to 24 characters: Latin letters, Estonian letters, digits, `_`, `.`, `-`. */
const EPD_NAME_PATTERN = '/^[A-Za-z0-9_.\-õäöüšžÕÄÖÜŠŽ]{3,24}$/u';
const EPD_PASSWORD_MIN = 8;
const EPD_PASSWORD_MAX = 256;

/** Login and register attempts: 10 per IP and name, 40 per IP, in 15 minutes. */
const EPD_RATE_WINDOW = 15 * 60;
const EPD_RATE_PER_NAME = 10;
const EPD_RATE_PER_IP = 40;

// ---------------------------------------------------------------- sessions

/** @return array{expires: int, path: string, secure: bool, httponly: bool, samesite: string} */
function epd_cookie_options(int $expires): array
{
    return ['expires' => $expires, 'path' => '/', 'secure' => epd_is_https(), 'httponly' => true, 'samesite' => 'Lax'];
}

/** Start (or resume) the PHP session with files under EPD_DATA/sessions. */
function epd_session_open(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $dir = epd_data_dir() . '/sessions';
    epd_ensure_dir($dir, 0700);
    session_start([
        'name' => EPD_SESSION_NAME,
        'save_path' => $dir,
        'use_strict_mode' => 1,
        'use_cookies' => 1,
        'cookie_lifetime' => EPD_SESSION_TTL,
        'cookie_path' => '/',
        'cookie_secure' => epd_is_https() ? 1 : 0,
        'cookie_httponly' => 1,
        'cookie_samesite' => 'Lax',
        'gc_maxlifetime' => EPD_SESSION_TTL,
        'gc_probability' => 1,
        'gc_divisor' => 100,
        'lazy_write' => 1,
        'cache_limiter' => '',
    ]);
}

function epd_has_session_cookie(): bool
{
    return is_string($_COOKIE[EPD_SESSION_NAME] ?? null) && $_COOKIE[EPD_SESSION_NAME] !== '';
}

/**
 * Log $userId in: new session id (no fixation), then release the session lock. `$gen` is the account's session
 * generation (users.sess_gen): a session of an older generation is over (a password reset, "log out everywhere").
 */
function epd_session_login(int $userId, int $gen = 0): void
{
    epd_session_open();
    session_regenerate_id(true);
    $_SESSION = ['uid' => $userId, 'seen' => time()] + ($gen > 0 ? ['gen' => $gen] : []);
    session_write_close();
}

/** Drop the session file and tell the browser to forget the cookie. */
function epd_session_destroy(): void
{
    if (!epd_has_session_cookie() && session_status() !== PHP_SESSION_ACTIVE) {
        return;
    }
    epd_session_open();
    $_SESSION = [];
    session_destroy();
    setcookie(EPD_SESSION_NAME, '', epd_cookie_options(time() - 86400));
}

/**
 * The logged-in user's row (including pass_hash and name_key), or null. Guests without a
 * cookie never create a session file.
 *
 * @return array<string, mixed>|null
 */
function epd_current_user(): ?array
{
    if (!epd_has_session_cookie()) {
        return null;
    }
    epd_session_open();
    $uid = $_SESSION['uid'] ?? null;
    $seen = $_SESSION['seen'] ?? 0;
    if (!is_int($uid) || !is_int($seen) || time() - $seen > EPD_SESSION_TTL) {
        epd_session_destroy();
        return null;
    }
    $user = epd_find_user_by_id(epd_db(), $uid);
    // A deleted or blocked account, or a session from before a password reset or "log out everywhere" (admin.php).
    $gen = $_SESSION['gen'] ?? 0;
    if ($user === null || (int) ($user['disabled'] ?? 0) === 1 || !is_int($gen) || $gen !== (int) ($user['sess_gen'] ?? 0)) {
        epd_session_destroy();
        return null;
    }
    if (time() - $seen > EPD_SESSION_TOUCH) {
        // Sliding idle expiry: keep the session and its cookie alive while the player is active.
        $_SESSION['seen'] = time();
        setcookie(EPD_SESSION_NAME, session_id(), epd_cookie_options(time() + EPD_SESSION_TTL));
    }
    session_write_close();
    return $user;
}

/**
 * The logged-in user's row, else 401. A client that names the account it expects in `X-EPD-User`
 * gets 409 `user_mismatch` when the session cookie now belongs to another account (another tab of
 * the same browser logged in as someone else), so it never writes into the wrong account.
 *
 * @return array<string, mixed>
 */
function epd_require_user(): array
{
    $user = epd_current_user() ?? epd_fail(401, 'auth_required', 'Selleks pead olema sisse logitud.');
    $expected = trim(epd_header('X-EPD-User') ?? '');
    if ($expected !== '' && $expected !== (string) $user['id']) {
        epd_fail(409, 'user_mismatch', 'Selles brauseris on vahepeal sisse logitud teine konto.');
    }
    return $user;
}

// ---------------------------------------------------------------- users

/** @return array<string, mixed>|null */
function epd_find_user_by_id(PDO $db, int $id): ?array
{
    $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

/** @return array<string, mixed>|null */
function epd_find_user_by_key(PDO $db, string $nameKey): ?array
{
    $stmt = $db->prepare('SELECT * FROM users WHERE name_key = ?');
    $stmt->execute([$nameKey]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

/**
 * What the API reveals about a user.
 *
 * @param array<string, mixed> $row
 * @return array{id: int, name: string, created: int}
 */
function epd_public_user(array $row): array
{
    return ['id' => (int) $row['id'], 'name' => (string) $row['name'], 'created' => (int) $row['created']];
}

/** Trimmed, NFC-normalised name ('' when not a string), so "õ" typed as o + tilde still matches. */
function epd_clean_name(mixed $name): string
{
    if (!is_string($name)) {
        return '';
    }
    $name = trim($name);
    if (class_exists('Normalizer')) {
        $normalized = Normalizer::normalize($name, Normalizer::FORM_C);
        $name = is_string($normalized) ? $normalized : '';
    }
    return $name;
}

function epd_valid_name(string $name): bool
{
    return preg_match(EPD_NAME_PATTERN, $name) === 1;
}

/** Case-insensitive identity of a name (Õnne and õnne are the same player). */
function epd_name_key(string $name): string
{
    return mb_strtolower($name, 'UTF-8');
}

function epd_password_algo(): string
{
    return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
}

/**
 * Hashing options: PHP's defaults, except under the built-in development server with
 * EPD_FAST_HASH=1 (the test suite), where cheap settings keep dozens of logins fast.
 * FrankenPHP is never `cli-server`, so production always uses the defaults.
 *
 * @return array<string, int>
 */
function epd_password_options(): array
{
    if (PHP_SAPI !== 'cli-server' || epd_env('EPD_FAST_HASH') !== '1') {
        return [];
    }
    return epd_password_algo() === PASSWORD_DEFAULT ? ['cost' => 4] : ['memory_cost' => 1024, 'time_cost' => 1, 'threads' => 1];
}

function epd_hash_password(string $password): string
{
    return password_hash($password, epd_password_algo(), epd_password_options());
}

/** The password if it follows the rules, else 400. */
function epd_check_password(mixed $password): string
{
    if (!is_string($password) || mb_strlen($password, 'UTF-8') < EPD_PASSWORD_MIN) {
        epd_fail(400, 'invalid_password', 'Parool peab olema vähemalt 8 märki pikk.', [], ['field' => 'password']);
    }
    if (mb_strlen($password, 'UTF-8') > EPD_PASSWORD_MAX) {
        epd_fail(400, 'invalid_password', 'Parool on liiga pikk.', [], ['field' => 'password']);
    }
    return $password;
}

/**
 * Check a login password. Unknown names still cost one hash, so response times do not
 * reveal which names exist. Old hashes are upgraded on success.
 *
 * @param array<string, mixed>|null $user
 */
function epd_verify_login(PDO $db, ?array $user, string $password): bool
{
    if ($user === null) {
        epd_hash_password($password);
        return false;
    }
    if (!password_verify($password, (string) $user['pass_hash'])) {
        return false;
    }
    if (password_needs_rehash((string) $user['pass_hash'], epd_password_algo(), epd_password_options())) {
        $stmt = $db->prepare('UPDATE users SET pass_hash = ? WHERE id = ?');
        $stmt->execute([epd_hash_password($password), $user['id']]);
    }
    return true;
}

/** Delete a user and everything that belongs to them. */
function epd_delete_user(PDO $db, int $userId): void
{
    epd_transaction($db, static function (PDO $db) use ($userId): void {
        // Rooms first: the host's role passes on and rooms nobody is left in close (server/lib/rooms.php).
        epd_rooms_forget_user($db, $userId);
        // Explicit deletes as well as ON DELETE CASCADE, so nothing is left even without foreign keys.
        $tables = [
            'DELETE FROM saves WHERE user_id = ?',
            'DELETE FROM scores WHERE user_id = ?',
            'DELETE FROM daily_scores WHERE user_id = ?',
            'DELETE FROM room_results WHERE user_id = ?',
            'DELETE FROM room_round_results WHERE user_id = ?',
            'DELETE FROM room_commands WHERE user_id = ?',
            'DELETE FROM room_snapshots WHERE user_id = ?',
            'DELETE FROM room_players WHERE user_id = ?',
            'UPDATE rooms SET host_id = NULL WHERE host_id = ?',
            'DELETE FROM users WHERE id = ?',
        ];
        foreach ($tables as $sql) {
            $db->prepare($sql)->execute([$userId]);
        }
    });
}

// ---------------------------------------------------------------- rate limits

/** 429 when this IP (or this IP and name) used up its attempts in the last 15 minutes. */
function epd_rate_check(PDO $db, string $ip, string $nameKey): void
{
    $since = time() - EPD_RATE_WINDOW;
    $byName = $db->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND name_key = ? AND at > ?');
    $byName->execute([$ip, $nameKey, $since]);
    $byIp = $db->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND at > ?');
    $byIp->execute([$ip, $since]);
    if ((int) $byName->fetchColumn() >= EPD_RATE_PER_NAME || (int) $byIp->fetchColumn() >= EPD_RATE_PER_IP) {
        epd_fail(429, 'rate_limited', 'Liiga palju katseid, proovi 15 minuti pärast uuesti.', ['Retry-After' => (string) EPD_RATE_WINDOW]);
    }
}

function epd_rate_record(PDO $db, string $ip, string $nameKey, string $kind): void
{
    $now = time();
    $db->prepare('INSERT INTO login_attempts (ip, name_key, kind, at) VALUES (?, ?, ?, ?)')->execute([$ip, $nameKey, $kind, $now]);
    $db->prepare('DELETE FROM login_attempts WHERE at < ?')->execute([$now - 86400]);
}

/** A successful login forgets the failed attempts for that IP and name. */
function epd_rate_clear(PDO $db, string $ip, string $nameKey): void
{
    $db->prepare("DELETE FROM login_attempts WHERE ip = ? AND name_key = ? AND kind = 'login'")->execute([$ip, $nameKey]);
}

/** How many $bucket events $ip had in the last $window seconds (table rate_events). */
function epd_rate_events(PDO $db, string $bucket, string $ip, int $window): int
{
    $stmt = $db->prepare('SELECT COUNT(*) FROM rate_events WHERE bucket = ? AND ip = ? AND at > ?');
    $stmt->execute([$bucket, $ip, time() - $window]);
    return (int) $stmt->fetchColumn();
}

/** Count one $bucket event for $ip. Rows older than a day are dropped on the way. */
function epd_rate_event(PDO $db, string $bucket, string $ip): void
{
    $now = time();
    $db->prepare('INSERT INTO rate_events (bucket, ip, at) VALUES (?, ?, ?)')->execute([$bucket, $ip, $now]);
    $db->prepare('DELETE FROM rate_events WHERE at < ?')->execute([$now - 86400]);
}

// ---------------------------------------------------------------- routes

function epd_route_me(): ApiReply
{
    $user = epd_current_user();
    if ($user === null) {
        return epd_reply(['user' => null]);
    }
    // An admin's game shows the way to the admin panel (/admin/); nobody else sees the key.
    return epd_reply(['user' => epd_public_user($user) + (($user['role'] ?? '') === 'admin' ? ['admin' => true] : [])]);
}

function epd_route_register(): ApiReply
{
    $body = epd_json_body();
    $name = epd_clean_name($body['name'] ?? null);
    $nameKey = epd_name_key($name);
    $db = epd_db();
    $ip = epd_client_ip();
    epd_rate_check($db, $ip, $nameKey);
    // Every registration attempt counts, successful ones too: this also caps account creation per IP.
    epd_rate_record($db, $ip, $nameKey, 'register');

    if (!epd_valid_name($name)) {
        epd_fail(400, 'invalid_name', 'Nimi peab olema 3 kuni 24 märki pikk ja sisaldama ainult ladina tähti (ka õ, ä, ö, ü, š, ž), numbreid ning märke _ . -', [], ['field' => 'name']);
    }
    $password = epd_check_password($body['password'] ?? null);
    if (epd_find_user_by_key($db, $nameKey) !== null) {
        epd_fail(409, 'name_taken', 'See nimi on juba võetud.', [], ['field' => 'name']);
    }

    $hash = epd_hash_password($password);
    $now = epd_now_ms();
    try {
        $db->prepare('INSERT INTO users (name, name_key, pass_hash, created, last_login) VALUES (?, ?, ?, ?, ?)')
            ->execute([$name, $nameKey, $hash, $now, $now]);
    } catch (PDOException $e) {
        if (epd_is_unique_violation($e)) {
            epd_fail(409, 'name_taken', 'See nimi on juba võetud.', [], ['field' => 'name']);
        }
        throw $e;
    }
    $id = (int) $db->lastInsertId();
    epd_session_login($id);
    return epd_reply(['user' => ['id' => $id, 'name' => $name, 'created' => $now]]);
}

function epd_route_login(): ApiReply
{
    $body = epd_json_body();
    $name = epd_clean_name($body['name'] ?? null);
    $password = $body['password'] ?? null;
    $nameKey = epd_name_key($name);
    $db = epd_db();
    $ip = epd_client_ip();
    epd_rate_check($db, $ip, $nameKey);

    $valid = $name !== '' && is_string($password) && $password !== '' && mb_strlen($password, 'UTF-8') <= EPD_PASSWORD_MAX;
    $user = $valid ? epd_find_user_by_key($db, $nameKey) : null;
    if (!$valid || !epd_verify_login($db, $user, (string) $password) || $user === null) {
        epd_rate_record($db, $ip, $nameKey, 'login');
        epd_fail(401, 'bad_login', 'Vale kasutajanimi või parool.');
    }

    epd_rate_clear($db, $ip, $nameKey);
    // A blocked account (admin.php) learns so only with the right password.
    if ((int) ($user['disabled'] ?? 0) === 1) {
        epd_fail(403, 'account_disabled', 'See konto on blokeeritud.');
    }
    $db->prepare('UPDATE users SET last_login = ? WHERE id = ?')->execute([epd_now_ms(), $user['id']]);
    epd_session_login((int) $user['id'], (int) ($user['sess_gen'] ?? 0));
    return epd_reply(['user' => epd_public_user($user) + (($user['role'] ?? '') === 'admin' ? ['admin' => true] : [])]);
}

function epd_route_logout(): ApiReply
{
    epd_session_destroy();
    return epd_reply(['ok' => true]);
}

/** DELETE /api/me: confirm with the current password, then remove the account and all its data. */
function epd_route_delete_me(): ApiReply
{
    $user = epd_require_user();
    $password = epd_json_body()['password'] ?? null;
    if (!is_string($password) || $password === '') {
        epd_fail(400, 'password_required', 'Kinnitamiseks sisesta oma parool.', [], ['field' => 'password']);
    }
    $db = epd_db();
    $ip = epd_client_ip();
    $nameKey = (string) $user['name_key'];
    epd_rate_check($db, $ip, $nameKey);
    if (mb_strlen($password, 'UTF-8') > EPD_PASSWORD_MAX || !password_verify($password, (string) $user['pass_hash'])) {
        epd_rate_record($db, $ip, $nameKey, 'delete');
        epd_fail(403, 'wrong_password', 'Vale parool.', [], ['field' => 'password']);
    }
    epd_delete_user($db, (int) $user['id']);
    epd_session_destroy();
    return epd_reply(['ok' => true]);
}
