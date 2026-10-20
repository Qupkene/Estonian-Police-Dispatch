<?php

declare(strict_types=1);

/**
 * Mitmikmäng (multiplayer rooms, docs/MULTIPLAYER.md). A room has a 6-character code, a lobby of up to four
 * signed-in players, the shift's options and, once the host starts it, a seed. Phase 1 plays mode `race`
 * (same-seed competition): every player runs the same shift on their own machine (src/sim/room.ts builds it
 * from the seed, the day and the options, with fixedSchedule) and sends their result once; the room's board
 * lists them. Room results never go to the normal leaderboard.
 *
 * Everything is plain HTTP: the client polls GET /api/rooms/{code}?v= about once a second while it waits, and
 * the reply is a few bytes while nothing changed (`v` = the room's revision plus who is online).
 */

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/scores.php';
require_once __DIR__ . '/daily.php';

const EPD_ROOM_MAX_PLAYERS = 4;
/** Code alphabet: capitals and digits without the look-alikes I, O, 0 and 1 (32 symbols, 32^6 codes). */
const EPD_ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EPD_ROOM_CODE_PATTERN = '/^[A-HJ-NP-Z2-9]{6}$/';
/** `race` (same-seed competition) and `role` (role co-op over the command log, coop.php) are open; `sector` comes later. */
const EPD_ROOM_MODES = ['race', 'sector', 'role'];
const EPD_ROOM_OPEN_MODES = ['race', 'role'];
const EPD_ROOM_HOURS = [2, 3, 4, 6];
const EPD_ROOM_SLOTS = ['morning', 'afternoon', 'evening', 'night'];
/** A player counts as online when their last poll is this recent (ms). */
const EPD_ROOM_ONLINE_MS = 20 * 1000;
/** `seen` is written at most this often per player (ms), so polling stays a read. */
const EPD_ROOM_SEEN_EVERY_MS = 5 * 1000;
/** A lobby nobody polled for this long closes (ms). */
const EPD_ROOM_LOBBY_IDLE_MS = 30 * 60 * 1000;
/** A running room is finished this long after its start at the latest (ms). */
const EPD_ROOM_RUN_MAX_MS = 12 * 3600 * 1000;
/** Rooms and their results are deleted this long after they were created (ms). */
const EPD_ROOM_KEEP_MS = 30 * 86400 * 1000;
/** New rooms per IP and hour. */
const EPD_ROOM_CREATE_LIMIT = 20;
const EPD_ROOM_CREATE_WINDOW = 3600;
/** Unknown or malformed codes per IP in 10 minutes (guessing codes). */
const EPD_ROOM_MISS_LIMIT = 30;
const EPD_ROOM_MISS_WINDOW = 600;

function epd_room_now_ms(): int
{
    // The daily challenge's clock: under the test server X-EPD-Test-Now sets it, everywhere else it is the real time.
    return epd_daily_now_ms();
}

/** A new random code. */
function epd_room_new_code(): string
{
    $code = '';
    for ($i = 0; $i < 6; $i++) {
        $code .= EPD_ROOM_ALPHABET[random_int(0, strlen(EPD_ROOM_ALPHABET) - 1)];
    }
    return $code;
}

/** Upper case, without spaces and dashes; null when it cannot be a code. */
function epd_room_clean_code(mixed $code): ?string
{
    if (!is_string($code)) {
        return null;
    }
    $code = strtoupper(str_replace([' ', '-'], '', trim($code)));
    return preg_match(EPD_ROOM_CODE_PATTERN, $code) === 1 ? $code : null;
}

function epd_room_invalid(string $field): never
{
    epd_fail(400, 'invalid_room', 'Vigane väli: ' . $field . '.', [], ['field' => $field]);
}

/**
 * Validated shift options of a room from a body.
 *
 * @param array<string, mixed> $body
 * @return array{region_id: string, sector: string, difficulty: string, hours: int, slot: string}
 */
