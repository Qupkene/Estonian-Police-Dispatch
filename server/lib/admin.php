<?php

declare(strict_types=1);

/**
 * Admin panel API (/api/admin/*, the page at /admin/, docs/SERVER.md "Admin").
 *
 * Who: an account with users.role 'admin'. The role is never given over the web by default: the first admin is made
 * on the server with server/bin/admin.php, and admins can then make others. Every route also needs the panel
 * unlocked: the admin's password again (POST /api/admin/unlock), good for two hours of that session only, so a stolen
 * game cookie alone opens nothing. Writes need X-EPD like the rest of the API (CSRF), and every write is logged in
 * admin_log with the admin, the target, the details and the IP.
 *
 * What: accounts (create, rename, role, block, password, log out everywhere, login limits, delete), their cloud saves,
 * the leaderboard and daily results (list, add, edit, delete), rooms (look, close, delete, drop a result), statistics,
 * the log and database backups. A log row's target is the account it touched ("user:12"), or the room or backup. Admins cannot lock themselves out: no deleting, blocking or demoting oneself, and the
 * last admin stays.
 */

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/saves.php';
require_once __DIR__ . '/scores.php';
require_once __DIR__ . '/daily.php';
require_once __DIR__ . '/rooms.php';

/** How long an unlocked admin session stays unlocked (seconds). */
const EPD_ADMIN_UNLOCK_TTL = 2 * 3600;
const EPD_ADMIN_MAX_LIMIT = 200;
/** A generated password: no look-alikes (0/O, 1/l/I). */
const EPD_ADMIN_PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Backups the panel makes (data/varu, the same names as politsei-uuenda.sh --varunda, so its clean-up keeps them tidy). */
const EPD_ADMIN_BACKUP_PATTERN = '/^epd-[0-9]{8}T[0-9]{6}Z-[0-9a-z]+\.sqlite$/';

// ---------------------------------------------------------------- access

/**
 * The admin making the request, else 401/403. With `$unlocked` (every route but /me, /unlock and /lock) the panel must
 * have been unlocked with the password in this session within EPD_ADMIN_UNLOCK_TTL.
 *
 * @return array<string, mixed>
 */
function epd_admin_require(bool $unlocked = true): array
{
    $user = epd_require_user();
    if (($user['role'] ?? '') !== 'admin') {
        epd_fail(403, 'not_admin', 'Sul ei ole admini õigusi.');
    }
    // epd_current_user has read the session (and released its lock); $_SESSION still holds what it read.
    $until = $_SESSION['admin_until'] ?? 0;
    if ($unlocked && (!is_int($until) || $until < time())) {
        epd_fail(403, 'admin_locked', 'Kinnita oma parool, et admini paneel avada.');
    }
    return $user;
}

/**
 * Note an admin's write in admin_log.
 *
 * @param array<string, mixed> $admin
 * @param array<string, mixed> $detail
 */
function epd_admin_log(PDO $db, array $admin, string $action, string $target = '', array $detail = []): void
{
    $db->prepare('INSERT INTO admin_log (at, admin_id, admin_name, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            epd_now_ms(),
            (int) $admin['id'],
            (string) $admin['name'],
            $action,
            $target,
            $detail ? epd_json($detail) : '',
            epd_client_ip(),
        ]);
}

/** An integer query parameter within limits ($default when missing), else 400. */
function epd_admin_int_param(string $name, int $min, int $max, int $default): int
{
    $raw = $_GET[$name] ?? null;
    if ($raw === null || $raw === '') {
        return $default;
    }
    if (!is_string($raw) || strlen($raw) > 16 || preg_match('/^-?[0-9]+$/', $raw) !== 1 || (int) $raw < $min || (int) $raw > $max) {
        epd_fail(400, 'invalid_query', 'Vigane päringu väli: ' . $name . '.', [], ['field' => $name]);
    }
    return (int) $raw;
}

/** A string query parameter ('' when missing). */
function epd_admin_str_param(string $name, int $max = 64): string
{
    $raw = $_GET[$name] ?? '';
    return is_string($raw) ? mb_substr(trim($raw), 0, $max, 'UTF-8') : '';
}

/** @return array<string, mixed> */
function epd_admin_user_or_404(PDO $db, int $id): array
{
    return epd_find_user_by_id($db, $id) ?? epd_fail(404, 'user_not_found', 'Sellist kontot ei ole.');
}

/** How many admins there are. */
function epd_admin_count(PDO $db): int
{
    return (int) $db->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
}

/**
 * What the panel shows of an account.
 *
 * @param array<string, mixed> $row
 * @return array<string, mixed>
 */
function epd_admin_user_out(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'created' => (int) $row['created'],
        'lastLogin' => $row['last_login'] === null ? null : (int) $row['last_login'],
        'admin' => ($row['role'] ?? '') === 'admin',
        'disabled' => (int) ($row['disabled'] ?? 0) === 1,
    ];
}

/** End every session of an account (sessions remember the generation they were made in). */
function epd_admin_bump_sessions(PDO $db, int $userId): void
{
    $db->prepare('UPDATE users SET sess_gen = sess_gen + 1 WHERE id = ?')->execute([$userId]);
}

/** A random password of $length readable characters. */
function epd_admin_new_password(int $length = 14): string
{
    $out = '';
    $max = strlen(EPD_ADMIN_PASSWORD_ALPHABET) - 1;
    for ($i = 0; $i < $length; $i++) {
        $out .= EPD_ADMIN_PASSWORD_ALPHABET[random_int(0, $max)];
    }
    return $out;
}

/** A name for a new or renamed account, else 400 (the same rules as registration). */
function epd_admin_check_name(PDO $db, mixed $raw, ?int $exceptId = null): string
{
    $name = epd_clean_name($raw);
    if (!epd_valid_name($name)) {
        epd_fail(400, 'invalid_name', 'Nimi peab olema 3 kuni 24 märki pikk ja sisaldama ainult ladina tähti (ka õ, ä, ö, ü, š, ž), numbreid ning märke _ . -', [], ['field' => 'name']);
    }
    $other = epd_find_user_by_key($db, epd_name_key($name));
    if ($other !== null && (int) $other['id'] !== $exceptId) {
        epd_fail(409, 'name_taken', 'See nimi on juba võetud.', [], ['field' => 'name']);
    }
    return $name;
}

// ---------------------------------------------------------------- session: me, unlock, lock

/** GET /api/admin/me: the admin and whether the panel is unlocked (until when, unix ms). */
function epd_route_admin_me(): ApiReply
{
    $admin = epd_admin_require(false);
    $until = $_SESSION['admin_until'] ?? 0;
    $open = is_int($until) && $until >= time();
    return epd_reply(['user' => epd_admin_user_out($admin), 'unlocked' => $open, 'until' => $open ? $until * 1000 : null]);
}

