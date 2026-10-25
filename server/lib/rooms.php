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
 *
 * A room plays round after round (docs/MULTIPLAYER.md section 11): once a round is over, the first member who comes
 * back opens the lobby again (POST /reopen) with the same players, a new seed and the round's results kept as the
 * room's last round; the host picks the options (the mode too) and starts the next one.
 *
 * The host may remove a player (POST /kick, section 12): from the lobby or from a running round. The player is out at
 * once (a shared shift hears `left`, the game server closes their connection) and cannot come back with the code.
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
/** `race` (same-seed competition), `role` and `sector` (co-op over the command log, coop.php). */
const EPD_ROOM_MODES = ['race', 'sector', 'role'];
const EPD_ROOM_OPEN_MODES = ['race', 'role', 'sector'];
/** A sector room has two to four desks (neighbouring sectors of the prefecture; the client checks the neighbours). */
const EPD_ROOM_DESKS_MIN = 2;
const EPD_ROOM_DESKS_MAX = 4;
const EPD_ROOM_HOURS = [2, 3, 4, 6];
/** A custom force (src/sim/custom.ts): unit types, at most this many crews, officers per crew and the pool size. */
const EPD_ROOM_CUSTOM_TYPES = ['patrol', 'rapid', 'traffic', 'k9', 'criminal', 'community', 'aux', 'transport', 'border', 'boat', 'special', 'heli'];
const EPD_ROOM_CUSTOM_CREWS = 40;
/** A sector room's drafts joined at the start (each player's at most EPD_ROOM_CUSTOM_CREWS). */
const EPD_ROOM_CUSTOM_JOINED = 100;
const EPD_ROOM_CUSTOM_OFFICERS = 6;
const EPD_ROOM_CUSTOM_POOL = 60;
const EPD_ROOM_SLOTS = ['morning', 'afternoon', 'evening', 'night'];
/** A player counts as online when their last poll is this recent (ms). */
const EPD_ROOM_ONLINE_MS = 20 * 1000;
/** `seen` is written at most this often per player (ms), so polling stays a read. */
const EPD_ROOM_SEEN_EVERY_MS = 5 * 1000;
/** A lobby nobody polled for this long closes (ms). */
const EPD_ROOM_LOBBY_IDLE_MS = 30 * 60 * 1000;
/** A lobby whose host has not polled for this long passes to the earliest-joined player who is online (ms). */
const EPD_ROOM_HOST_AWAY_MS = 5 * 60 * 1000;
/** A running room is finished this long after its start at the latest (ms). */
const EPD_ROOM_RUN_MAX_MS = 12 * 3600 * 1000;
/** Rooms and their results are deleted this long after their last change (ms). */
const EPD_ROOM_KEEP_MS = 30 * 86400 * 1000;
/** New rooms per IP and hour. */
const EPD_ROOM_CREATE_LIMIT = 20;
const EPD_ROOM_CREATE_WINDOW = 3600;
/** Rounds the history answers with (GET /api/rooms/history). */
const EPD_ROOM_HISTORY = 30;
/** The largest joint report a round keeps (bytes of JSON). */
const EPD_ROOM_SUMMARY_MAX = 32768;
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
 * Validated shift options of a room from a body. A sector room (`$mode` 'sector') needs `desks`: two to four distinct
 * sectors of the prefecture; its `sector` becomes the first desk. Other modes store no desks.
 *
 * @param array<string, mixed> $body
 * @return array{region_id: string, sector: string, difficulty: string, hours: int, slot: string, desks: string}
 */
function epd_room_options(array $body, string $mode = 'race'): array
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
    $desks = '';
    if ($mode === 'sector') {
        $list = $body['desks'] ?? null;
        if (!is_array($list) || !array_is_list($list) || count($list) < EPD_ROOM_DESKS_MIN || count($list) > EPD_ROOM_DESKS_MAX) {
            epd_room_invalid('desks');
        }
        foreach ($list as $d) {
            if (!is_string($d) || preg_match('/^' . $region . '-[a-z0-9][a-z0-9-]{0,40}$/', $d) !== 1) {
                epd_room_invalid('desks');
            }
        }
        if (count(array_unique($list)) !== count($list)) {
            epd_room_invalid('desks');
        }
        $desks = implode(',', $list);
        $sector = $list[0];
    }
    $custom = epd_room_custom($body['custom'] ?? null, $region);
    return ['region_id' => $region, 'sector' => $sector, 'difficulty' => $difficulty, 'hours' => $hours, 'slot' => $slot, 'desks' => $desks, 'custom' => $custom];
}

/**
 * A room's custom force as stored ('' for none): `{crews: [[type, station, officer...]...], budget?: true}`. The shape
 * is checked here (known types, a station id of the prefecture, distinct pool indices, the size caps); the clients
 * and the game server clean it the same way when they build the shift (src/sim/custom.ts parseCustom). The room's own
 * value may have no crews: custom forces are on and every player drafts their own (race and sector rooms); a
 * player's draft without crews is ''.
 */