function epd_room_options(array $body): array
{
    $region = $body['regionId'] ?? null;
    if (!is_string($region) || !in_array($region, EPD_REGIONS, true)) {
        epd_room_invalid('regionId');
    }
    // A sector of that prefecture ('<region>-<name>'), or '' for the whole prefecture.
    $sector = $body['sector'] ?? '';
    if (!is_string($sector) || ($sector !== '' && preg_match('/^' . $region . '-[a-z0-9][a-z0-9-]{0,40}$/', $sector) !== 1)) {
        epd_room_invalid('sector');
    }
    $difficulty = $body['difficulty'] ?? null;
    if (!is_string($difficulty) || !in_array($difficulty, EPD_DIFFICULTIES, true)) {
        epd_room_invalid('difficulty');
    }
    $hours = $body['hours'] ?? null;
    if (!is_int($hours) || !in_array($hours, EPD_ROOM_HOURS, true)) {
        epd_room_invalid('hours');
    }
    $slot = $body['slot'] ?? null;
    if (!is_string($slot) || !in_array($slot, EPD_ROOM_SLOTS, true)) {
        epd_room_invalid('slot');
    }
    return ['region_id' => $region, 'sector' => $sector, 'difficulty' => $difficulty, 'hours' => $hours, 'slot' => $slot];
}