/** POST /api/admin/unlock `{ password }`: the admin's password again opens the panel in this session for two hours. */
function epd_route_admin_unlock(): ApiReply
{
    $admin = epd_admin_require(false);
    $password = epd_json_body()['password'] ?? null;
    $db = epd_db();
    $ip = epd_client_ip();
    $nameKey = (string) $admin['name_key'];
    epd_rate_check($db, $ip, $nameKey);
    if (!is_string($password) || $password === '' || mb_strlen($password, 'UTF-8') > EPD_PASSWORD_MAX || !password_verify($password, (string) $admin['pass_hash'])) {
        epd_rate_record($db, $ip, $nameKey, 'admin');
        epd_admin_log($db, $admin, 'unlock_failed');
        epd_fail(403, 'wrong_password', 'Vale parool.', [], ['field' => 'password']);
    }
    $db->prepare("DELETE FROM login_attempts WHERE ip = ? AND name_key = ? AND kind = 'admin'")->execute([$ip, $nameKey]);
    $until = time() + EPD_ADMIN_UNLOCK_TTL;
    epd_session_open();
    // A new session id on the way up (the unlocked session is worth more than the game's).
    session_regenerate_id(true);
    $_SESSION['admin_until'] = $until;
    session_write_close();
    epd_admin_log($db, $admin, 'unlock');
    return epd_reply(['ok' => true, 'until' => $until * 1000]);
}

/** POST /api/admin/lock: close the panel in this session (the game stays logged in). */
function epd_route_admin_lock(): ApiReply
{
    epd_admin_require(false);
    epd_session_open();
    unset($_SESSION['admin_until']);
    session_write_close();
    return epd_reply(['ok' => true]);
}

// ---------------------------------------------------------------- statistics

/** GET /api/admin/stats: counts, the last 30 days by day, the best players, the database. */
function epd_route_admin_stats(): ApiReply
{
    epd_admin_require();
    $db = epd_db();
    $now = epd_now_ms();
    $one = static function (string $sql, array $args = []) use ($db): int {
        $stmt = $db->prepare($sql);
        $stmt->execute($args);
        return (int) $stmt->fetchColumn();
    };
    $day = 86400 * 1000;
    $series = static function (string $table, string $col) use ($db, $now, $day): array {
        $stmt = $db->prepare(
            "SELECT strftime('%Y-%m-%d', $col / 1000, 'unixepoch') AS d, COUNT(*) AS n FROM $table WHERE $col >= ? GROUP BY d ORDER BY d"
        );
        $stmt->execute([$now - 30 * $day]);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(string) $r['d']] = (int) $r['n'];
        }
        return $out;
    };
    $rooms = [];
    foreach ($db->query('SELECT state, COUNT(*) AS n FROM rooms GROUP BY state')->fetchAll() as $r) {
        $rooms[(string) $r['state']] = (int) $r['n'];
    }
    $top = $db->query(
        'SELECT u.id, u.name, MAX(s.score) AS best, COUNT(*) AS shifts FROM scores s JOIN users u ON u.id = s.user_id
         GROUP BY u.id ORDER BY best DESC, shifts DESC LIMIT 10'
    )->fetchAll();
    $file = epd_data_dir() . '/epd.sqlite';
    return epd_reply([
        'now' => $now,
        'users' => [
            'total' => $one('SELECT COUNT(*) FROM users'),
            'admins' => $one("SELECT COUNT(*) FROM users WHERE role = 'admin'"),
            'disabled' => $one('SELECT COUNT(*) FROM users WHERE disabled = 1'),
            'new1d' => $one('SELECT COUNT(*) FROM users WHERE created >= ?', [$now - $day]),
            'new7d' => $one('SELECT COUNT(*) FROM users WHERE created >= ?', [$now - 7 * $day]),
            'new30d' => $one('SELECT COUNT(*) FROM users WHERE created >= ?', [$now - 30 * $day]),
            'active1d' => $one('SELECT COUNT(*) FROM users WHERE last_login >= ?', [$now - $day]),
            'active7d' => $one('SELECT COUNT(*) FROM users WHERE last_login >= ?', [$now - 7 * $day]),
        ],
        'scores' => [
            'total' => $one('SELECT COUNT(*) FROM scores'),
            'last7d' => $one('SELECT COUNT(*) FROM scores WHERE at >= ?', [$now - 7 * $day]),
            'players' => $one('SELECT COUNT(DISTINCT user_id) FROM scores'),
        ],
        'daily' => [
            'total' => $one('SELECT COUNT(*) FROM daily_scores'),
            'today' => $one('SELECT COUNT(*) FROM daily_scores WHERE day = ?', [epd_daily_date($now)]),
        ],
        'rooms' => $rooms,
        'saves' => [
            'count' => $one("SELECT COUNT(*) FROM saves WHERE json <> 'null'"),
            'bytes' => $one("SELECT COALESCE(SUM(LENGTH(json)), 0) FROM saves WHERE json <> 'null'"),
        ],
        'db' => ['bytes' => is_file($file) ? (int) filesize($file) : 0, 'schema' => epd_schema_version($db)],
        'series' => ['signups' => $series('users', 'created'), 'scores' => $series('scores', 'at')],
        'top' => array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'name' => (string) $r['name'],
            'best' => (int) $r['best'],
            'shifts' => (int) $r['shifts'],
        ], $top),
    ]);
}

// ---------------------------------------------------------------- accounts

const EPD_ADMIN_USER_SORT = [
    'created' => 'u.created',
    'login' => 'u.last_login',
    'name' => 'u.name_key',
    'best' => 'best',
    'shifts' => 'shifts',
];