function epd_room_custom(mixed $v, string $region, bool $keepEmpty = true): string
{
    if ($v === null) {
        return '';
    }
    if (!is_array($v) || !isset($v['crews']) || !is_array($v['crews']) || !array_is_list($v['crews']) || count($v['crews']) > EPD_ROOM_CUSTOM_CREWS) {
        epd_room_invalid('custom');
    }
    $crews = [];
    $taken = [];
    foreach ($v['crews'] as $c) {
        if (!is_array($c) || !array_is_list($c) || count($c) < 2 || count($c) > 2 + EPD_ROOM_CUSTOM_OFFICERS) {
            epd_room_invalid('custom');
        }
        [$type, $station] = $c;
        if (!is_string($type) || !in_array($type, EPD_ROOM_CUSTOM_TYPES, true)) {
            epd_room_invalid('custom');
        }
        if (!is_string($station) || preg_match('/^' . $region . '-[a-z0-9][a-z0-9-]{0,40}$/', $station) !== 1) {
            epd_room_invalid('custom');
        }
        $row = [$type, $station];
        foreach (array_slice($c, 2) as $i) {
            if (!is_int($i) || $i < 0 || $i >= EPD_ROOM_CUSTOM_POOL || isset($taken[$i])) {
                epd_room_invalid('custom');
            }
            $taken[$i] = true;
            $row[] = $i;
        }
        $crews[] = $row;
    }
    if (!$crews && !$keepEmpty) {
        return '';
    }
    $out = ['crews' => $crews];
    if (($v['budget'] ?? false) === true) {
        $out['budget'] = true;
    }
    return json_encode($out, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

/**
 * The stored custom force as the API's JSON shape: ['custom' => [...]] or [] when the room has none.
 *
 * @param array<string, mixed> $room
 * @return array<string, mixed>
 */
function epd_room_custom_out(array $room): array
{
    $raw = (string) ($room['custom'] ?? '');
    if ($raw === '') {
        return [];
    }
    $v = json_decode($raw, true);
    return is_array($v) ? ['custom' => $v] : [];
}

/**
 * A sector room's desks as a list ([] for the other modes).
 *
 * @param array<string, mixed> $room
 * @return list<string>
 */
function epd_room_desks(array $room): array
{
    $raw = (string) ($room['desks'] ?? '');
    return $raw === '' ? [] : explode(',', $raw);
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
        'SELECT p.user_id, p.seat, p.ready, p.joined, p.seen, p.left_at, p.role, p.desk, p.custom, u.name, u.avatar
         FROM room_players p JOIN users u ON u.id = p.user_id
         WHERE p.room_id = ? ORDER BY p.seat'
    );
    $stmt->execute([$roomId]);
    return $stmt->fetchAll();
}

/** Has the host removed $userId from this room (POST /kick)? */
function epd_room_banned(PDO $db, int $roomId, int $userId): bool
{
    $stmt = $db->prepare('SELECT 1 FROM room_bans WHERE room_id = ? AND user_id = ?');
    $stmt->execute([$roomId, $userId]);
    return $stmt->fetchColumn() !== false;
}

function epd_room_kicked(): never
{
    epd_fail(403, 'kicked', 'Ruumi looja eemaldas sind sellest ruumist.');
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
 * after its start. A lobby whose host has been away for five minutes passes to the earliest-joined player who is
 * online, so the others are not stuck waiting (a host who closed the tab after a round). Returns the (re-read) row.
 *
 * @param array<string, mixed> $room
 * @return array<string, mixed>
 */
function epd_room_refresh(PDO $db, array $room, int $now): array
{
    $next = null;
    if ($room['state'] === 'lobby') {
        $stmt = $db->prepare('SELECT user_id, seen FROM room_players WHERE room_id = ? AND left_at IS NULL ORDER BY joined, seat');
        $stmt->execute([$room['id']]);
        $here = $stmt->fetchAll();
        $seen = $here === [] ? 0 : max(array_map(static fn (array $p): int => (int) $p['seen'], $here));
        if (max($seen, (int) $room['updated']) < $now - EPD_ROOM_LOBBY_IDLE_MS) {
            $next = 'closed';
        } elseif (($heir = epd_room_lobby_heir($room, $here, $now)) !== null) {
            // The host who went away is an ordinary player from now on: not ready until they say so.
            $db->prepare('UPDATE room_players SET ready = 0 WHERE room_id = ? AND user_id = ?')->execute([$room['id'], (int) $room['host_id']]);
            epd_room_bump($db, (int) $room['id'], $now, ['host_id' => $heir]);
            return epd_room_by_id($db, (int) $room['id']) ?? $room;
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
 * Who takes a lobby over from a host who has not polled for EPD_ROOM_HOST_AWAY_MS: the earliest-joined player who is
 * online, or null while the host is around (or nobody else is).
 *
 * @param array<string, mixed> $room
 * @param list<array<string, mixed>> $here players still in the room (user_id, seen), in joining order
 */
function epd_room_lobby_heir(array $room, array $here, int $now): ?int
{
    $host = $room['host_id'] === null ? null : (int) $room['host_id'];
    foreach ($here as $p) {
        if ((int) $p['user_id'] === $host && (int) $p['seen'] >= $now - EPD_ROOM_HOST_AWAY_MS) {
            return null;
        }
    }
    foreach ($here as $p) {
        if ((int) $p['user_id'] !== $host && (int) $p['seen'] >= $now - EPD_ROOM_ONLINE_MS) {
            return (int) $p['user_id'];
        }
    }
    return null;
}

/**
 * Results of a room, best first, each with its place (1 + the number of strictly higher scores).
 *
 * @return list<array{id: int, name: string, avatar?: string, score: int, grade: string, incidents: int, arrests: int, xp: int, at: int, rank: int}>
 */
function epd_room_results(PDO $db, int $roomId): array
{
    $stmt = $db->prepare(
        'SELECT r.user_id, u.name, u.avatar, r.score, r.grade, r.incidents, r.arrests, r.xp, r.at,
                RANK() OVER (ORDER BY r.score DESC) AS rank
         FROM room_results r JOIN users u ON u.id = r.user_id
         WHERE r.room_id = ?
         ORDER BY r.score DESC, r.at ASC'
    );
    $stmt->execute([$roomId]);
    return array_map('epd_room_result_out', $stmt->fetchAll());
}

/**
 * A result row as the API shows it (the profile picture only when the player chose one, 2.35.0).
 *
 * @param array<string, mixed> $r
 * @return array{id: int, name: string, avatar?: string, score: int, grade: string, incidents: int, arrests: int, xp: int, at: int, rank: int}
 */
function epd_room_result_out(array $r): array
{
    $out = [
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
    if ((string) ($r['avatar'] ?? '') !== '') {
        $out['avatar'] = (string) $r['avatar'];
    }
    return $out;
}

/**
 * An earlier round of a room: its mode, seed and results (best first, ranked like the current round's), or null
 * when nobody's result of it is kept.
 *
 * @return array{round: int, mode: string, seed: int, results: list<array<string, int|string>>}|null
 */
function epd_room_round(PDO $db, int $roomId, int $round): ?array
{
    $stmt = $db->prepare(
        'SELECT r.user_id, u.name, u.avatar, r.mode, r.seed, r.score, r.grade, r.incidents, r.arrests, r.xp, r.at,
                RANK() OVER (ORDER BY r.score DESC) AS rank
         FROM room_round_results r JOIN users u ON u.id = r.user_id
         WHERE r.room_id = ? AND r.round = ?
         ORDER BY r.score DESC, r.at ASC'
    );
    $stmt->execute([$roomId, $round]);
    $rows = $stmt->fetchAll();
    if ($rows === []) {
        return null;
    }
    return [
        'round' => $round,
        'mode' => (string) $rows[0]['mode'],
        'seed' => (int) $rows[0]['seed'],
        'results' => array_map('epd_room_result_out', $rows),
    ];
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
    $lobby = $room['state'] === 'lobby';
    $list = [];
    foreach ($players as $p) {
        $id = (int) $p['user_id'];
        $list[] = [
            'id' => $id,
            'name' => (string) $p['name'],
            'seat' => (int) $p['seat'],
            'host' => $id === $host,
            // The host is always ready; the others say so themselves. Once the round is on, `ready` says who takes part
            // in it: everybody who was ready at the start (a player who was away then is not waited for).
            'ready' => ($lobby && $id === $host) || (int) $p['ready'] === 1,
            'online' => $p['left_at'] === null && (int) $p['seen'] >= $now - EPD_ROOM_ONLINE_MS,
            'left' => $p['left_at'] !== null,
            'done' => in_array($id, $done, true),
            // Role co-op: the role chosen in the lobby, or the seat's default (coop.php).
            'role' => epd_coop_role_of($p),
        ];
        if ((string) $room['mode'] === 'sector') {
            // Sector co-op: the desk chosen in the lobby, or the seat's default.
            $list[count($list) - 1]['desk'] = epd_coop_desk_of($room, $p);
        }
        // Profiilipilt (2.35.0): shown next to the name.
        if ((string) ($p['avatar'] ?? '') !== '') {
            $list[count($list) - 1]['avatar'] = (string) $p['avatar'];
        }
        // Kohandatud mäng: the force the player drafted.
        $draft = epd_room_custom_out(['custom' => (string) ($p['custom'] ?? '')]);
        if ($draft) {
            $list[count($list) - 1]['custom'] = $draft['custom'];
        }
    }
    $running = !$lobby;
    $round = max(1, (int) ($room['round'] ?? 1));
    return [
        'code' => (string) $room['code'],
        'mode' => (string) $room['mode'],
        'state' => (string) $room['state'],
        // Rounds played in this room so far (the current one included), and the results of the one before.
        'round' => $round,
        'last' => $round > 1 ? epd_room_round($db, (int) $room['id'], $round - 1) : null,
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
        ] + ((string) $room['mode'] === 'sector' ? ['desks' => epd_room_desks($room)] : []) + epd_room_custom_out($room),
        // The seed and the day only once the shift is on: nobody can play it before the others.
        'seed' => $running ? (int) $room['seed'] : null,
        'day' => $running ? (string) $room['day'] : null,
        'created' => (int) $room['created'],
        'started' => $room['started'] === null ? null : (int) $room['started'],
        // 'server': the shift runs on the game server (mp.php); '' plays it in lockstep or alone.
        'engine' => epd_mp_engine($room),
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
 * `['state' => 'finished']` when every player still in the room who takes part in the round (was ready at its start)
 * has a result, else [].
 *
 * @return array<string, string>
 */
function epd_room_finish_if_done(PDO $db, int $roomId): array
{
    $stmt = $db->prepare(
        'SELECT COUNT(*) FROM room_players p
         WHERE p.room_id = ? AND p.left_at IS NULL AND p.ready = 1
           AND NOT EXISTS (SELECT 1 FROM room_results r WHERE r.room_id = p.room_id AND r.user_id = p.user_id)'
    );
    $stmt->execute([$roomId]);
    return (int) $stmt->fetchColumn() === 0 && epd_room_count($db, $roomId) > 0 ? ['state' => 'finished'] : [];
}

/**
 * A player is in one open room at a time: creating or joining another one leaves the others (a room between two
 * rounds too, so it never opens again with them in two lobbies).
 */
function epd_room_leave_others(PDO $db, int $userId, int $keepRoomId, int $now): void
{
    $stmt = $db->prepare(
        "SELECT r.* FROM rooms r JOIN room_players p ON p.room_id = r.id
         WHERE p.user_id = ? AND p.left_at IS NULL AND r.id <> ? AND r.state IN ('lobby', 'running', 'finished')"
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
    // The rooms' clock (the real time; under the test server X-EPD-Test-Now), like every other room route.
    $now = epd_room_now_ms();
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
    epd_room_reports_forget($db, $userId);
}

/**
 * A deleted account's name leaves the joint reports (2.36.0): the rounds stay in the others' history, the seat without
 * a name. Inside the caller's transaction, while the account still exists.
 */
function epd_room_reports_forget(PDO $db, int $userId): void
{
    $stmt = $db->prepare('SELECT name FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $name = $stmt->fetchColumn();
    if (!is_string($name) || $name === '') {
        return;
    }
    $rows = $db->prepare('SELECT room_id, round, summary FROM room_reports WHERE instr(summary, ?) > 0');
    $rows->execute(['"name":' . epd_json($name)]);
    $update = $db->prepare('UPDATE room_reports SET summary = ? WHERE room_id = ? AND round = ?');
    foreach ($rows->fetchAll() as $row) {
        $summary = json_decode((string) $row['summary'], true);
        if (!is_array($summary) || !is_array($summary['coop']['seats'] ?? null)) {
            continue;
        }
        foreach ($summary['coop']['seats'] as $i => $seat) {
            if (is_array($seat) && ($seat['name'] ?? null) === $name) {
                $summary['coop']['seats'][$i]['name'] = '';
            }
        }
        $update->execute([epd_json($summary), $row['room_id'], $row['round']]);
    }
}

/**
 * Rooms nobody has used for 30 days go, with their players and results (a room that plays round after round stays
 * while it is used: `updated` moves with every change).
 */
function epd_rooms_sweep(PDO $db, int $now): void
{
    $old = $now - EPD_ROOM_KEEP_MS;
    foreach (['room_commands', 'room_snapshots', 'room_results', 'room_round_results', 'room_reports', 'room_bans', 'room_players'] as $table) {
        $db->prepare("DELETE FROM $table WHERE room_id IN (SELECT id FROM rooms WHERE updated < ?)")->execute([$old]);
    }
    $db->prepare('DELETE FROM rooms WHERE updated < ?')->execute([$old]);
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
    if ($room !== null && epd_room_banned($db, (int) $room['id'], $userId)) {
        epd_room_kicked();
    }
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
    $opts = epd_room_options($body, $mode);
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
            'INSERT INTO rooms (code, mode, host_id, region_id, sector, desks, custom, difficulty, hours, slot, seed, day, state, rev, created, updated)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'lobby\', 1, ?, ?)'
        );
        for ($try = 0; ; $try++) {
            $code = epd_room_new_code();
            try {
                $insert->execute([
                    $code, $mode, $userId, $opts['region_id'], $opts['sector'], $opts['desks'], $opts['custom'], $opts['difficulty'], $opts['hours'],
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
    if (epd_room_banned($db, (int) $room['id'], $userId)) {
        epd_room_kicked();
    }
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
        // A lobby takes new players, and so does a room between two rounds (they are in the next one).
        if ($room['state'] === 'running') {
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

/**
 * GET /api/rooms: the caller's open room (lobby or running), or one between two rounds whose round started in the
 * last 12 hours (coming back to it opens the next round), or null.
 */
function epd_route_room_mine(): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $db = epd_db();
    $now = epd_room_now_ms();
    $stmt = $db->prepare(
        "SELECT r.* FROM rooms r JOIN room_players p ON p.room_id = r.id
         WHERE p.user_id = ? AND p.left_at IS NULL
           AND (r.state IN ('lobby', 'running') OR (r.state = 'finished' AND r.started >= ?))
         ORDER BY r.state = 'finished', r.created DESC LIMIT 1"
    );
    $stmt->execute([$userId, $now - EPD_ROOM_RUN_MAX_MS]);
    $room = $stmt->fetch();
    if (!is_array($room)) {
        return epd_reply(['room' => null]);
    }
    $room = epd_room_refresh($db, $room, $now);
    if (!in_array($room['state'], ['lobby', 'running', 'finished'], true)) {
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

/**
 * PUT /api/rooms/{code}: the host changes the shift's options in the lobby, the mode too (`mode`, else the room's own);
 * everybody's ready resets.
 */
function epd_route_room_update(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $body = epd_json_body();
    $db = epd_db();
    $now = epd_room_now_ms();
    $clean = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $body, $now): string {
        [$room] = epd_room_for_member($db, $code, $userId, $now);
        $mode = $body['mode'] ?? (string) $room['mode'];
        if (!is_string($mode) || !in_array($mode, EPD_ROOM_MODES, true)) {
            epd_room_invalid('mode');
        }
        // A room keeps its own mode even if that mode is no longer offered; switching is to an open one only.
        if ($mode !== (string) $room['mode'] && !in_array($mode, EPD_ROOM_OPEN_MODES, true)) {
            epd_fail(400, 'mode_unavailable', 'See mitmikmängu režiim ei ole veel avatud.', [], ['field' => 'mode']);
        }
        $opts = epd_room_options($body, $mode);
        if ((int) ($room['host_id'] ?? 0) !== $userId) {
            epd_fail(403, 'not_host', 'Seda saab muuta ainult ruumi looja.');
        }
        if ($room['state'] !== 'lobby') {
            epd_fail(409, 'room_started', 'Selle ruumi vahetus on juba alanud.');
        }
        $db->prepare('UPDATE room_players SET ready = 0 WHERE room_id = ? AND user_id <> ?')->execute([$room['id'], $userId]);
        if ($opts['region_id'] !== (string) $room['region_id'] || $opts['custom'] === '' || $mode !== (string) $room['mode']) {
            // A draft is of its prefecture's stations and officers, only while custom forces are on, and of its mode
            // (a race player's whole area, a sector player's desk; a role room has the host's force only).
            $db->prepare("UPDATE room_players SET custom = '' WHERE room_id = ?")->execute([$room['id']]);
        }
        epd_room_bump($db, (int) $room['id'], $now, $opts + ['mode' => $mode]);
        return (string) $room['code'];
    });
    return epd_room_reply($db, $clean, $userId, $now);
}

/**
 * A sector room's force at the start: the players' drafts one after the other (at most EPD_ROOM_CUSTOM_JOINED crews).
 *
 * @param array<string, mixed> $room
 * @param list<array<string, mixed>> $players
 */
function epd_room_custom_joined(array $room, array $players): string
{
    $own = json_decode((string) $room['custom'], true);
    $crews = [];
    foreach ($players as $p) {
        $draft = json_decode((string) ($p['custom'] ?? ''), true);
        foreach (is_array($draft) ? ($draft['crews'] ?? []) : [] as $c) {
            if (count($crews) < EPD_ROOM_CUSTOM_JOINED) {
                $crews[] = $c;
            }
        }
    }
    $out = ['crews' => $crews];
    if (is_array($own) && ($own['budget'] ?? false) === true) {
        $out['budget'] = true;
    }
    return json_encode($out, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

/**
 * POST /api/rooms/{code}/custom `{ custom }`: a player drafts their own force in a race or sector room with custom
 * forces on. An officer belongs to one player of the room (409 `officer_taken`).
 */
function epd_route_room_custom(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $body = epd_json_body();
    $db = epd_db();
    $now = epd_room_now_ms();
    $clean = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $body, $now): string {
        [$room] = epd_room_for_member($db, $code, $userId, $now);
        if ($room['state'] !== 'lobby') {
            epd_fail(409, 'room_started', 'Selle ruumi vahetus on juba alanud.');
        }
        if ((string) $room['custom'] === '' || (string) $room['mode'] === 'role') {
            epd_fail(409, 'not_custom', 'Selles ruumis oma koosseisu ei valita.');
        }
        $draft = epd_room_custom($body['custom'] ?? null, (string) $room['region_id'], false);
        $mine = $draft === '' ? [] : json_decode($draft, true);
        $picked = [];
        foreach ($mine['crews'] ?? [] as $c) {
            foreach (array_slice($c, 2) as $i) {
                $picked[$i] = true;
            }
        }
        foreach (epd_room_players($db, (int) $room['id']) as $p) {
            if ((int) $p['user_id'] === $userId || $p['left_at'] !== null || (string) $p['custom'] === '') {
                continue;
            }
            $theirs = json_decode((string) $p['custom'], true);
            foreach (is_array($theirs) ? ($theirs['crews'] ?? []) : [] as $c) {
                foreach (array_slice($c, 2) as $i) {
                    if (isset($picked[$i])) {
                        epd_fail(409, 'officer_taken', 'Mõni valitud politseinik on juba teise mängija koosseisus.', [], ['officer' => $i]);
                    }
                }
            }
        }
        $db->prepare('UPDATE room_players SET custom = ?, seen = ? WHERE room_id = ? AND user_id = ?')->execute([$draft, $now, $room['id'], $userId]);
        epd_room_bump($db, (int) $room['id'], $now);
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

/**
 * POST /api/rooms/{code}/start: the host starts the shift once at least two players take part and every player who is
 * here (online) is ready. A player who is away (closed the tab after the last round) does not hold the others up: they
 * stay in the room and may still join this round, but it does not wait for their result.
 */
function epd_route_room_start(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $db = epd_db();
    $now = epd_room_now_ms();
    // Asked before the transaction (a network call must not hold the database's write lock), for co-op rooms only.
    $peek = epd_room_clean_code($code);
    $peekRoom = $peek === null ? null : epd_room_by_code($db, $peek);
    $serverEngine = $peekRoom !== null && epd_coop_is_coop($peekRoom) && epd_mp_ready();
    $clean = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $now, $serverEngine): string {
        [$room] = epd_room_for_member($db, $code, $userId, $now);
        if ((int) ($room['host_id'] ?? 0) !== $userId) {
            epd_fail(403, 'not_host', 'Vahetuse saab alustada ainult ruumi looja.');
        }
        if ($room['state'] !== 'lobby') {
            epd_fail(409, 'room_started', 'Selle ruumi vahetus on juba alanud.');
        }
        $players = array_values(array_filter(epd_room_players($db, (int) $room['id']), static fn (array $p): bool => $p['left_at'] === null));
        // Who takes part: the host, everybody ready, and everybody here who is not (they hold the start up).
        $part = array_filter(
            $players,
            static fn (array $p): bool => (int) $p['user_id'] === $userId || (int) $p['ready'] === 1 || (int) $p['seen'] >= $now - EPD_ROOM_ONLINE_MS,
        );
        if (count($part) < 2) {
            epd_fail(409, 'too_few', 'Alustamiseks on vaja vähemalt kahte mängijat.');
        }
        foreach ($part as $p) {
            if ((int) $p['user_id'] !== $userId && (int) $p['ready'] !== 1) {
                epd_fail(409, 'not_ready', 'Kõik mängijad ei ole veel valmis.');
            }
        }
        // The host takes part too (their ready mark is what the end of the round waits for, epd_room_finish_if_done).
        $db->prepare('UPDATE room_players SET ready = 1 WHERE room_id = ? AND user_id = ?')->execute([$room['id'], $userId]);
        $start = ['state' => 'running', 'started' => $now, 'day' => epd_daily_date($now)];
        if ((string) $room['mode'] === 'sector' && (string) $room['custom'] !== '') {
            // The shared shift's force: every desk player's draft, in seat order (src/sim/room.ts fills the rest).
            $start['custom'] = epd_room_custom_joined($room, $players);
        }
        if ($serverEngine && epd_coop_is_coop($room)) {
            // The game server runs this shift (mp.php); the setup row below still records who started where.
            $start['engine'] = 'server';
        }
        epd_room_bump($db, (int) $room['id'], $now, $start);
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
        if ($member['left_at'] === null && in_array($room['state'], ['lobby', 'running', 'finished'], true)) {
            epd_room_remove($db, $room, $userId, $now);
        }
    });
    return epd_reply(['ok' => true]);
}

/**
 * POST /api/rooms/{code}/kick `{ seat }`: the host removes the player in that seat, from the lobby or from a running
 * round. The player leaves as with the button (a shared shift hears `left`: their desk or role passes on) and cannot
 * come back to this room with its code. On the game server the player's connection closes at once.
 */
function epd_route_room_kick(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $seat = epd_json_body()['seat'] ?? null;
    if (!is_int($seat) || $seat < 0 || $seat >= EPD_ROOM_MAX_PLAYERS) {
        epd_room_invalid('seat');
    }
    $db = epd_db();
    $now = epd_room_now_ms();
    [$clean, $kick] = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $seat, $now): array {
        [$room] = epd_room_for_member($db, $code, $userId, $now);
        if ((int) ($room['host_id'] ?? 0) !== $userId) {
            epd_fail(403, 'not_host', 'Mängijat saab eemaldada ainult ruumi looja.');
        }
        if (!in_array($room['state'], ['lobby', 'running', 'finished'], true)) {
            epd_fail(409, 'room_closed', 'See ruum on suletud.');
        }
        $target = null;
        foreach (epd_room_players($db, (int) $room['id']) as $p) {
            if ((int) $p['seat'] === $seat && $p['left_at'] === null) {
                $target = $p;
            }
        }
        if ($target === null) {
            epd_fail(404, 'player_not_found', 'Selles kohas ei ole mängijat.');
        }
        if ((int) $target['user_id'] === $userId) {
            epd_fail(409, 'kick_self', 'Iseennast ei saa eemaldada, lahku ruumist.');
        }
        $db->prepare('INSERT OR IGNORE INTO room_bans (room_id, user_id, at) VALUES (?, ?, ?)')
            ->execute([$room['id'], (int) $target['user_id'], $now]);
        epd_room_remove($db, $room, (int) $target['user_id'], $now);
        // The game server hears of it after the transaction (a network call must not hold the write lock).
        $kick = $room['state'] === 'running' && epd_mp_engine($room) === 'server'
            ? ['code' => (string) $room['code'], 'seat' => $seat, 'user' => (int) $target['user_id']]
            : null;
        return [(string) $room['code'], $kick];
    });
    if ($kick !== null) {
        epd_mp_kick($kick['code'], $kick['seat'], $kick['user'], $now);
    }
    return epd_room_reply($db, $clean, $userId, $now);
}

/**
 * POST /api/rooms/{code}/result `{ score, grade, incidents, arrests, xp?, seed?, signed? }`: a player's result of the
 * room's shift, the first one counts. In co-op every player sends the team's result with their own XP. The room is
 * finished once every player taking part has sent one. `seed` is the shift's: a result of a round that is already over
 * (the room has moved on to the next one) answers 409 `round_over` and counts nowhere. A shared shift that ran on the
 * game server counts only with the result the game server signed (`signed`, mp.php): its numbers replace the body's,
 * and without it the answer is 409 `unsigned`.
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
    $seed = array_key_exists('seed', $body) ? epd_number_field($body, 'seed', 0, 4294967295) : null;
    $signed = $body['signed'] ?? null;
    // Co-op: the joint report of the round (2.36.0); a game server round's comes with its signed result.
    $summary = $body['summary'] ?? null;
    // A shift with no incidents gets a flat grade from the sim; it says nothing about the player.
    if ($row['incidents'] < 1) {
        epd_fail(400, 'empty_shift', 'Sündmusteta vahetus edetabelisse ei lähe.', [], ['field' => 'incidents']);
    }
    $db = epd_db();
    $now = epd_room_now_ms();
    [$clean, $counted] = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $row, $seed, $signed, $summary, $now): array {
        [$room, $member] = epd_room_for_member($db, $code, $userId, $now);
        if ($seed !== null && $seed !== (int) $room['seed']) {
            epd_fail(409, 'round_over', 'See voor on juba läbi.');
        }
        if (epd_coop_is_coop($room) && epd_mp_engine($room) === 'server' && $room['state'] !== 'lobby') {
            // The game server ran the shift: its signed result counts, whatever numbers the client sent.
            $row = epd_mp_signed_result($signed, $room, (int) $member['seat']);
            $summary = $row['summary'];
            if ($row['incidents'] < 1) {
                epd_fail(400, 'empty_shift', 'Sündmusteta vahetus edetabelisse ei lähe.', [], ['field' => 'incidents']);
            }
        }
        if ($room['state'] === 'lobby') {
            epd_fail(409, 'not_started', 'Selle ruumi vahetus ei ole veel alanud.');
        }
        if ($room['state'] === 'closed' || ($room['state'] === 'finished' && (int) $room['started'] < $now - EPD_ROOM_RUN_MAX_MS)) {
            epd_fail(409, 'room_closed', 'Selle ruumi tulemused on suletud.');
        }
        if ($member['left_at'] !== null) {
            epd_fail(409, 'left_room', 'Sa lahkusid sellest ruumist.');
        }
        // Sending a result counts as being here: a race shift polls nothing, and the lobby's host rule reads `seen`.
        if ((int) $member['seen'] < $now - EPD_ROOM_SEEN_EVERY_MS) {
            $db->prepare('UPDATE room_players SET seen = ? WHERE room_id = ? AND user_id = ?')->execute([$now, $room['id'], $userId]);
        }
        $insert = $db->prepare(
            'INSERT INTO room_results (room_id, user_id, score, grade, incidents, arrests, xp, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (room_id, user_id) DO NOTHING'
        );
        $insert->execute([$room['id'], $userId, $row['score'], $row['grade'], $row['incidents'], $row['arrests'], $row['xp'], $now]);
        $counted = $insert->rowCount() === 1;
        $kept = $counted && epd_coop_is_coop($room) ? epd_room_summary_json($summary) : null;
        if ($kept !== null) {
            // The round's first joint report stays (every client's is the same shift's).
            $db->prepare('INSERT OR IGNORE INTO room_reports (room_id, round, summary, at) VALUES (?, ?, ?, ?)')
                ->execute([$room['id'], max(1, (int) ($room['round'] ?? 1)), $kept, $now]);
        }
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

/**
 * A joint report as a round keeps it (2.36.0), or null when it is not one: a JSON object of at most
 * EPD_ROOM_SUMMARY_MAX bytes with `v` 1 and one to four seats. The client reads it field by field again
 * (src/sim/joint.ts parseRoomSummary); here only its shape and size are checked.
 */
function epd_room_summary_json(mixed $summary): ?string
{
    if (!is_array($summary) || ($summary['v'] ?? null) !== 1 || !is_array($summary['coop'] ?? null)) {
        return null;
    }
    $seats = $summary['coop']['seats'] ?? null;
    if (!is_array($seats) || !array_is_list($seats) || $seats === [] || count($seats) > EPD_ROOM_MAX_PLAYERS) {
        return null;
    }
    $json = json_encode($summary, EPD_JSON_FLAGS);
    return is_string($json) && strlen($json) <= EPD_ROOM_SUMMARY_MAX ? $json : null;
}

/**
 * GET /api/rooms/history (2.36.0): the rounds the player sent a result for, newest first, at most EPD_ROOM_HISTORY
 * and while their rooms are kept. Each with its room's code, the round, its mode and seed, everybody's results (best
 * first, ranked) and, for a co-op round, its joint report. A round still being played is left out.
 */
function epd_route_room_history(): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $db = epd_db();
    $stmt = $db->prepare(
        "SELECT x.room_id, x.round, x.at, x.current, m.code, m.mode, m.seed FROM (
            SELECT room_id, round, at, 0 AS current FROM room_round_results WHERE user_id = ?
            UNION ALL
            SELECT r.room_id, rm.round, r.at, 1 AS current FROM room_results r JOIN rooms rm ON rm.id = r.room_id
            WHERE r.user_id = ? AND rm.state IN ('finished', 'closed')
        ) x JOIN rooms m ON m.id = x.room_id
        ORDER BY x.at DESC LIMIT " . EPD_ROOM_HISTORY
    );
    $stmt->execute([$userId, $userId]);
    $report = $db->prepare('SELECT summary FROM room_reports WHERE room_id = ? AND round = ?');
    $rounds = [];
    foreach ($stmt->fetchAll() as $row) {
        $roomId = (int) $row['room_id'];
        $round = (int) $row['round'];
        if ((int) $row['current'] === 1) {
            $data = ['round' => $round, 'mode' => (string) $row['mode'], 'seed' => (int) $row['seed'], 'results' => epd_room_results($db, $roomId)];
        } else {
            $data = epd_room_round($db, $roomId, $round);
        }
        if ($data === null) {
            continue;
        }
        $report->execute([$roomId, $round]);
        $summary = json_decode((string) ($report->fetchColumn() ?: 'null'), true);
        $rounds[] = ['code' => (string) $row['code'], 'at' => (int) $row['at']] + $data + ['summary' => is_array($summary) ? $summary : null];
    }
    return epd_reply(['rounds' => $rounds]);
}

/**
 * The room opens for its next round (inside the caller's transaction): the round's results move to
 * room_round_results, players who left go, everybody else stays and is not ready (the host always is), the next round
 * gets a new seed, and the round's shared-shift state (log, snapshot, clock, digests) is cleared. The options, the
 * mode, the roles, the desks and the players' drafts stay; a sector room's force is again each desk's own draft.
 *
 * @param array<string, mixed> $room
 */
function epd_room_new_round(PDO $db, array $room, int $userId, int $now): void
{
    $roomId = (int) $room['id'];
    $round = max(1, (int) ($room['round'] ?? 1));
    $db->prepare(
        'INSERT OR IGNORE INTO room_round_results (room_id, round, user_id, mode, seed, score, grade, incidents, arrests, xp, at)
         SELECT room_id, ?, user_id, ?, ?, score, grade, incidents, arrests, xp, at FROM room_results WHERE room_id = ?'
    )->execute([$round, (string) $room['mode'], (int) $room['seed'], $roomId]);
    $db->prepare('DELETE FROM room_results WHERE room_id = ?')->execute([$roomId]);
    $db->prepare('DELETE FROM room_players WHERE room_id = ? AND left_at IS NOT NULL')->execute([$roomId]);
    $host = $room['host_id'] === null ? $userId : (int) $room['host_id'];
    // The host counts as here when the lobby opens (a race shift polls nothing): the 5-minute hand-over to the next
    // player (epd_room_lobby_heir) starts from now, not from the last poll before the round.
    $db->prepare(
        "UPDATE room_players SET ready = CASE WHEN user_id = ? THEN 1 ELSE 0 END, away = 0, hash_turn = -1, hash = '', resync = -1,
         cmd_tokens = ?, cmd_at = 0, seen = CASE WHEN user_id = ? THEN MAX(seen, ?) ELSE seen END WHERE room_id = ?"
    )->execute([$host, EPD_COOP_BURST, $host, $now, $roomId]);
    epd_coop_forget_room($db, $roomId);
    $set = [
        'state' => 'lobby',
        'round' => $round + 1,
        'host_id' => $host,
        'seed' => random_int(1, 2147483646),
        'started' => null,
        'engine' => '',
        'host_seat' => -1,
        'cmd_count' => 0,
        'ref_hashes' => '',
        'snap_req' => 0,
    ];
    if ((string) $room['mode'] === 'sector' && (string) $room['custom'] !== '') {
        // At the start the drafts were joined into the room's force; the next round is drafted again.
        $joined = json_decode((string) $room['custom'], true);
        $set['custom'] = json_encode(['crews' => []] + (is_array($joined) && ($joined['budget'] ?? false) === true ? ['budget' => true] : []), JSON_THROW_ON_ERROR);
    }
    epd_room_bump($db, $roomId, $now, $set);
}

/**
 * POST /api/rooms/{code}/reopen `{ round?, end? }`: a member comes back to the room after a round. A room whose round
 * is over (finished) opens for the next one, whoever of its players comes back first. While the round runs nothing
 * changes (the others are still playing), unless the host ends it for everybody (`end: true`, 403 `not_host` for the
 * others): results not sent by then do not count. `round` is the round the caller comes back from; when the room has
 * moved on since, nothing changes either. Answers the room.
 */
function epd_route_room_reopen(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $body = epd_json_body();
    $end = $body['end'] ?? false;
    $round = $body['round'] ?? null;
    if (!is_bool($end)) {
        epd_room_invalid('end');
    }
    if ($round !== null && (!is_int($round) || $round < 1)) {
        epd_room_invalid('round');
    }
    $db = epd_db();
    $now = epd_room_now_ms();
    $clean = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $end, $round, $now): string {
        [$room, $member] = epd_room_for_member($db, $code, $userId, $now);
        if ($room['state'] === 'closed') {
            epd_fail(409, 'room_closed', 'See ruum on suletud.');
        }
        if ($member['left_at'] !== null) {
            epd_fail(409, 'left_room', 'Sa lahkusid sellest ruumist.');
        }
        if ((int) $member['seen'] < $now - EPD_ROOM_SEEN_EVERY_MS) {
            $db->prepare('UPDATE room_players SET seen = ? WHERE room_id = ? AND user_id = ?')->execute([$now, $room['id'], $userId]);
        }
        if ($round !== null && $round !== (int) $room['round']) {
            return (string) $room['code'];
        }
        if ($room['state'] === 'running' && $end && (int) ($room['host_id'] ?? 0) !== $userId) {
            epd_fail(403, 'not_host', 'Vooru saab lõpetada ainult ruumi looja.');
        }
        if ($room['state'] === 'finished' || ($room['state'] === 'running' && $end)) {
            epd_room_new_round($db, $room, $userId, $now);
        }
        return (string) $room['code'];
    });
    return epd_room_reply($db, $clean, $userId, $now);
}

// The shared shift (command log, clock, digests, snapshots) builds on everything above.
require_once __DIR__ . '/coop.php';