/** @return array<string, mixed>|null */
function epd_room_by_code(PDO $db, string $code): ?array
{
    $stmt = $db->prepare('SELECT * FROM rooms WHERE code = ?');
    $stmt->execute([$code]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

/** @return array<string, mixed>|null */
function epd_room_by_id(PDO $db, int $id): ?array
{
    $stmt = $db->prepare('SELECT * FROM rooms WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

/**
 * Players of a room with their names, by seat.
 *
 * @return list<array<string, mixed>>
 */
function epd_room_players(PDO $db, int $roomId): array
{
    $stmt = $db->prepare(
        'SELECT p.user_id, p.seat, p.ready, p.joined, p.seen, p.left_at, p.role, u.name
         FROM room_players p JOIN users u ON u.id = p.user_id
         WHERE p.room_id = ? ORDER BY p.seat'
    );
    $stmt->execute([$roomId]);
    return $stmt->fetchAll();
}

/** @return array<string, mixed>|null */
function epd_room_member(PDO $db, int $roomId, int $userId): ?array
{
    $stmt = $db->prepare('SELECT * FROM room_players WHERE room_id = ? AND user_id = ?');
    $stmt->execute([$roomId, $userId]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

/**
 * Note a change: the revision grows, so every poller fetches the room again. A room that finishes or closes loses its
 * co-op command log and snapshot (coop.php): they exist only while it runs.
 */
function epd_room_bump(PDO $db, int $roomId, int $now, array $set = []): void
{
    if (in_array($set['state'] ?? null, ['finished', 'closed'], true)) {
        epd_coop_forget_room($db, $roomId);
    }
    $cols = ['rev = rev + 1', 'updated = :now'];
    $params = [':now' => $now, ':id' => $roomId];
    foreach ($set as $col => $value) {
        $cols[] = "$col = :$col";
        $params[":$col"] = $value;
    }
    $db->prepare('UPDATE rooms SET ' . implode(', ', $cols) . ' WHERE id = :id')->execute($params);
}

/**
 * The room after its time rules: a lobby nobody polled for 30 minutes closes, a running room is finished 12 hours
 * after its start. Returns the (re-read) row.
 *
 * @param array<string, mixed> $room
 * @return array<string, mixed>
 */
function epd_room_refresh(PDO $db, array $room, int $now): array
{
    $next = null;
    if ($room['state'] === 'lobby') {
        $stmt = $db->prepare('SELECT MAX(seen) FROM room_players WHERE room_id = ? AND left_at IS NULL');
        $stmt->execute([$room['id']]);
        $seen = (int) $stmt->fetchColumn();
        if (max($seen, (int) $room['updated']) < $now - EPD_ROOM_LOBBY_IDLE_MS) {
            $next = 'closed';
        }
    } elseif ($room['state'] === 'running' && (int) $room['started'] < $now - EPD_ROOM_RUN_MAX_MS) {
        $next = 'finished';
    } elseif ($room['state'] === 'running' && epd_coop_is_coop($room)) {
        // A shared shift nobody has polled for 15 minutes is over.
        $stmt = $db->prepare('SELECT MAX(seen) FROM room_players WHERE room_id = ?');
        $stmt->execute([$room['id']]);
        if (max((int) $stmt->fetchColumn(), (int) $room['started']) < $now - EPD_COOP_IDLE_MS) {
            $next = 'finished';
        }
    }
    if ($next === null) {
        return $room;
    }
    epd_room_bump($db, (int) $room['id'], $now, ['state' => $next]);
    return epd_room_by_id($db, (int) $room['id']) ?? $room;
}

/**
 * Results of a room, best first, each with its place (1 + the number of strictly higher scores).
 *
 * @return list<array{id: int, name: string, score: int, grade: string, incidents: int, arrests: int, xp: int, at: int, rank: int}>
 */
function epd_room_results(PDO $db, int $roomId): array
{
    $stmt = $db->prepare(
        'SELECT r.user_id, u.name, r.score, r.grade, r.incidents, r.arrests, r.xp, r.at,
                RANK() OVER (ORDER BY r.score DESC) AS rank
         FROM room_results r JOIN users u ON u.id = r.user_id
         WHERE r.room_id = ?
         ORDER BY r.score DESC, r.at ASC'
    );
    $stmt->execute([$roomId]);
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $out[] = [
            'id' => (int) $r['user_id'],
            'name' => (string) $r['name'],
            'score' => (int) $r['score'],
            'grade' => (string) $r['grade'],
            'incidents' => (int) $r['incidents'],
            'arrests' => (int) $r['arrests'],
            'xp' => (int) $r['xp'],
            'at' => (int) $r['at'],
            'rank' => (int) $r['rank'],
        ];
    }
    return $out;
}

/**
 * Seats of the players online now, as a bit mask (part of `v`).
 *
 * @param list<array<string, mixed>> $players
 */
function epd_room_online_mask(array $players, int $now): int
{
    $mask = 0;
    foreach ($players as $p) {
        if ($p['left_at'] === null && (int) $p['seen'] >= $now - EPD_ROOM_ONLINE_MS) {
            $mask |= 1 << (int) $p['seat'];
        }
    }
    return $mask;
}

/** The poll tag: the revision and who is online. Equal tags mean an equal room for the caller. */
function epd_room_tag(array $room, array $players, int $now): string
{
    return $room['rev'] . '.' . epd_room_online_mask($players, $now);
}

/**
 * What a member sees of a room.
 *
 * @param array<string, mixed> $room
 * @return array<string, mixed>
 */
function epd_room_public(PDO $db, array $room, int $userId, int $now): array
{
    $players = epd_room_players($db, (int) $room['id']);
    $results = epd_room_results($db, (int) $room['id']);
    $done = array_column($results, 'id');
    $host = $room['host_id'] === null ? null : (int) $room['host_id'];
    $list = [];
    foreach ($players as $p) {
        $id = (int) $p['user_id'];
        $list[] = [
            'id' => $id,
            'name' => (string) $p['name'],
            'seat' => (int) $p['seat'],
            'host' => $id === $host,
            // The host is always ready; the others say so themselves.
            'ready' => $id === $host || (int) $p['ready'] === 1,
            'online' => $p['left_at'] === null && (int) $p['seen'] >= $now - EPD_ROOM_ONLINE_MS,
            'left' => $p['left_at'] !== null,
            'done' => in_array($id, $done, true),
            // Role co-op: the role chosen in the lobby, or the seat's default (coop.php).
            'role' => epd_coop_role_of($p),
        ];
    }
    $running = $room['state'] !== 'lobby';
    return [
        'code' => (string) $room['code'],
        'mode' => (string) $room['mode'],
        'state' => (string) $room['state'],
        'v' => epd_room_tag($room, $players, $now),
        'host' => $host,
        'me' => $userId,
        'max' => EPD_ROOM_MAX_PLAYERS,
        'options' => [
            'regionId' => (string) $room['region_id'],
            'sector' => (string) $room['sector'],
            'difficulty' => (string) $room['difficulty'],
            'hours' => (int) $room['hours'],
            'slot' => (string) $room['slot'],
        ],
        // The seed and the day only once the shift is on: nobody can play it before the others.
        'seed' => $running ? (int) $room['seed'] : null,
        'day' => $running ? (string) $room['day'] : null,
        'created' => (int) $room['created'],
        'started' => $room['started'] === null ? null : (int) $room['started'],
        'players' => $list,
        'results' => $results,
    ];
}

/** Seats taken by players who are still in the room. */
function epd_room_count(PDO $db, int $roomId): int
{
    $stmt = $db->prepare('SELECT COUNT(*) FROM room_players WHERE room_id = ? AND left_at IS NULL');
    $stmt->execute([$roomId]);
    return (int) $stmt->fetchColumn();
}

/**
 * $userId leaves $room: from a lobby the seat is freed, from a running room the player stays on the board as
 * having left. The host's role passes to the player who joined first among those still in; a lobby nobody is
 * left in closes, a running room everybody left is finished.
 *
 * @param array<string, mixed> $room
 */
function epd_room_remove(PDO $db, array $room, int $userId, int $now, bool $forget = false): void
{
    $roomId = (int) $room['id'];
    if ($forget) {
        // A deleted account's seat leaves a running shared shift before its row goes (coop.php).
        epd_coop_forget_seat($db, $room, $userId, $now);
    }
    if ($forget || $room['state'] === 'lobby') {
        $db->prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?')->execute([$roomId, $userId]);
        if ($forget) {
            $db->prepare('DELETE FROM room_results WHERE room_id = ? AND user_id = ?')->execute([$roomId, $userId]);
        }
    } else {
        $db->prepare('UPDATE room_players SET left_at = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL')
            ->execute([$now, $roomId, $userId]);
    }
    $set = [];
    if ($room['host_id'] !== null && (int) $room['host_id'] === $userId) {
        $stmt = $db->prepare('SELECT user_id FROM room_players WHERE room_id = ? AND left_at IS NULL ORDER BY joined, seat LIMIT 1');
        $stmt->execute([$roomId]);
        $next = $stmt->fetchColumn();
        $set['host_id'] = $next === false ? null : (int) $next;
    }
    if (epd_room_count($db, $roomId) === 0 && in_array($room['state'], ['lobby', 'running'], true)) {
        $set['state'] = $room['state'] === 'lobby' ? 'closed' : 'finished';
    } elseif ($room['state'] === 'running') {
        // Whoever is still in may have been the last one the board waited for.
        $set += epd_room_finish_if_done($db, $roomId);
    }
    epd_room_bump($db, $roomId, $now, $set);
    if ($room['state'] === 'running' && ($set['state'] ?? 'running') === 'running') {
        // A shared shift hears of it in its log: the seat leaves, the host's role may move (coop.php).
        epd_coop_sync_seats($db, epd_room_by_id($db, $roomId) ?? $room, $now);
    }
}

/**
 * `['state' => 'finished']` when every player still in the room has a result, else [].
 *
 * @return array<string, string>
 */
function epd_room_finish_if_done(PDO $db, int $roomId): array
{
    $stmt = $db->prepare(
        'SELECT COUNT(*) FROM room_players p
         WHERE p.room_id = ? AND p.left_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM room_results r WHERE r.room_id = p.room_id AND r.user_id = p.user_id)'
    );
    $stmt->execute([$roomId]);
    return (int) $stmt->fetchColumn() === 0 && epd_room_count($db, $roomId) > 0 ? ['state' => 'finished'] : [];
}

/** A player is in one open room at a time: creating or joining another one leaves the others. */
function epd_room_leave_others(PDO $db, int $userId, int $keepRoomId, int $now): void
{
    $stmt = $db->prepare(
        "SELECT r.* FROM rooms r JOIN room_players p ON p.room_id = r.id
         WHERE p.user_id = ? AND p.left_at IS NULL AND r.id <> ? AND r.state IN ('lobby', 'running')"
    );
    $stmt->execute([$userId, $keepRoomId]);
    foreach ($stmt->fetchAll() as $room) {
        epd_room_remove($db, $room, $userId, $now);
    }
}

/**
 * Account deletion (auth.php, inside its transaction): the user's seats and results go, the host's role passes on
 * and rooms nobody is left in close.
 */
function epd_rooms_forget_user(PDO $db, int $userId): void
{
    $now = epd_now_ms();
    $stmt = $db->prepare('SELECT r.* FROM rooms r JOIN room_players p ON p.room_id = r.id WHERE p.user_id = ?');
    $stmt->execute([$userId]);
    foreach ($stmt->fetchAll() as $room) {
        epd_room_remove($db, $room, $userId, $now, true);
    }
    // Rooms the user still hosts without a seat (should not exist) lose their host too.
    $db->prepare('UPDATE rooms SET host_id = NULL WHERE host_id = ?')->execute([$userId]);
    // The user's commands and uploaded snapshots go too (the host was asked for a fresh snapshot above).
    $db->prepare('DELETE FROM room_commands WHERE user_id = ?')->execute([$userId]);
    $db->prepare('DELETE FROM room_snapshots WHERE user_id = ?')->execute([$userId]);
}

/** Rooms older than 30 days go, with their players and results. */
function epd_rooms_sweep(PDO $db, int $now): void
{
    $old = $now - EPD_ROOM_KEEP_MS;
    $db->prepare('DELETE FROM room_commands WHERE room_id IN (SELECT id FROM rooms WHERE created < ?)')->execute([$old]);
    $db->prepare('DELETE FROM room_snapshots WHERE room_id IN (SELECT id FROM rooms WHERE created < ?)')->execute([$old]);
    $db->prepare('DELETE FROM room_results WHERE room_id IN (SELECT id FROM rooms WHERE created < ?)')->execute([$old]);
    $db->prepare('DELETE FROM room_players WHERE room_id IN (SELECT id FROM rooms WHERE created < ?)')->execute([$old]);
    $db->prepare('DELETE FROM rooms WHERE created < ?')->execute([$old]);
}

/** Record a wrong or unknown code and answer 429 once this IP guessed too often. */
function epd_room_miss_check(PDO $db, string $ip): void
{
    if (epd_rate_events($db, 'room_miss', $ip, EPD_ROOM_MISS_WINDOW) >= EPD_ROOM_MISS_LIMIT) {
        epd_fail(429, 'rate_limited', 'Liiga palju valesid koode, proovi mõne minuti pärast uuesti.', ['Retry-After' => (string) EPD_ROOM_MISS_WINDOW]);
    }
}

/**
 * The room a member asks about, after its time rules, inside a write transaction; 404 for a missing code and for
 * a room the caller is not in (codes are not probed through it).
 *
 * @return array{0: array<string, mixed>, 1: array<string, mixed>}
 */
function epd_room_for_member(PDO $db, string $rawCode, int $userId, int $now): array
{
    $code = epd_room_clean_code($rawCode);
    $room = $code === null ? null : epd_room_by_code($db, $code);
    $member = $room === null ? null : epd_room_member($db, (int) $room['id'], $userId);
    if ($room === null || $member === null) {
        epd_fail(404, 'room_not_found', 'Sellise koodiga ruumi ei ole.');
    }
    return [epd_room_refresh($db, $room, $now), $member];
}

/** Run $fn in a BEGIN IMMEDIATE transaction (seat counts and host changes must not race). */
function epd_room_tx(PDO $db, callable $fn): mixed
{
    $db->exec('BEGIN IMMEDIATE');
    try {
        $result = $fn($db);
        $db->exec('COMMIT');
        return $result;
    } catch (Throwable $e) {
        $db->exec('ROLLBACK');
        throw $e;
    }
}

function epd_room_reply(PDO $db, string $code, int $userId, int $now, array $extra = []): ApiReply
{
    $room = epd_room_by_code($db, $code);
    return epd_reply($extra + ['room' => $room === null ? null : epd_room_public($db, $room, $userId, $now)]);
}

// ---------------------------------------------------------------- routes

/** POST /api/rooms: a new room with the caller as host. */
function epd_route_room_create(): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $body = epd_json_body();
    $mode = $body['mode'] ?? 'race';
    if (!is_string($mode) || !in_array($mode, EPD_ROOM_MODES, true)) {
        epd_room_invalid('mode');
    }
    if (!in_array($mode, EPD_ROOM_OPEN_MODES, true)) {
        epd_fail(400, 'mode_unavailable', 'See mitmikmängu režiim ei ole veel avatud.', [], ['field' => 'mode']);
    }
    $opts = epd_room_options($body);
    $db = epd_db();
    $ip = epd_client_ip();
    if (epd_rate_events($db, 'room_create', $ip, EPD_ROOM_CREATE_WINDOW) >= EPD_ROOM_CREATE_LIMIT) {
        epd_fail(429, 'rate_limited', 'Liiga palju uusi ruume, proovi hiljem uuesti.', ['Retry-After' => '600']);
    }
    $now = epd_room_now_ms();
    $code = epd_room_tx($db, static function (PDO $db) use ($userId, $opts, $mode, $now, $ip): string {
        epd_rate_event($db, 'room_create', $ip);
        epd_rooms_sweep($db, $now);
        $insert = $db->prepare(
            'INSERT INTO rooms (code, mode, host_id, region_id, sector, difficulty, hours, slot, seed, day, state, rev, created, updated)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'lobby\', 1, ?, ?)'
        );
        for ($try = 0; ; $try++) {
            $code = epd_room_new_code();
            try {
                $insert->execute([
                    $code, $mode, $userId, $opts['region_id'], $opts['sector'], $opts['difficulty'], $opts['hours'],
                    $opts['slot'], random_int(1, 2147483646), epd_daily_date($now), $now, $now,
                ]);
                break;
            } catch (PDOException $e) {
                if (!epd_is_unique_violation($e) || $try >= 8) {
                    throw $e;
                }
            }
        }
        $roomId = (int) $db->lastInsertId();
        epd_room_leave_others($db, $userId, $roomId, $now);
        $db->prepare('INSERT INTO room_players (room_id, user_id, seat, ready, joined, seen) VALUES (?, ?, 0, 1, ?, ?)')
            ->execute([$roomId, $userId, $now, $now]);
        return $code;
    });
    return epd_room_reply($db, $code, $userId, $now);
}

/** POST /api/rooms/join `{ code }`: take a free seat, or come back to a room the caller is in. */
function epd_route_room_join(): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $db = epd_db();
    $ip = epd_client_ip();
    epd_room_miss_check($db, $ip);
    $code = epd_room_clean_code(epd_json_body()['code'] ?? null);
    $room = $code === null ? null : epd_room_by_code($db, $code);
    if ($room === null || $room['state'] === 'closed') {
        epd_rate_event($db, 'room_miss', $ip);
        epd_fail(404, 'room_not_found', 'Sellise koodiga ruumi ei ole.');
    }
    $now = epd_room_now_ms();
    epd_room_tx($db, static function (PDO $db) use ($room, $userId, $now): void {
        $room = epd_room_refresh($db, epd_room_by_id($db, (int) $room['id']) ?? $room, $now);
        $roomId = (int) $room['id'];
        $member = epd_room_member($db, $roomId, $userId);
        if ($room['state'] === 'closed') {
            epd_fail(404, 'room_not_found', 'Sellise koodiga ruumi ei ole.');
        }
        if ($member !== null) {
            // Back in the room (another tab, a reload, or after leaving a running shift).
            epd_room_leave_others($db, $userId, $roomId, $now);
            $db->prepare('UPDATE room_players SET seen = ?, left_at = NULL WHERE room_id = ? AND user_id = ?')
                ->execute([$now, $roomId, $userId]);
            if ($member['left_at'] !== null) {
                $set = $room['host_id'] === null ? ['host_id' => $userId] : [];
                epd_room_bump($db, $roomId, $now, $set);
            }
            return;
        }
        if ($room['state'] !== 'lobby') {
            epd_fail(409, 'room_started', 'Selle ruumi vahetus on juba alanud.');
        }
        $stmt = $db->prepare('SELECT seat FROM room_players WHERE room_id = ?');
        $stmt->execute([$roomId]);
        $taken = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        $seat = null;
        for ($s = 0; $s < EPD_ROOM_MAX_PLAYERS; $s++) {
            if (!in_array($s, $taken, true)) {
                $seat = $s;
                break;
            }
        }
        if ($seat === null) {
            epd_fail(409, 'room_full', 'Ruum on täis.');
        }
        epd_room_leave_others($db, $userId, $roomId, $now);
        $db->prepare('INSERT INTO room_players (room_id, user_id, seat, ready, joined, seen) VALUES (?, ?, ?, 0, ?, ?)')
            ->execute([$roomId, $userId, $seat, $now, $now]);
        epd_room_bump($db, $roomId, $now, $room['host_id'] === null ? ['host_id' => $userId] : []);
    });
    return epd_room_reply($db, (string) $room['code'], $userId, $now);
}

/** GET /api/rooms: the caller's open room (lobby or running), or null. */
function epd_route_room_mine(): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $db = epd_db();
    $now = epd_room_now_ms();
    $stmt = $db->prepare(
        "SELECT r.* FROM rooms r JOIN room_players p ON p.room_id = r.id
         WHERE p.user_id = ? AND p.left_at IS NULL AND r.state IN ('lobby', 'running')
         ORDER BY r.created DESC LIMIT 1"
    );
    $stmt->execute([$userId]);
    $room = $stmt->fetch();
    if (!is_array($room)) {
        return epd_reply(['room' => null]);
    }
    $room = epd_room_refresh($db, $room, $now);
    if (!in_array($room['state'], ['lobby', 'running'], true)) {
        return epd_reply(['room' => null]);
    }
    return epd_reply(['room' => epd_room_public($db, $room, $userId, $now)]);
}

/**
 * GET /api/rooms/{code}?v=: the room for its members. While `v` (from the last answer) still matches, the answer is
 * just `{ v, unchanged: true }`. Polling also marks the caller as online.
 */
function epd_route_room_get(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $db = epd_db();
    $now = epd_room_now_ms();
    [$room, $member] = epd_room_for_member($db, $code, $userId, $now);
    if ($member['left_at'] === null && (int) $member['seen'] < $now - EPD_ROOM_SEEN_EVERY_MS) {
        $db->prepare('UPDATE room_players SET seen = ? WHERE room_id = ? AND user_id = ?')->execute([$now, $room['id'], $userId]);
    }
    $players = epd_room_players($db, (int) $room['id']);
    $tag = epd_room_tag($room, $players, $now);
    $since = $_GET['v'] ?? '';
    if (is_string($since) && $since === $tag) {
        return epd_reply(['v' => $tag, 'unchanged' => true]);
    }
    return epd_reply(['v' => $tag, 'room' => epd_room_public($db, $room, $userId, $now)]);
}

/** PUT /api/rooms/{code}: the host changes the shift's options in the lobby; everybody's ready resets. */
function epd_route_room_update(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $opts = epd_room_options(epd_json_body());
    $db = epd_db();
    $now = epd_room_now_ms();
    $clean = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $opts, $now): string {
        [$room] = epd_room_for_member($db, $code, $userId, $now);
        if ((int) ($room['host_id'] ?? 0) !== $userId) {
            epd_fail(403, 'not_host', 'Seda saab muuta ainult ruumi looja.');
        }
        if ($room['state'] !== 'lobby') {
            epd_fail(409, 'room_started', 'Selle ruumi vahetus on juba alanud.');
        }
        $db->prepare('UPDATE room_players SET ready = 0 WHERE room_id = ? AND user_id <> ?')->execute([$room['id'], $userId]);
        epd_room_bump($db, (int) $room['id'], $now, $opts);
        return (string) $room['code'];
    });
    return epd_room_reply($db, $clean, $userId, $now);
}