/** GET /api/admin/users?q=&sort=&dir=&limit=&offset=: accounts with their totals. */
function epd_route_admin_users(): ApiReply
{
    epd_admin_require();
    $db = epd_db();
    $q = epd_name_key(epd_admin_str_param('q', 24));
    $sort = EPD_ADMIN_USER_SORT[epd_admin_str_param('sort', 16)] ?? 'u.created';
    $dir = epd_admin_str_param('dir', 4) === 'asc' ? 'ASC' : 'DESC';
    $limit = epd_admin_int_param('limit', 1, EPD_ADMIN_MAX_LIMIT, 50);
    $offset = epd_admin_int_param('offset', 0, 1_000_000, 0);
    $like = '%' . strtr($q, ['\\' => '\\\\', '%' => '\\%', '_' => '\\_']) . '%';
    $where = "WHERE (? = '' OR u.name_key LIKE ? ESCAPE '\\')";
    $count = $db->prepare("SELECT COUNT(*) FROM users u $where");
    $count->execute([$q, $like]);
    $stmt = $db->prepare(
        "SELECT u.*,
            (SELECT COUNT(*) FROM scores s WHERE s.user_id = u.id) AS shifts,
            (SELECT MAX(score) FROM scores s WHERE s.user_id = u.id) AS best,
            (SELECT COUNT(*) FROM daily_scores d WHERE d.user_id = u.id) AS daily,
            (SELECT COALESCE(SUM(LENGTH(json)), 0) FROM saves v WHERE v.user_id = u.id AND v.json <> 'null') AS save_bytes
         FROM users u $where
         ORDER BY $sort $dir NULLS LAST, u.id DESC LIMIT ? OFFSET ?"
    );
    $stmt->execute([$q, $like, $limit, $offset]);
    $rows = array_map(static fn (array $r): array => epd_admin_user_out($r) + [
        'shifts' => (int) $r['shifts'],
        'best' => $r['best'] === null ? null : (int) $r['best'],
        'daily' => (int) $r['daily'],
        'saveBytes' => (int) $r['save_bytes'],
    ], $stmt->fetchAll());
    return epd_reply(['total' => (int) $count->fetchColumn(), 'users' => $rows]);
}

/** POST /api/admin/users `{ name, password?, admin? }`: a new account; with no password one is generated (shown once). */
function epd_route_admin_user_create(): ApiReply
{
    $admin = epd_admin_require();
    $body = epd_json_body();
    $db = epd_db();
    $name = epd_admin_check_name($db, $body['name'] ?? null);
    $given = $body['password'] ?? null;
    $password = $given === null || $given === '' ? epd_admin_new_password() : epd_check_password($given);
    $role = ($body['admin'] ?? false) === true ? 'admin' : '';
    $now = epd_now_ms();
    try {
        $db->prepare('INSERT INTO users (name, name_key, pass_hash, created, last_login, role) VALUES (?, ?, ?, ?, NULL, ?)')
            ->execute([$name, epd_name_key($name), epd_hash_password($password), $now, $role]);
    } catch (PDOException $e) {
        if (epd_is_unique_violation($e)) {
            epd_fail(409, 'name_taken', 'See nimi on juba võetud.', [], ['field' => 'name']);
        }
        throw $e;
    }
    $id = (int) $db->lastInsertId();
    epd_admin_log($db, $admin, 'user_create', "user:$id", ['name' => $name, 'admin' => $role === 'admin']);
    $user = epd_admin_user_or_404($db, $id);
    return epd_reply(['user' => epd_admin_user_out($user)] + ($given === null || $given === '' ? ['password' => $password] : []));
}

/** GET /api/admin/users/{id}: the account, its results, daily runs, saves, rooms and what the admins did to it. */
function epd_route_admin_user_get(string $id): ApiReply
{
    epd_admin_require();
    $db = epd_db();
    $user = epd_admin_user_or_404($db, (int) $id);
    $uid = (int) $user['id'];
    $scores = $db->prepare('SELECT * FROM scores WHERE user_id = ? ORDER BY at DESC LIMIT 200');
    $scores->execute([$uid]);
    $daily = $db->prepare('SELECT * FROM daily_scores WHERE user_id = ? ORDER BY day DESC LIMIT 200');
    $daily->execute([$uid]);
    $saves = $db->prepare("SELECT slot, updated, LENGTH(json) AS bytes, json = 'null' AS deleted FROM saves WHERE user_id = ? ORDER BY slot");
    $saves->execute([$uid]);
    $rooms = $db->prepare(
        'SELECT r.code, r.mode, r.state, r.region_id, r.created, p.seat, p.left_at, x.score
         FROM room_players p JOIN rooms r ON r.id = p.room_id LEFT JOIN room_results x ON x.room_id = r.id AND x.user_id = p.user_id
         WHERE p.user_id = ? ORDER BY r.created DESC LIMIT 50'
    );
    $rooms->execute([$uid]);
    $log = $db->prepare('SELECT * FROM admin_log WHERE target = ? ORDER BY id DESC LIMIT 50');
    $log->execute(["user:$uid"]);
    $limits = $db->prepare('SELECT COUNT(*) FROM login_attempts WHERE name_key = ? AND at > ?');
    $limits->execute([(string) $user['name_key'], time() - EPD_RATE_WINDOW]);
    return epd_reply([
        'user' => epd_admin_user_out($user),
        'loginAttempts' => (int) $limits->fetchColumn(),
        'scores' => array_map('epd_admin_score_out', $scores->fetchAll()),
        'daily' => array_map('epd_admin_daily_out', $daily->fetchAll()),
        'saves' => array_map(static fn (array $r): array => [
            'slot' => (string) $r['slot'],
            'updated' => (int) $r['updated'],
            'bytes' => (int) $r['bytes'],
            'deleted' => (int) $r['deleted'] === 1,
        ], $saves->fetchAll()),
        'rooms' => array_map(static fn (array $r): array => [
            'code' => (string) $r['code'],
            'mode' => (string) $r['mode'],
            'state' => (string) $r['state'],
            'regionId' => (string) $r['region_id'],
            'created' => (int) $r['created'],
            'seat' => (int) $r['seat'],
            'left' => $r['left_at'] !== null,
            'score' => $r['score'] === null ? null : (int) $r['score'],
        ], $rooms->fetchAll()),
        'log' => array_map('epd_admin_log_out', $log->fetchAll()),
    ]);
}

/** PATCH /api/admin/users/{id} `{ name?, admin?, disabled? }`: rename, make or unmake an admin, block or unblock. */
function epd_route_admin_user_patch(string $id): ApiReply
{
    $admin = epd_admin_require();
    $body = epd_json_body();
    $db = epd_db();
    $out = epd_transaction($db, static function (PDO $db) use ($admin, $body, $id): array {
        $user = epd_admin_user_or_404($db, (int) $id);
        $uid = (int) $user['id'];
        $self = $uid === (int) $admin['id'];
        $changes = [];
        if (array_key_exists('name', $body)) {
            $name = epd_admin_check_name($db, $body['name'], $uid);
            if ($name !== (string) $user['name']) {
                $db->prepare('UPDATE users SET name = ?, name_key = ? WHERE id = ?')->execute([$name, epd_name_key($name), $uid]);
                $changes['name'] = [(string) $user['name'], $name];
            }
        }
        if (array_key_exists('admin', $body)) {
            if (!is_bool($body['admin'])) {
                epd_fail(400, 'invalid_field', 'Vigane väli: admin.', [], ['field' => 'admin']);
            }
            $was = ($user['role'] ?? '') === 'admin';
            if ($was && !$body['admin']) {
                if ($self) {
                    epd_fail(409, 'self', 'Enda admini õigusi ei saa ära võtta.');
                }
                if (epd_admin_count($db) <= 1) {
                    epd_fail(409, 'last_admin', 'Viimane admin peab jääma.');
                }
            }
            if ($was !== $body['admin']) {
                $db->prepare('UPDATE users SET role = ? WHERE id = ?')->execute([$body['admin'] ? 'admin' : '', $uid]);
                $changes['admin'] = $body['admin'];
            }
        }
        if (array_key_exists('disabled', $body)) {
            if (!is_bool($body['disabled'])) {
                epd_fail(400, 'invalid_field', 'Vigane väli: disabled.', [], ['field' => 'disabled']);
            }
            if ($self && $body['disabled']) {
                epd_fail(409, 'self', 'Iseennast ei saa blokeerida.');
            }
            if ((int) $user['disabled'] !== ($body['disabled'] ? 1 : 0)) {
                $db->prepare('UPDATE users SET disabled = ? WHERE id = ?')->execute([$body['disabled'] ? 1 : 0, $uid]);
                // Blocked: out of every session at once.
                if ($body['disabled']) {
                    epd_admin_bump_sessions($db, $uid);
                }
                $changes['disabled'] = $body['disabled'];
            }
        }
        if ($changes) {
            epd_admin_log($db, $admin, 'user_update', "user:$uid", $changes);
        }
        return epd_admin_user_out(epd_admin_user_or_404($db, $uid));
    });
    return epd_reply(['user' => $out]);
}

/**
 * POST /api/admin/users/{id}/password `{ password? }`: a new password (given, or generated and shown once). Every
 * session of the account ends (an admin's own: all but this one) and its failed logins are forgotten.
 */
function epd_route_admin_user_password(string $id): ApiReply
{
    $admin = epd_admin_require();
    $given = epd_json_body()['password'] ?? null;
    $password = $given === null || $given === '' ? epd_admin_new_password() : epd_check_password($given);
    $db = epd_db();
    $user = epd_admin_user_or_404($db, (int) $id);
    $uid = (int) $user['id'];
    $db->prepare('UPDATE users SET pass_hash = ?, sess_gen = sess_gen + 1 WHERE id = ?')->execute([epd_hash_password($password), $uid]);
    $db->prepare('DELETE FROM login_attempts WHERE name_key = ?')->execute([(string) $user['name_key']]);
    if ($uid === (int) $admin['id']) {
        // The admin's own password: the other sessions end, this one goes on (and stays unlocked).
        epd_session_open();
        session_regenerate_id(true);
        $_SESSION['gen'] = (int) epd_admin_user_or_404($db, $uid)['sess_gen'];
        session_write_close();
    }
    epd_admin_log($db, $admin, 'user_password', "user:$uid", ['name' => (string) $user['name'], 'generated' => $given === null || $given === '']);
    return epd_reply(['ok' => true] + ($given === null || $given === '' ? ['password' => $password] : []));
}

/** POST /api/admin/users/{id}/logout: end every session of the account. */
function epd_route_admin_user_logout(string $id): ApiReply
{
    $admin = epd_admin_require();
    $db = epd_db();
    $user = epd_admin_user_or_404($db, (int) $id);
    epd_admin_bump_sessions($db, (int) $user['id']);
    epd_admin_log($db, $admin, 'user_logout', 'user:' . (int) $user['id'], ['name' => (string) $user['name']]);
    return epd_reply(['ok' => true]);
}

/** POST /api/admin/users/{id}/unlimit: forget the account's failed logins (the 15-minute login limit). */
function epd_route_admin_user_unlimit(string $id): ApiReply
{
    $admin = epd_admin_require();
    $db = epd_db();
    $user = epd_admin_user_or_404($db, (int) $id);
    $db->prepare('DELETE FROM login_attempts WHERE name_key = ?')->execute([(string) $user['name_key']]);
    epd_admin_log($db, $admin, 'user_unlimit', 'user:' . (int) $user['id'], ['name' => (string) $user['name']]);
    return epd_reply(['ok' => true]);
}

/** DELETE /api/admin/users/{id}: the account and everything that belongs to it (like DELETE /api/me). */
function epd_route_admin_user_delete(string $id): ApiReply
{
    $admin = epd_admin_require();
    $db = epd_db();
    $user = epd_admin_user_or_404($db, (int) $id);
    $uid = (int) $user['id'];
    if ($uid === (int) $admin['id']) {
        epd_fail(409, 'self', 'Iseennast siit kustutada ei saa.');
    }
    if (($user['role'] ?? '') === 'admin' && epd_admin_count($db) <= 1) {
        epd_fail(409, 'last_admin', 'Viimane admin peab jääma.');
    }
    epd_delete_user($db, $uid);
    epd_admin_log($db, $admin, 'user_delete', "user:$uid", ['name' => (string) $user['name']]);
    return epd_reply(['ok' => true]);
}

// ---------------------------------------------------------------- cloud saves

/** GET /api/admin/users/{id}/saves/{slot}: the stored JSON as is (`null` for a deleted slot), version in X-EPD-Updated. */
function epd_route_admin_save_get(string $id, string $slot): ApiReply
{
    epd_admin_require();
    epd_save_limit($slot);
    $db = epd_db();
    $user = epd_admin_user_or_404($db, (int) $id);
    $stmt = $db->prepare('SELECT json, updated FROM saves WHERE user_id = ? AND slot = ?');
    $stmt->execute([(int) $user['id'], $slot]);
    $row = $stmt->fetch();
    if (!is_array($row)) {
        epd_fail(404, 'save_not_found', 'Selles kohas salvestust ei ole.');
    }
    return new ApiReply(200, (string) $row['json'], ['X-EPD-Updated' => (string) $row['updated']]);
}

/**
 * PUT /api/admin/users/{id}/saves/{slot}: replace a save with the body (a JSON object within the slot's limit). The
 * version grows, so the player's devices take the new save the next time they sync.
 */
function epd_route_admin_save_put(string $id, string $slot): ApiReply
{
    $admin = epd_admin_require();
    $json = trim(epd_raw_body(epd_save_limit($slot)));
    if ($json === '' || $json[0] !== '{') {
        epd_fail(400, 'not_object', 'Salvestus peab olema JSON-objekt.');
    }
    if (!json_validate($json)) {
        epd_fail(400, 'bad_json', 'Vigane JSON.');
    }
    $db = epd_db();
    $user = epd_admin_user_or_404($db, (int) $id);
    $updated = epd_save_write((int) $user['id'], $slot, $json, null);
    epd_admin_log($db, $admin, 'save_put', 'user:' . (int) $user['id'], ['slot' => $slot, 'bytes' => strlen($json)]);
    return epd_reply(['ok' => true, 'updated' => $updated]);
}