/** POST /api/rooms/{code}/ready `{ ready }`. */
function epd_route_room_ready(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $ready = epd_json_body()['ready'] ?? null;
    if (!is_bool($ready)) {
        epd_room_invalid('ready');
    }
    $db = epd_db();
    $now = epd_room_now_ms();
    $clean = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $ready, $now): string {
        [$room, $member] = epd_room_for_member($db, $code, $userId, $now);
        if ($room['state'] !== 'lobby') {
            epd_fail(409, 'room_started', 'Selle ruumi vahetus on juba alanud.');
        }
        if ((int) $member['ready'] !== ($ready ? 1 : 0)) {
            $db->prepare('UPDATE room_players SET ready = ?, seen = ? WHERE room_id = ? AND user_id = ?')
                ->execute([$ready ? 1 : 0, $now, $room['id'], $userId]);
            epd_room_bump($db, (int) $room['id'], $now);
        }
        return (string) $room['code'];
    });
    return epd_room_reply($db, $clean, $userId, $now);
}

/** POST /api/rooms/{code}/start: the host starts the shift once at least two players are in and all are ready. */
function epd_route_room_start(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $db = epd_db();
    $now = epd_room_now_ms();
    $clean = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $now): string {
        [$room] = epd_room_for_member($db, $code, $userId, $now);
        if ((int) ($room['host_id'] ?? 0) !== $userId) {
            epd_fail(403, 'not_host', 'Vahetuse saab alustada ainult ruumi looja.');
        }
        if ($room['state'] !== 'lobby') {
            epd_fail(409, 'room_started', 'Selle ruumi vahetus on juba alanud.');
        }
        $players = array_values(array_filter(epd_room_players($db, (int) $room['id']), static fn (array $p): bool => $p['left_at'] === null));
        if (count($players) < 2) {
            epd_fail(409, 'too_few', 'Alustamiseks on vaja vähemalt kahte mängijat.');
        }
        foreach ($players as $p) {
            if ((int) $p['user_id'] !== $userId && (int) $p['ready'] !== 1) {
                epd_fail(409, 'not_ready', 'Kõik mängijad ei ole veel valmis.');
            }
        }
        epd_room_bump($db, (int) $room['id'], $now, ['state' => 'running', 'started' => $now, 'day' => epd_daily_date($now)]);
        if (epd_coop_is_coop($room)) {
            // The shared shift's first log command: who sits where with which role.
            epd_coop_setup($db, $room, $players, $userId, $now);
        }
        return (string) $room['code'];
    });
    return epd_room_reply($db, $clean, $userId, $now);
}