/** DELETE /api/admin/users/{id}/saves/{slot}: a deletion marker, as the player's own delete writes. */
function epd_route_admin_save_delete(string $id, string $slot): ApiReply
{
    $admin = epd_admin_require();
    epd_save_limit($slot);
    $db = epd_db();
    $user = epd_admin_user_or_404($db, (int) $id);
    $updated = epd_save_write((int) $user['id'], $slot, 'null', null);
    epd_admin_log($db, $admin, 'save_delete', 'user:' . (int) $user['id'], ['slot' => $slot]);
    return epd_reply(['ok' => true, 'updated' => $updated]);
}

// ---------------------------------------------------------------- leaderboard results

/**
 * @param array<string, mixed> $r
 * @return array<string, mixed>
 */
function epd_admin_score_out(array $r): array
{
    return [
        'id' => (int) $r['id'],
        'userId' => (int) $r['user_id'],
        'name' => isset($r['name']) ? (string) $r['name'] : null,
        'regionId' => (string) $r['region_id'],
        'mode' => (string) $r['mode'],
        'difficulty' => (string) $r['difficulty'],
        'score' => (int) $r['score'],
        'grade' => (string) $r['grade'],
        'incidents' => (int) $r['incidents'],
        'arrests' => (int) $r['arrests'],
        'start' => (int) $r['start'],
        'at' => (int) $r['at'],
    ];
}

/**
 * The columns of a score from an admin's body: every field when `$all`, else only those present.
 *
 * @param array<string, mixed> $body
 * @return array<string, int|string>
 */
function epd_admin_score_fields(array $body, bool $all): array
{
    $spec = [
        'regionId' => ['region_id', static fn () => epd_enum_field($body, 'regionId', EPD_REGIONS)],
        'mode' => ['mode', static fn () => epd_enum_field($body, 'mode', EPD_MODES)],
        'difficulty' => ['difficulty', static fn () => epd_enum_field($body, 'difficulty', EPD_DIFFICULTIES)],
        'score' => ['score', static fn () => epd_number_field($body, 'score', 0, 100)],
        'grade' => ['grade', static fn () => epd_enum_field($body, 'grade', EPD_GRADES)],
        'incidents' => ['incidents', static fn () => epd_number_field($body, 'incidents', 0, 100000)],
        'arrests' => ['arrests', static fn () => epd_number_field($body, 'arrests', 0, 100000)],
        'start' => ['start', static fn () => epd_number_field($body, 'start', 0, EPD_MAX_SAFE_INT)],
        'at' => ['at', static fn () => epd_number_field($body, 'at', 0, EPD_MAX_SAFE_INT)],
    ];
    $out = [];
    foreach ($spec as $field => [$col, $read]) {
        if (array_key_exists($field, $body)) {
            $out[$col] = $read();
        } elseif ($all && !in_array($field, ['start', 'at', 'arrests'], true)) {
            epd_invalid_field($field);
        }
    }
    return $out;
}

/** GET /api/admin/scores?user=&region=&mode=&q=&sort=&limit=&offset=: every leaderboard result, newest first. */
function epd_route_admin_scores(): ApiReply
{
    epd_admin_require();
    $db = epd_db();
    [$where, $args] = epd_admin_result_filter('s');
    $mode = epd_admin_str_param('mode', 16);
    if ($mode !== '') {
        $where .= ' AND s.mode = ?';
        $args[] = $mode;
    }
    $sort = epd_admin_str_param('sort', 8) === 'score' ? 's.score DESC, s.at DESC' : 's.at DESC';
    $limit = epd_admin_int_param('limit', 1, EPD_ADMIN_MAX_LIMIT, 50);
    $offset = epd_admin_int_param('offset', 0, 10_000_000, 0);
    $count = $db->prepare("SELECT COUNT(*) FROM scores s JOIN users u ON u.id = s.user_id WHERE $where");
    $count->execute($args);
    $stmt = $db->prepare("SELECT s.*, u.name FROM scores s JOIN users u ON u.id = s.user_id WHERE $where ORDER BY $sort, s.id DESC LIMIT ? OFFSET ?");
    $stmt->execute([...$args, $limit, $offset]);
    return epd_reply(['total' => (int) $count->fetchColumn(), 'scores' => array_map('epd_admin_score_out', $stmt->fetchAll())]);
}

/**
 * The filter shared by the result lists: `user` (an id), `q` (part of a name), `region`.
 *
 * @return array{0: string, 1: list<mixed>}
 */
function epd_admin_result_filter(string $alias): array
{
    $where = '1 = 1';
    $args = [];
    $user = epd_admin_int_param('user', 0, PHP_INT_MAX, 0);
    if ($user > 0) {
        $where .= " AND $alias.user_id = ?";
        $args[] = $user;
    }
    $q = epd_name_key(epd_admin_str_param('q', 24));
    if ($q !== '') {
        $where .= " AND u.name_key LIKE ? ESCAPE '\\'";
        $args[] = '%' . strtr($q, ['\\' => '\\\\', '%' => '\\%', '_' => '\\_']) . '%';
    }
    $region = epd_admin_str_param('region', 16);
    if ($region !== '') {
        $where .= " AND $alias.region_id = ?";
        $args[] = $region;
    }
    return [$where, $args];
}

/** POST /api/admin/scores `{ userId, regionId, mode, difficulty, score, grade, incidents, arrests?, start?, at? }`. */
function epd_route_admin_score_create(): ApiReply
{
    $admin = epd_admin_require();
    $body = epd_json_body();
    $db = epd_db();
    $user = epd_admin_user_or_404($db, is_int($body['userId'] ?? null) ? $body['userId'] : 0);
    $f = epd_admin_score_fields($body, true);
    $now = epd_now_ms();
    $db->prepare(
        'INSERT INTO scores (user_id, region_id, mode, difficulty, score, grade, incidents, arrests, start, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        (int) $user['id'], $f['region_id'], $f['mode'], $f['difficulty'], $f['score'], $f['grade'], $f['incidents'],
        $f['arrests'] ?? 0, $f['start'] ?? $now, $f['at'] ?? $now,
    ]);
    $id = (int) $db->lastInsertId();
    epd_admin_log($db, $admin, 'score_create', 'user:' . (int) $user['id'], ['score' => $id] + $f);
    return epd_reply(['score' => epd_admin_score_out(epd_admin_score_or_404($db, $id))]);
}

/** @return array<string, mixed> */
function epd_admin_score_or_404(PDO $db, int $id): array
{
    $stmt = $db->prepare('SELECT s.*, u.name FROM scores s JOIN users u ON u.id = s.user_id WHERE s.id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : epd_fail(404, 'score_not_found', 'Sellist tulemust ei ole.');
}

/** PATCH /api/admin/scores/{id}: change any of the fields. */
function epd_route_admin_score_patch(string $id): ApiReply
{
    $admin = epd_admin_require();
    $body = epd_json_body();
    $db = epd_db();
    $before = epd_admin_score_or_404($db, (int) $id);
    $f = epd_admin_score_fields($body, false);
    if ($f) {
        $sets = implode(', ', array_map(static fn (string $c): string => "$c = ?", array_keys($f)));
        $db->prepare("UPDATE scores SET $sets WHERE id = ?")->execute([...array_values($f), (int) $before['id']]);
        epd_admin_log($db, $admin, 'score_update', 'user:' . (int) $before['user_id'], ['score' => (int) $before['id'], 'was' => array_intersect_key($before, $f), 'now' => $f]);
    }
    return epd_reply(['score' => epd_admin_score_out(epd_admin_score_or_404($db, (int) $id))]);
}

/** DELETE /api/admin/scores/{id}. */
function epd_route_admin_score_delete(string $id): ApiReply
{
    $admin = epd_admin_require();
    $db = epd_db();
    $row = epd_admin_score_or_404($db, (int) $id);
    $db->prepare('DELETE FROM scores WHERE id = ?')->execute([(int) $row['id']]);
    epd_admin_log($db, $admin, 'score_delete', 'user:' . (int) $row['user_id'], epd_admin_score_out($row));
    return epd_reply(['ok' => true]);
}

// ---------------------------------------------------------------- daily challenge results

/**
 * @param array<string, mixed> $r
 * @return array<string, mixed>
 */
function epd_admin_daily_out(array $r): array
{
    return [
        'id' => (int) $r['id'],
        'userId' => (int) $r['user_id'],
        'name' => isset($r['name']) ? (string) $r['name'] : null,
        'day' => (string) $r['day'],
        'regionId' => (string) $r['region_id'],
        'sector' => (string) $r['sector'],
        'score' => (int) $r['score'],
        'grade' => (string) $r['grade'],
        'incidents' => (int) $r['incidents'],
        'arrests' => (int) $r['arrests'],
        'at' => (int) $r['at'],
    ];
}

/**
 * @param array<string, mixed> $body
 * @return array<string, int|string>
 */
function epd_admin_daily_fields(array $body, bool $all): array
{
    $out = [];
    if (array_key_exists('day', $body) || $all) {
        if (!epd_daily_valid_day($body['day'] ?? null)) {
            epd_invalid_field('day');
        }
        $out['day'] = (string) $body['day'];
    }
    if (array_key_exists('sector', $body)) {
        $sector = $body['sector'];
        if (!is_string($sector) || preg_match('/^(?:[a-z0-9][a-z0-9-]{0,47})?$/', $sector) !== 1) {
            epd_invalid_field('sector');
        }
        $out['sector'] = $sector;
    }
    $spec = [
        'regionId' => ['region_id', static fn () => epd_enum_field($body, 'regionId', EPD_REGIONS)],
        'score' => ['score', static fn () => epd_number_field($body, 'score', 0, 100)],
        'grade' => ['grade', static fn () => epd_enum_field($body, 'grade', EPD_GRADES)],
        'incidents' => ['incidents', static fn () => epd_number_field($body, 'incidents', 0, 100000)],
        'arrests' => ['arrests', static fn () => epd_number_field($body, 'arrests', 0, 100000)],
        'at' => ['at', static fn () => epd_number_field($body, 'at', 0, EPD_MAX_SAFE_INT)],
    ];
    foreach ($spec as $field => [$col, $read]) {
        if (array_key_exists($field, $body)) {
            $out[$col] = $read();
        } elseif ($all && !in_array($field, ['arrests', 'at'], true)) {
            epd_invalid_field($field);
        }
    }
    return $out;
}

/** @return array<string, mixed> */
function epd_admin_daily_or_404(PDO $db, int $id): array
{
    $stmt = $db->prepare('SELECT d.*, u.name FROM daily_scores d JOIN users u ON u.id = d.user_id WHERE d.id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : epd_fail(404, 'daily_not_found', 'Sellist päeva tulemust ei ole.');
}

/** GET /api/admin/daily?day=&user=&q=&region=&limit=&offset=: daily challenge runs, best first per day. */
function epd_route_admin_daily(): ApiReply
{
    epd_admin_require();
    $db = epd_db();
    [$where, $args] = epd_admin_result_filter('d');
    $day = epd_admin_str_param('day', 10);
    if ($day !== '') {
        if (!epd_daily_valid_day($day)) {
            epd_fail(400, 'invalid_query', 'Vigane päringu väli: day.', [], ['field' => 'day']);
        }
        $where .= ' AND d.day = ?';
        $args[] = $day;
    }
    $limit = epd_admin_int_param('limit', 1, EPD_ADMIN_MAX_LIMIT, 50);
    $offset = epd_admin_int_param('offset', 0, 10_000_000, 0);
    $count = $db->prepare("SELECT COUNT(*) FROM daily_scores d JOIN users u ON u.id = d.user_id WHERE $where");
    $count->execute($args);
    $stmt = $db->prepare(
        "SELECT d.*, u.name FROM daily_scores d JOIN users u ON u.id = d.user_id WHERE $where
         ORDER BY d.day DESC, d.score DESC, d.at ASC LIMIT ? OFFSET ?"
    );
    $stmt->execute([...$args, $limit, $offset]);
    return epd_reply(['total' => (int) $count->fetchColumn(), 'daily' => array_map('epd_admin_daily_out', $stmt->fetchAll())]);
}

/** POST /api/admin/daily `{ userId, day, regionId, sector?, score, grade, incidents, arrests?, at? }` (one per player and day). */
function epd_route_admin_daily_create(): ApiReply
{
    $admin = epd_admin_require();
    $body = epd_json_body();
    $db = epd_db();
    $user = epd_admin_user_or_404($db, is_int($body['userId'] ?? null) ? $body['userId'] : 0);
    $f = epd_admin_daily_fields($body, true);
    try {
        $db->prepare(
            'INSERT INTO daily_scores (user_id, day, region_id, sector, score, grade, incidents, arrests, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            (int) $user['id'], $f['day'], $f['region_id'], $f['sector'] ?? '', $f['score'], $f['grade'], $f['incidents'],
            $f['arrests'] ?? 0, $f['at'] ?? epd_now_ms(),
        ]);
    } catch (PDOException $e) {
        if (epd_is_unique_violation($e)) {
            epd_fail(409, 'daily_exists', 'Sellel mängijal on selle päeva tulemus juba olemas: muuda seda.');
        }
        throw $e;
    }
    $id = (int) $db->lastInsertId();
    epd_admin_log($db, $admin, 'daily_create', 'user:' . (int) $user['id'], ['daily' => $id] + $f);
    return epd_reply(['daily' => epd_admin_daily_out(epd_admin_daily_or_404($db, $id))]);
}

/** PATCH /api/admin/daily/{id}: change any of the fields. */
function epd_route_admin_daily_patch(string $id): ApiReply
{
    $admin = epd_admin_require();
    $body = epd_json_body();
    $db = epd_db();
    $before = epd_admin_daily_or_404($db, (int) $id);
    $f = epd_admin_daily_fields($body, false);
    if ($f) {
        $sets = implode(', ', array_map(static fn (string $c): string => "$c = ?", array_keys($f)));
        try {
            $db->prepare("UPDATE daily_scores SET $sets WHERE id = ?")->execute([...array_values($f), (int) $before['id']]);
        } catch (PDOException $e) {
            if (epd_is_unique_violation($e)) {
                epd_fail(409, 'daily_exists', 'Sellel mängijal on selle päeva tulemus juba olemas.');
            }
            throw $e;
        }
        epd_admin_log($db, $admin, 'daily_update', 'user:' . (int) $before['user_id'], ['daily' => (int) $before['id'], 'was' => array_intersect_key($before, $f), 'now' => $f]);
    }
    return epd_reply(['daily' => epd_admin_daily_out(epd_admin_daily_or_404($db, (int) $id))]);
}

/** DELETE /api/admin/daily/{id}. */
function epd_route_admin_daily_delete(string $id): ApiReply
{
    $admin = epd_admin_require();
    $db = epd_db();
    $row = epd_admin_daily_or_404($db, (int) $id);
    $db->prepare('DELETE FROM daily_scores WHERE id = ?')->execute([(int) $row['id']]);
    epd_admin_log($db, $admin, 'daily_delete', 'user:' . (int) $row['user_id'], epd_admin_daily_out($row));
    return epd_reply(['ok' => true]);
}

// ---------------------------------------------------------------- rooms

/**
 * @param array<string, mixed> $r
 * @return array<string, mixed>
 */
function epd_admin_room_out(array $r): array
{
    return [
        'code' => (string) $r['code'],
        'mode' => (string) $r['mode'],
        'state' => (string) $r['state'],
        'regionId' => (string) $r['region_id'],
        'sector' => (string) $r['sector'],
        'difficulty' => (string) $r['difficulty'],
        'hours' => (int) $r['hours'],
        'engine' => (string) ($r['engine'] ?? ''),
        'created' => (int) $r['created'],
        'started' => $r['started'] === null ? null : (int) $r['started'],
        'updated' => (int) $r['updated'],
        'host' => isset($r['host_name']) && $r['host_name'] !== null ? (string) $r['host_name'] : null,
        'players' => isset($r['players']) ? (int) $r['players'] : null,
    ];
}

/** @return array<string, mixed> */
function epd_admin_room_or_404(PDO $db, string $code): array
{
    $clean = epd_room_clean_code($code) ?? epd_fail(404, 'room_not_found', 'Sellist ruumi ei ole.');
    return epd_room_by_code($db, $clean) ?? epd_fail(404, 'room_not_found', 'Sellist ruumi ei ole.');
}

/** GET /api/admin/rooms?state=&limit=&offset=: rooms, newest first. */
function epd_route_admin_rooms(): ApiReply
{
    epd_admin_require();
    $db = epd_db();
    $state = epd_admin_str_param('state', 16);
    $where = $state === '' ? '1 = 1' : 'r.state = ?';
    $args = $state === '' ? [] : [$state];
    $limit = epd_admin_int_param('limit', 1, EPD_ADMIN_MAX_LIMIT, 50);
    $offset = epd_admin_int_param('offset', 0, 1_000_000, 0);
    $count = $db->prepare("SELECT COUNT(*) FROM rooms r WHERE $where");
    $count->execute($args);
    $stmt = $db->prepare(
        "SELECT r.*, h.name AS host_name, (SELECT COUNT(*) FROM room_players p WHERE p.room_id = r.id AND p.left_at IS NULL) AS players
         FROM rooms r LEFT JOIN users h ON h.id = r.host_id WHERE $where ORDER BY r.created DESC LIMIT ? OFFSET ?"
    );
    $stmt->execute([...$args, $limit, $offset]);
    return epd_reply(['total' => (int) $count->fetchColumn(), 'rooms' => array_map('epd_admin_room_out', $stmt->fetchAll())]);
}

/** GET /api/admin/rooms/{code}: the room, its players and results. */
function epd_route_admin_room_get(string $code): ApiReply
{
    epd_admin_require();
    $db = epd_db();
    $room = epd_admin_room_or_404($db, $code);
    $host = $room['host_id'] === null ? null : epd_find_user_by_id($db, (int) $room['host_id']);
    $players = array_map(static fn (array $p): array => [
        'id' => (int) $p['user_id'],
        'name' => (string) $p['name'],
        'seat' => (int) $p['seat'],
        'ready' => (int) $p['ready'] === 1,
        'left' => $p['left_at'] !== null,
        'seen' => (int) $p['seen'],
        'role' => (string) $p['role'],
        'desk' => (string) $p['desk'],
    ], epd_room_players($db, (int) $room['id']));
    return epd_reply([
        'room' => epd_admin_room_out($room + ['host_name' => $host['name'] ?? null, 'players' => count(array_filter($players, static fn (array $p): bool => !$p['left']))]),
        'players' => $players,
        'results' => epd_room_results($db, (int) $room['id']),
    ]);
}

/**
 * POST /api/admin/rooms/{code}/close: a lobby or running room is closed (its co-op log goes, its members' polls see
 * it). A room on the game server keeps running there until its players leave; nothing more is sent to it.
 */
function epd_route_admin_room_close(string $code): ApiReply
{
    $admin = epd_admin_require();
    $db = epd_db();
    $room = epd_admin_room_or_404($db, $code);
    if (in_array((string) $room['state'], ['lobby', 'running'], true)) {
        epd_room_tx($db, static function (PDO $db) use ($room): void {
            epd_room_bump($db, (int) $room['id'], epd_room_now_ms(), ['state' => 'closed']);
        });
        epd_admin_log($db, $admin, 'room_close', 'room:' . (string) $room['code'], ['state' => (string) $room['state']]);
    }
    return epd_reply(['room' => epd_admin_room_out(epd_admin_room_or_404($db, $code))]);
}

/** DELETE /api/admin/rooms/{code}: the room and everything in it (the 30-day sweep's order: children first). */
function epd_route_admin_room_delete(string $code): ApiReply
{
    $admin = epd_admin_require();
    $db = epd_db();
    $room = epd_admin_room_or_404($db, $code);
    $rid = (int) $room['id'];
    epd_room_tx($db, static function (PDO $db) use ($rid): void {
        foreach (['room_commands', 'room_snapshots', 'room_results', 'room_players'] as $table) {
            $db->prepare("DELETE FROM $table WHERE room_id = ?")->execute([$rid]);
        }
        $db->prepare('DELETE FROM rooms WHERE id = ?')->execute([$rid]);
    });
    epd_admin_log($db, $admin, 'room_delete', 'room:' . (string) $room['code'], ['mode' => (string) $room['mode'], 'state' => (string) $room['state']]);
    return epd_reply(['ok' => true]);
}

/** DELETE /api/admin/rooms/{code}/results/{userId}: drop one player's result from the room's board. */
function epd_route_admin_room_result_delete(string $code, string $userId): ApiReply
{
    $admin = epd_admin_require();
    $db = epd_db();
    $room = epd_admin_room_or_404($db, $code);
    $stmt = $db->prepare('DELETE FROM room_results WHERE room_id = ? AND user_id = ?');
    $stmt->execute([(int) $room['id'], (int) $userId]);
    if ($stmt->rowCount() === 0) {
        epd_fail(404, 'result_not_found', 'Sellel mängijal ei ole selles ruumis tulemust.');
    }
    epd_room_tx($db, static function (PDO $db) use ($room): void {
        epd_room_bump($db, (int) $room['id'], epd_room_now_ms());
    });
    epd_admin_log($db, $admin, 'room_result_delete', 'room:' . (string) $room['code'], ['user' => (int) $userId]);
    return epd_reply(['ok' => true]);
}

// ---------------------------------------------------------------- the log

/**
 * @param array<string, mixed> $r
 * @return array<string, mixed>
 */
function epd_admin_log_out(array $r): array
{
    $detail = (string) $r['detail'] === '' ? null : json_decode((string) $r['detail'], true);
    return [
        'id' => (int) $r['id'],
        'at' => (int) $r['at'],
        'adminId' => $r['admin_id'] === null ? null : (int) $r['admin_id'],
        'admin' => (string) $r['admin_name'],
        'action' => (string) $r['action'],
        'target' => (string) $r['target'],
        'detail' => $detail,
        'ip' => (string) $r['ip'],
    ];
}

/** GET /api/admin/log?action=&limit=&offset=: what the admins did, newest first. */
function epd_route_admin_log(): ApiReply
{
    epd_admin_require();
    $db = epd_db();
    $action = epd_admin_str_param('action', 32);
    $where = $action === '' ? '1 = 1' : 'action = ?';
    $args = $action === '' ? [] : [$action];
    $limit = epd_admin_int_param('limit', 1, EPD_ADMIN_MAX_LIMIT, 100);
    $offset = epd_admin_int_param('offset', 0, 10_000_000, 0);
    $count = $db->prepare("SELECT COUNT(*) FROM admin_log WHERE $where");
    $count->execute($args);
    $stmt = $db->prepare("SELECT * FROM admin_log WHERE $where ORDER BY id DESC LIMIT ? OFFSET ?");
    $stmt->execute([...$args, $limit, $offset]);
    return epd_reply(['total' => (int) $count->fetchColumn(), 'log' => array_map('epd_admin_log_out', $stmt->fetchAll())]);
}

// ---------------------------------------------------------------- backups

function epd_admin_backup_dir(): string
{
    return epd_data_dir() . '/varu';
}

/** GET /api/admin/backups: the database copies in data/varu, newest first. */
function epd_route_admin_backups(): ApiReply
{
    epd_admin_require();
    $dir = epd_admin_backup_dir();
    $out = [];
    foreach (is_dir($dir) ? (scandir($dir) ?: []) : [] as $f) {
        if (preg_match(EPD_ADMIN_BACKUP_PATTERN, $f) === 1) {
            $out[] = ['name' => $f, 'bytes' => (int) filesize("$dir/$f"), 'at' => (int) filemtime("$dir/$f") * 1000];
        }
    }
    usort($out, static fn (array $a, array $b): int => strcmp($b['name'], $a['name']));
    return epd_reply(['backups' => $out]);
}

/**
 * POST /api/admin/backups: a consistent copy of the database now (VACUUM INTO a temporary file, integrity check,
 * then its final name), named like the update script's backups so its clean-up keeps the newest. One a minute.
 */
function epd_route_admin_backup_create(): ApiReply
{
    $admin = epd_admin_require();
    $db = epd_db();
    $dir = epd_admin_backup_dir();
    epd_ensure_dir($dir, 0700);
    foreach (scandir($dir) ?: [] as $f) {
        if (preg_match(EPD_ADMIN_BACKUP_PATTERN, $f) === 1 && filemtime("$dir/$f") > time() - 60) {
            epd_fail(429, 'too_soon', 'Varukoopia tehti just. Proovi minuti pärast uuesti.', ['Retry-After' => '60']);
        }
    }
    // The same margin as the update script: two database sizes and 100 MB stay free.
    $size = (int) @filesize(epd_data_dir() . '/epd.sqlite');
    $free = @disk_free_space($dir);
    if ($free !== false && $free < 2 * $size + 100 * 1024 * 1024) {
        epd_fail(507, 'disk_full', 'Kettal pole varukoopia jaoks piisavalt ruumi.');
    }
    $name = 'epd-' . gmdate('Ymd\THis\Z') . '-admin.sqlite';
    $tmp = "$dir/.$name.tmp";
    @unlink($tmp);
    $db->prepare('VACUUM INTO ?')->execute([$tmp]);
    $check = new PDO('sqlite:' . $tmp);
    $ok = $check->query('PRAGMA integrity_check')->fetchColumn();
    $check = null;
    if ($ok !== 'ok') {
        @unlink($tmp);
        epd_fail(500, 'backup_failed', 'Varukoopia kontroll ebaõnnestus.');
    }
    @chmod($tmp, 0600);
    rename($tmp, "$dir/$name");
    epd_admin_log($db, $admin, 'backup', $name, ['bytes' => (int) filesize("$dir/$name")]);
    return epd_reply(['backup' => ['name' => $name, 'bytes' => (int) filesize("$dir/$name"), 'at' => time() * 1000]]);
}