/** POST /api/rooms/{code}/leave. */
function epd_route_room_leave(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $db = epd_db();
    $now = epd_room_now_ms();
    epd_room_tx($db, static function (PDO $db) use ($code, $userId, $now): void {
        [$room, $member] = epd_room_for_member($db, $code, $userId, $now);
        if ($member['left_at'] === null && in_array($room['state'], ['lobby', 'running'], true)) {
            epd_room_remove($db, $room, $userId, $now);
        }
    });
    return epd_reply(['ok' => true]);
}

/**
 * POST /api/rooms/{code}/result `{ score, grade, incidents, arrests, xp? }`: a player's result of the room's shift,
 * the first one counts. In co-op every player sends the team's result with their own XP. The room is finished once
 * every player still in it has sent one.
 */
function epd_route_room_result(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $body = epd_json_body();
    $row = [
        'score' => epd_number_field($body, 'score', 0, 100),
        'grade' => epd_enum_field($body, 'grade', EPD_GRADES),
        'incidents' => epd_number_field($body, 'incidents', 0, 100000),
        'arrests' => epd_number_field($body, 'arrests', 0, 100000),
        'xp' => array_key_exists('xp', $body) ? epd_number_field($body, 'xp', 0, 100000) : 0,
    ];
    // A shift with no incidents gets a flat grade from the sim; it says nothing about the player.
    if ($row['incidents'] < 1) {
        epd_fail(400, 'empty_shift', 'Sündmusteta vahetus edetabelisse ei lähe.', [], ['field' => 'incidents']);
    }
    $db = epd_db();
    $now = epd_room_now_ms();
    [$clean, $counted] = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $row, $now): array {
        [$room, $member] = epd_room_for_member($db, $code, $userId, $now);
        if ($room['state'] === 'lobby') {
            epd_fail(409, 'not_started', 'Selle ruumi vahetus ei ole veel alanud.');
        }
        if ($room['state'] === 'closed' || ($room['state'] === 'finished' && (int) $room['started'] < $now - EPD_ROOM_RUN_MAX_MS)) {
            epd_fail(409, 'room_closed', 'Selle ruumi tulemused on suletud.');
        }
        if ($member['left_at'] !== null) {
            epd_fail(409, 'left_room', 'Sa lahkusid sellest ruumist.');
        }
        $insert = $db->prepare(
            'INSERT INTO room_results (room_id, user_id, score, grade, incidents, arrests, xp, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (room_id, user_id) DO NOTHING'
        );
        $insert->execute([$room['id'], $userId, $row['score'], $row['grade'], $row['incidents'], $row['arrests'], $row['xp'], $now]);
        $counted = $insert->rowCount() === 1;
        if ($counted) {
            epd_room_bump($db, (int) $room['id'], $now, $room['state'] === 'running' ? epd_room_finish_if_done($db, (int) $room['id']) : []);
        }
        return [(string) $room['code'], $counted];
    });
    $room = epd_room_by_code($db, $clean);
    $results = $room === null ? [] : epd_room_results($db, (int) $room['id']);
    $mine = null;
    foreach ($results as $r) {
        if ($r['id'] === $userId) {
            $mine = $r;
        }
    }
    return epd_reply([
        'ok' => true,
        'counted' => $counted,
        'rank' => $mine['rank'] ?? null,
        'room' => $room === null ? null : epd_room_public($db, $room, $userId, $now),
    ]);
}

// The shared shift (command log, clock, digests, snapshots) builds on everything above.
require_once __DIR__ . '/coop.php';
