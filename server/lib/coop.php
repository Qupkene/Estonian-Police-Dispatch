<?php

declare(strict_types=1);

/**
 * Mitmikmängu ühisvahetus (co-op, docs/MULTIPLAYER.md section 4): the server orders a room's command log and keeps
 * its clock; every client runs the same shift from the room's seed and applies the log at the turns it says
 * (src/sim/coop.ts). The server never simulates: it stamps each command with the turn it takes effect at (the
 * server's turn when it arrived plus the input delay), relays the log, compares the clients' state digests with the
 * host's, and keeps the host's latest snapshot so a player who drifted or reconnects can catch up.
 *
 * A turn is `turn_ms` (1 s) of real time since the room started. Commands name seats, not accounts; the log and
 * the snapshot exist only while the room runs and are deleted when it finishes or closes (and with an account).
 *
 * Loaded at the end of rooms.php: every room constant and helper is defined by then.
 */

/** Roles of role co-op, and the default role of each seat (src/sim/coop.ts DEFAULT_ROLES). */
const EPD_COOP_ROLES = ['calls', 'dispatch', 'radio'];
const EPD_COOP_DEFAULT_ROLES = ['dispatch', 'calls', 'radio', 'dispatch'];
/** Room modes that run a shared shift over the log: role co-op and sector co-op. */
const EPD_COOP_MODES = ['role', 'sector'];
/** Seat of the commands the server itself sequences. */
const EPD_COOP_SERVER_SEAT = -1;
/** At most this many commands per batch, and this many bytes per batch body. */
const EPD_COOP_BATCH_MAX = 20;
const EPD_COOP_BATCH_BYTES = 4096;
/** Batches per player: a bucket of this many, refilled at this rate per second. */
const EPD_COOP_BURST = 4;
const EPD_COOP_RATE = 2.0;
/** Commands per room in all. */
const EPD_COOP_ROOM_MAX = 20000;
/** Commands per log answer. */
const EPD_COOP_LOG_PAGE = 500;
/** A player whose last poll is older than this leaves their seat to the others (`left`) until they poll again. */
const EPD_COOP_AWAY_MS = 60 * 1000;
/** A running co-op room nobody polled for this long is finished. */
const EPD_COOP_IDLE_MS = 15 * 60 * 1000;
/** Snapshots: at most 2 MB gzipped, at most one per 10 s unless a player asked for one. */
const EPD_COOP_SNAPSHOT_MAX = 2 * 1024 * 1024;
const EPD_COOP_SNAPSHOT_EVERY_MS = 10 * 1000;
/** Host digests kept for comparison ("turn:hash" pairs). */
const EPD_COOP_REF_KEEP = 8;
/** Kinds only the host may post. */
const EPD_COOP_HOST_KINDS = ['speed', 'end'];

/**
 * Argument shapes of the commands a player may post (src/sim/coop.ts COMMAND_ROLE). The sim checks the meaning and
 * the permissions; the server only lets well-formed, small commands into the log.
 *
 * id: a game id (i12, u3, c4, r40); ids: up to 12 of them; word: a lower-case keyword; word?: the same or '';
 * ref: a person id or a plate, or ''; prio: 1..4; prio0: 0..4; bit: 0 or 1; speed: 0..4; num: a positive whole
 * number (a lend request's id); text64 and text140: plain text of at most that many characters.
 */
const EPD_COOP_KINDS = [
    'ack' => ['id'],
    'prio' => ['id', 'prio'],
    'send' => ['id', 'ids'],
    'recall' => ['id'],
    'close' => ['id', 'word', 'word?'],
    'agency' => ['id', 'word'],
    'pursuit' => ['id', 'word'],
    'reply' => ['id', 'word'],
    'break' => ['id', 'bit'],
    'check' => ['id', 'ref', 'ref'],
    'answer' => ['id'],
    'ask' => ['id', 'word'],
    'interp' => ['id'],
    'endcall' => ['id', 'word', 'prio0', 'word?'],
    'q' => ['word', 'text64'],
    'ping' => ['text140'],
    'speed' => ['speed'],
    'end' => [],
    // Sector co-op: lend a crew across a border [incident, unit], and the other desk's answer [request, yes].
    'lend' => ['id', 'id'],
    'lendans' => ['num', 'bit'],
];

function epd_coop_is_coop(array $room): bool
{
    return in_array((string) $room['mode'], EPD_COOP_MODES, true);
}

/** The server's turn now: whole turns since the start. */
function epd_coop_turn(array $room, int $now): int
{
    $ms = max(100, (int) ($room['turn_ms'] ?? 1000));
    return intdiv(max(0, $now - (int) $room['started']), $ms);
}

/** A player's role: the one they chose, else their seat's default. */
function epd_coop_role_of(array $player): string
{
    $role = (string) ($player['role'] ?? '');
    return in_array($role, EPD_COOP_ROLES, true) ? $role : EPD_COOP_DEFAULT_ROLES[((int) $player['seat']) % 4];
}

/**
 * A player's desk in a sector room: the one they picked if the room still has it, else their seat's default (the
 * seats spread over the desks in order, src/sim/desks.ts defaultDesk). '' in the other modes.
 */
function epd_coop_desk_of(array $room, array $player): string
{
    $desks = epd_room_desks($room);
    if ((string) $room['mode'] !== 'sector' || $desks === []) {
        return '';
    }
    $desk = (string) ($player['desk'] ?? '');
    return in_array($desk, $desks, true) ? $desk : $desks[((int) $player['seat']) % count($desks)];
}

/** Append one command to the log; returns its id. */
function epd_coop_append(PDO $db, int $roomId, int $seat, ?int $userId, int $turn, string $kind, string $args, int $now): int
{
    $db->prepare('INSERT INTO room_commands (room_id, user_id, seat, turn, kind, args, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([$roomId, $userId, $seat, $turn, $kind, $args, $now]);
    $id = (int) $db->lastInsertId();
    $db->prepare('UPDATE rooms SET cmd_count = cmd_count + 1 WHERE id = ?')->execute([$roomId]);
    return $id;
}

/** A command of the server's own, stamped like a player's (now + the input delay). */
function epd_coop_system(PDO $db, array $room, string $kind, array $args, int $now): int
{
    $turn = epd_coop_turn($room, $now) + (int) ($room['input_delay'] ?? 2);
    return epd_coop_append($db, (int) $room['id'], EPD_COOP_SERVER_SEAT, null, $turn, $kind, epd_json($args), $now);
}

/**
 * The host starts a co-op room: the first command (turn 0) tells every client who sits where with which role (role
 * co-op) or at which desk (sector co-op: `[seat, desk, name]`).
 *
 * @param list<array<string, mixed>> $players players still in the room
 */
function epd_coop_setup(PDO $db, array $room, array $players, int $hostId, int $now): void
{
    $rows = [];
    $hostSeat = 0;
    foreach ($players as $p) {
        $rows[] = [(int) $p['seat'], (string) $room['mode'] === 'sector' ? epd_coop_desk_of($room, $p) : epd_coop_role_of($p), (string) $p['name']];
        if ((int) $p['user_id'] === $hostId) {
            $hostSeat = (int) $p['seat'];
        }
    }
    usort($rows, static fn (array $a, array $b): int => $a[0] <=> $b[0]);
    epd_coop_append($db, (int) $room['id'], EPD_COOP_SERVER_SEAT, null, 0, 'setup', epd_json([$hostSeat, $rows]), $now);
    $db->prepare('UPDATE rooms SET host_seat = ? WHERE id = ?')->execute([$hostSeat, $room['id']]);
}

/** The log and the snapshot of a room go (it finished or closed, or it is swept). */
function epd_coop_forget_room(PDO $db, int $roomId): void
{
    $db->prepare('DELETE FROM room_commands WHERE room_id = ?')->execute([$roomId]);
    $db->prepare('DELETE FROM room_snapshots WHERE room_id = ?')->execute([$roomId]);
}

/**
 * Seats leaving and coming back, and the host's role, as commands in the log. A player still in the room who has not
 * polled for a minute (or who left with the button) is `left`: the others take their role over. Polling again (or
 * joining back) is `back`. The host's role (speed, the reference digest, snapshots) passes to the earliest-joined
 * player still connected and is announced with `host`. Runs inside the caller's write transaction.
 */
function epd_coop_sync_seats(PDO $db, array $room, int $now, ?int $pollingUser = null): void
{
    if (!epd_coop_is_coop($room) || $room['state'] !== 'running') {
        return;
    }
    $roomId = (int) $room['id'];
    $stmt = $db->prepare('SELECT user_id, seat, joined, seen, left_at, away FROM room_players WHERE room_id = ? ORDER BY joined, seat');
    $stmt->execute([$roomId]);
    $players = $stmt->fetchAll();
    $here = [];
    foreach ($players as $p) {
        $uid = (int) $p['user_id'];
        $gone = $p['left_at'] !== null || ($uid !== $pollingUser && (int) $p['seen'] < $now - EPD_COOP_AWAY_MS);
        if ($gone && (int) $p['away'] === 0) {
            $db->prepare('UPDATE room_players SET away = 1 WHERE room_id = ? AND user_id = ?')->execute([$roomId, $uid]);
            epd_coop_system($db, $room, 'left', [(int) $p['seat']], $now);
        } elseif (!$gone && (int) $p['away'] === 1) {
            $db->prepare('UPDATE room_players SET away = 0 WHERE room_id = ? AND user_id = ?')->execute([$roomId, $uid]);
            epd_coop_system($db, $room, 'back', [(int) $p['seat']], $now);
        }
        if (!$gone) {
            $here[] = $p;
        }
    }
    // The host's role: whoever holds it while connected, else the earliest-joined player still here.
    $hostId = $room['host_id'] === null ? null : (int) $room['host_id'];
    $host = null;
    foreach ($here as $p) {
        if ((int) $p['user_id'] === $hostId) {
            $host = $p;
        }
    }
    $host ??= $here[0] ?? null;
    if ($host === null) {
        return;
    }
    if ((int) $host['user_id'] !== $hostId) {
        epd_room_bump($db, $roomId, $now, ['host_id' => (int) $host['user_id']]);
    }
    if ((int) $host['seat'] !== (int) $room['host_seat']) {
        epd_coop_system($db, $room, 'host', [(int) $host['seat']], $now);
        // A new host uploads a snapshot at once.
        $db->prepare('UPDATE rooms SET host_seat = ?, snap_req = 1 WHERE id = ?')->execute([(int) $host['seat'], $roomId]);
    }
}

/** Would epd_coop_sync_seats write anything? (Polls stay reads while nothing changes.) */
function epd_coop_seats_dirty(PDO $db, array $room, int $now, int $pollingUser): bool
{
    if (!epd_coop_is_coop($room) || $room['state'] !== 'running') {
        return false;
    }
    $stmt = $db->prepare('SELECT user_id, seat, seen, left_at, away FROM room_players WHERE room_id = ? ORDER BY joined, seat');
    $stmt->execute([$room['id']]);
    $hostId = $room['host_id'] === null ? null : (int) $room['host_id'];
    $hostHere = false;
    $first = null;
    foreach ($stmt->fetchAll() as $p) {
        $uid = (int) $p['user_id'];
        $gone = $p['left_at'] !== null || ($uid !== $pollingUser && (int) $p['seen'] < $now - EPD_COOP_AWAY_MS);
        if ($gone !== ((int) $p['away'] === 1)) {
            return true;
        }
        if (!$gone) {
            $first ??= $p;
            $hostHere = $hostHere || $uid === $hostId;
        }
    }
    if ($first === null) {
        return false;
    }
    if (!$hostHere) {
        return true;
    }
    $stmt = $db->prepare('SELECT seat FROM room_players WHERE room_id = ? AND user_id = ?');
    $stmt->execute([$room['id'], $hostId]);
    return (int) $stmt->fetchColumn() !== (int) $room['host_seat'];
}

/**
 * Account deletion inside a running co-op room: the seat leaves the shift (`left`, and `host` if it hosted) and the
 * host is asked for a fresh snapshot, so nobody needs the deleted player's commands to catch up.
 */
function epd_coop_forget_seat(PDO $db, array $room, int $userId, int $now): void
{
    if (!epd_coop_is_coop($room) || $room['state'] !== 'running') {
        return;
    }
    $member = epd_room_member($db, (int) $room['id'], $userId);
    if ($member !== null && (int) $member['away'] === 0) {
        epd_coop_system($db, $room, 'left', [(int) $member['seat']], $now);
    }
    $db->prepare('UPDATE rooms SET snap_req = 1 WHERE id = ?')->execute([$room['id']]);
}

// ---------------------------------------------------------------- validation

function epd_coop_bad(string $field): never
{
    epd_fail(400, 'invalid_command', 'Vigane käsk: ' . $field . '.', [], ['field' => $field]);
}

function epd_coop_plain_text(mixed $v, int $max): bool
{
    return is_string($v) && mb_strlen($v) <= $max && preg_match('/[\x00-\x1F\x7F]/', $v) !== 1 && mb_check_encoding($v, 'UTF-8');
}

/** One argument against its shape. */
function epd_coop_arg_ok(string $shape, mixed $v): bool
{
    return match ($shape) {
        'id' => is_string($v) && preg_match('/^[A-Za-z0-9_-]{1,40}$/', $v) === 1,
        'ids' => is_array($v) && array_is_list($v) && count($v) >= 1 && count($v) <= 12
            && count(array_filter($v, static fn ($x): bool => is_string($x) && preg_match('/^[A-Za-z0-9_-]{1,40}$/', $x) === 1)) === count($v),
        'word' => is_string($v) && preg_match('/^[a-z_]{1,24}$/', $v) === 1,
        'word?' => is_string($v) && preg_match('/^[a-z_]{0,24}$/', $v) === 1,
        'ref' => is_string($v) && preg_match('/^[\p{L}\p{N} _.-]{0,40}$/u', $v) === 1,
        'prio' => is_int($v) && $v >= 1 && $v <= 4,
        'prio0' => is_int($v) && $v >= 0 && $v <= 4,
        'bit' => $v === 0 || $v === 1,
        'speed' => is_int($v) && $v >= 0 && $v <= 4,
        'num' => is_int($v) && $v >= 1 && $v <= 1_000_000,
        'text64' => epd_coop_plain_text($v, 64) && trim($v) !== '',
        'text140' => epd_coop_plain_text($v, 140) && trim($v) !== '',
        default => false,
    };
}

/**
 * A batch from a body: a list of `{ k, a }` of known kinds with well-formed arguments.
 *
 * @param array<string, mixed> $body
 * @return list<array{k: string, a: list<mixed>}>
 */
function epd_coop_batch(array $body): array
{
    $cmds = $body['cmds'] ?? null;
    if (!is_array($cmds) || !array_is_list($cmds) || $cmds === []) {
        epd_coop_bad('cmds');
    }
    if (count($cmds) > EPD_COOP_BATCH_MAX) {
        epd_fail(400, 'too_many_commands', 'Liiga palju käske korraga.', [], ['field' => 'cmds']);
    }
    $out = [];
    foreach ($cmds as $i => $cmd) {
        if (!is_array($cmd)) {
            epd_coop_bad("cmds[$i]");
        }
        $kind = $cmd['k'] ?? null;
        $args = $cmd['a'] ?? [];
        if (!is_string($kind) || !array_key_exists($kind, EPD_COOP_KINDS)) {
            epd_coop_bad("cmds[$i].k");
        }
        $shape = EPD_COOP_KINDS[$kind];
        $optional = count(array_filter($shape, static fn (string $s): bool => str_ends_with($s, '?')));
        if (!is_array($args) || !array_is_list($args) || count($args) > count($shape) || count($args) < count($shape) - $optional) {
            epd_coop_bad("cmds[$i].a");
        }
        foreach ($args as $j => $v) {
            if (!epd_coop_arg_ok($shape[$j], $v)) {
                epd_coop_bad("cmds[$i].a[$j]");
            }
        }
        $out[] = ['k' => $kind, 'a' => $args];
    }
    return $out;
}

/** The co-op room a member asks about (running, a co-op mode), inside the caller's transaction. */
function epd_coop_room_for_member(PDO $db, string $code, int $userId, int $now): array
{
    [$room, $member] = epd_room_for_member($db, $code, $userId, $now);
    if (!epd_coop_is_coop($room)) {
        epd_fail(409, 'not_coop', 'See ruum ei mängi ühisvahetust.');
    }
    return [$room, $member];
}

/** Token bucket per player for command batches; 429 when empty. */
function epd_coop_rate(PDO $db, array $room, array $member, int $now): void
{
    $last = (int) $member['cmd_at'];
    $tokens = (float) $member['cmd_tokens'];
    $tokens = min((float) EPD_COOP_BURST, $tokens + ($last > 0 ? max(0, $now - $last) / 1000 * EPD_COOP_RATE : EPD_COOP_BURST));
    if ($tokens < 1.0) {
        epd_fail(429, 'rate_limited', 'Liiga palju käske, oota hetk.', ['Retry-After' => '1']);
    }
    $db->prepare('UPDATE room_players SET cmd_tokens = ?, cmd_at = ? WHERE room_id = ? AND user_id = ?')
        ->execute([$tokens - 1.0, $now, $room['id'], $member['user_id']]);
}

// ---------------------------------------------------------------- routes

/**
 * POST /api/rooms/{code}/cmd `{ cmds: [{ k, a }] }`: a batch of the caller's commands. Each is stamped with the
 * server's turn plus the input delay and gets the next log id. Answers `{ ok, turn, ids }`.
 */
function epd_route_coop_cmd(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $batch = epd_coop_batch(epd_json_body(EPD_COOP_BATCH_BYTES));
    $db = epd_db();
    $now = epd_room_now_ms();
    [$turn, $ids] = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $batch, $now): array {
        [$room, $member] = epd_coop_room_for_member($db, $code, $userId, $now);
        if ($room['state'] !== 'running') {
            epd_fail(409, 'not_running', 'Ühisvahetus ei käi.');
        }
        if ($member['left_at'] !== null) {
            epd_fail(409, 'left_room', 'Sa lahkusid sellest ruumist.');
        }
        foreach ($batch as $cmd) {
            if (in_array($cmd['k'], EPD_COOP_HOST_KINDS, true) && (int) ($room['host_id'] ?? 0) !== $userId) {
                epd_fail(403, 'not_host', 'Seda saab teha ainult ruumi juht.');
            }
        }
        if ((int) $room['cmd_count'] + count($batch) > EPD_COOP_ROOM_MAX) {
            epd_fail(409, 'log_full', 'Selle ruumi käskude logi on täis.');
        }
        epd_coop_rate($db, $room, $member, $now);
        $turn = epd_coop_turn($room, $now) + (int) $room['input_delay'];
        $ids = [];
        foreach ($batch as $cmd) {
            $ids[] = epd_coop_append($db, (int) $room['id'], (int) $member['seat'], $userId, $turn, $cmd['k'], epd_json($cmd['a']), $now);
        }
        return [$turn, $ids];
    });
    return epd_reply(['ok' => true, 'turn' => $turn, 'ids' => $ids]);
}

/** The `h` parameter: "<turn>:<16 hex digits>", or null. */
function epd_coop_hash_param(): ?array
{
    $raw = $_GET['h'] ?? null;
    if ($raw === null || $raw === '') {
        return null;
    }
    if (!is_string($raw) || preg_match('/^(\d{1,7}):([0-9a-f]{16})$/', $raw, $m) !== 1) {
        epd_fail(400, 'invalid_hash', 'Vigane kontrollsumma.', [], ['field' => 'h']);
    }
    return [(int) $m[1], $m[2]];
}

/** "turn:hash,turn:hash" of the host, as a map. */
function epd_coop_refs(array $room): array
{
    $out = [];
    foreach (explode(',', (string) ($room['ref_hashes'] ?? '')) as $pair) {
        if (preg_match('/^(\d+):([0-9a-f]{16})$/', $pair, $m) === 1) {
            $out[(int) $m[1]] = $m[2];
        }
    }
    return $out;
}

/**
 * A digest arrives: the host's goes into the room's references and is compared with the others' latest; anybody
 * else's is compared with the host's of the same turn. A mismatch flags that player (`resync`) and asks the host
 * for a snapshot. Inside the caller's transaction.
 */
function epd_coop_take_hash(PDO $db, array $room, array $member, int $turn, string $hash, int $now): void
{
    $roomId = (int) $room['id'];
    $isHost = (int) ($room['host_id'] ?? 0) === (int) $member['user_id'];
    $flag = $db->prepare('UPDATE room_players SET resync = ? WHERE room_id = ? AND user_id = ? AND resync < 0');
    if ($isHost) {
        $refs = epd_coop_refs($room);
        $refs[$turn] = $hash;
        ksort($refs);
        $refs = array_slice($refs, -EPD_COOP_REF_KEEP, null, true);
        $pairs = [];
        foreach ($refs as $t => $h) {
            $pairs[] = $t . ':' . $h;
        }
        $db->prepare('UPDATE rooms SET ref_hashes = ? WHERE id = ?')->execute([implode(',', $pairs), $roomId]);
        $stmt = $db->prepare('SELECT user_id, hash FROM room_players WHERE room_id = ? AND user_id <> ? AND hash_turn = ? AND left_at IS NULL');
        $stmt->execute([$roomId, $member['user_id'], $turn]);
        $bad = 0;
        foreach ($stmt->fetchAll() as $p) {
            if ((string) $p['hash'] !== $hash) {
                $flag->execute([$turn, $roomId, $p['user_id']]);
                $bad++;
            }
        }
        if ($bad > 0) {
            $db->prepare('UPDATE rooms SET snap_req = 1 WHERE id = ?')->execute([$roomId]);
        }
        return;
    }
    $db->prepare('UPDATE room_players SET hash_turn = ?, hash = ? WHERE room_id = ? AND user_id = ?')
        ->execute([$turn, $hash, $roomId, $member['user_id']]);
    $refs = epd_coop_refs($room);
    if (isset($refs[$turn]) && $refs[$turn] !== $hash) {
        $flag->execute([$turn, $roomId, $member['user_id']]);
        $db->prepare('UPDATE rooms SET snap_req = 1 WHERE id = ?')->execute([$roomId]);
    }
}

/**
 * GET /api/rooms/{code}/log?after=<id>&h=<turn>:<hash>&ack=1: the server's turn and clock, the commands after `after`
 * (at most 500, `more` when there are others), the host's seat, the caller's seat and whether the caller must
 * resync. `h` reports the caller's digest; `ack=1` says the caller has just resynced. Also the caller's presence:
 * polling keeps the seat, a minute without it hands the role to the others.
 */
function epd_route_coop_log(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $after = $_GET['after'] ?? '0';
    if (!is_string($after) || preg_match('/^\d{1,12}$/', $after) !== 1) {
        epd_fail(400, 'invalid_after', 'Vigane logi asukoht.', [], ['field' => 'after']);
    }
    $after = (int) $after;
    $hash = epd_coop_hash_param();
    $ack = ($_GET['ack'] ?? '') === '1';
    $db = epd_db();
    $now = epd_room_now_ms();
    [$room, $member] = epd_coop_room_for_member($db, $code, $userId, $now);
    $running = $room['state'] === 'running';
    // Writes only when something changed: presence every 5 s, a digest every 10 turns, seats leaving or returning.
    $seen = $member['left_at'] === null && (int) $member['seen'] < $now - EPD_ROOM_SEEN_EVERY_MS;
    $dirty = $running && ($seen || $hash !== null || $ack || epd_coop_seats_dirty($db, $room, $now, $userId));
    if ($dirty) {
        epd_room_tx($db, static function (PDO $db) use ($room, $member, $userId, $now, $hash, $ack, $seen): void {
            $room = epd_room_by_id($db, (int) $room['id']) ?? $room;
            if ($seen || $member['left_at'] === null) {
                $db->prepare('UPDATE room_players SET seen = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL')
                    ->execute([$now, $room['id'], $userId]);
            }
            if ($ack) {
                $db->prepare('UPDATE room_players SET resync = -1 WHERE room_id = ? AND user_id = ?')->execute([$room['id'], $userId]);
            }
            epd_coop_sync_seats($db, $room, $now, $member['left_at'] === null ? $userId : null);
            $room = epd_room_by_id($db, (int) $room['id']) ?? $room;
            $member = epd_room_member($db, (int) $room['id'], $userId) ?? $member;
            if ($hash !== null && $member['left_at'] === null && $hash[0] <= epd_coop_turn($room, $now) + 1) {
                epd_coop_take_hash($db, $room, $member, $hash[0], $hash[1], $now);
            }
        });
        $room = epd_room_by_id($db, (int) $room['id']) ?? $room;
        $member = epd_room_member($db, (int) $room['id'], $userId) ?? $member;
    }
    $stmt = $db->prepare('SELECT id, turn, seat, kind, args FROM room_commands WHERE room_id = ? AND id > ? ORDER BY id LIMIT ' . (EPD_COOP_LOG_PAGE + 1));
    $stmt->execute([$room['id'], $after]);
    $rows = $stmt->fetchAll();
    $more = count($rows) > EPD_COOP_LOG_PAGE;
    $parts = [];
    foreach (array_slice($rows, 0, EPD_COOP_LOG_PAGE) as $r) {
        // The arguments were validated and encoded on the way in: spliced as stored.
        $parts[] = '{"id":' . (int) $r['id'] . ',"t":' . (int) $r['turn'] . ',"s":' . (int) $r['seat'] . ',"k":' . epd_json((string) $r['kind']) . ',"a":' . (string) $r['args'] . '}';
    }
    $snap = $db->prepare('SELECT turn FROM room_snapshots WHERE room_id = ?');
    $snap->execute([$room['id']]);
    $snapTurn = $snap->fetchColumn();
    $hostSeat = (int) $room['host_seat'];
    $isHost = (int) ($room['host_id'] ?? 0) === $userId;
    $head = [
        'state' => (string) $room['state'],
        'turn' => $room['started'] === null ? 0 : epd_coop_turn($room, $now),
        'now' => $now,
        'started' => $room['started'] === null ? null : (int) $room['started'],
        'turnMs' => (int) $room['turn_ms'],
        'delay' => (int) $room['input_delay'],
        'seat' => (int) $member['seat'],
        'host' => $hostSeat,
        'isHost' => $isHost,
        'resync' => (int) $member['resync'] >= 0,
        'snapReq' => $isHost && (int) $room['snap_req'] === 1,
        'snap' => $snapTurn === false ? null : (int) $snapTurn,
        'more' => $more,
    ];
    $json = substr(epd_json($head), 0, -1) . ',"cmds":[' . implode(',', $parts) . ']}';
    return new ApiReply(200, $json);
}

/** Query integer parameter $name in 0..$max, else 400. */
function epd_coop_int_param(string $name, int $max): int
{
    $raw = $_GET[$name] ?? null;
    if (!is_string($raw) || preg_match('/^\d{1,12}$/', $raw) !== 1 || (int) $raw > $max) {
        epd_fail(400, 'invalid_snapshot', 'Vigane hetktõmmis: ' . $name . '.', [], ['field' => $name]);
    }
    return (int) $raw;
}

/**
 * PUT /api/rooms/{code}/snapshot?turn=<t>&cmd=<id>: the host's gzipped shift state at the end of turn `t`, which
 * holds every command up to log id `cmd`. At most 2 MB, gzip only, at most one per 10 s unless asked for.
 */
function epd_route_coop_snapshot_put(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $data = epd_raw_body(EPD_COOP_SNAPSHOT_MAX);
    if (strlen($data) < 18 || substr($data, 0, 2) !== "\x1f\x8b") {
        epd_fail(400, 'not_gzip', 'Hetktõmmis peab olema gzip-pakitud.');
    }
    $db = epd_db();
    $now = epd_room_now_ms();
    $turn = epd_coop_int_param('turn', 10_000_000);
    $cmd = epd_coop_int_param('cmd', PHP_INT_MAX);
    epd_room_tx($db, static function (PDO $db) use ($code, $userId, $data, $now, $turn, $cmd): void {
        [$room] = epd_coop_room_for_member($db, $code, $userId, $now);
        if ($room['state'] !== 'running') {
            epd_fail(409, 'not_running', 'Ühisvahetus ei käi.');
        }
        if ((int) ($room['host_id'] ?? 0) !== $userId) {
            epd_fail(403, 'not_host', 'Hetktõmmise saadab ainult ruumi juht.');
        }
        if ($turn > epd_coop_turn($room, $now) + 1) {
            epd_fail(400, 'invalid_snapshot', 'Vigane hetktõmmis: turn.', [], ['field' => 'turn']);
        }
        $stmt = $db->prepare('SELECT COALESCE(MAX(id), 0) FROM room_commands WHERE room_id = ?');
        $stmt->execute([$room['id']]);
        if ($cmd > (int) $stmt->fetchColumn()) {
            epd_fail(400, 'invalid_snapshot', 'Vigane hetktõmmis: cmd.', [], ['field' => 'cmd']);
        }
        $stmt = $db->prepare('SELECT at FROM room_snapshots WHERE room_id = ?');
        $stmt->execute([$room['id']]);
        $last = $stmt->fetchColumn();
        if ($last !== false && (int) $last > $now - EPD_COOP_SNAPSHOT_EVERY_MS && (int) $room['snap_req'] !== 1) {
            epd_fail(429, 'rate_limited', 'Hetktõmmis saadeti just.', ['Retry-After' => '10']);
        }
        $put = $db->prepare(
            'INSERT INTO room_snapshots (room_id, user_id, turn, cmd_id, data, size, at) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (room_id) DO UPDATE SET user_id = excluded.user_id, turn = excluded.turn, cmd_id = excluded.cmd_id,
             data = excluded.data, size = excluded.size, at = excluded.at'
        );
        $put->bindValue(1, (int) $room['id'], PDO::PARAM_INT);
        $put->bindValue(2, $userId, PDO::PARAM_INT);
        $put->bindValue(3, $turn, PDO::PARAM_INT);
        $put->bindValue(4, $cmd, PDO::PARAM_INT);
        $put->bindValue(5, $data, PDO::PARAM_LOB);
        $put->bindValue(6, strlen($data), PDO::PARAM_INT);
        $put->bindValue(7, $now, PDO::PARAM_INT);
        $put->execute();
        $db->prepare('UPDATE rooms SET snap_req = 0 WHERE id = ?')->execute([$room['id']]);
    });
    return epd_reply(['ok' => true, 'turn' => $turn, 'cmd' => $cmd, 'size' => strlen($data)]);
}

/** GET /api/rooms/{code}/snapshot: the latest snapshot as gzip bytes, its turn and log id in X-EPD-Turn and X-EPD-Cmd. */
function epd_route_coop_snapshot_get(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $db = epd_db();
    $now = epd_room_now_ms();
    [$room] = epd_coop_room_for_member($db, $code, $userId, $now);
    $stmt = $db->prepare('SELECT turn, cmd_id, data FROM room_snapshots WHERE room_id = ?');
    $stmt->execute([$room['id']]);
    $row = $stmt->fetch();
    if (!is_array($row)) {
        epd_fail(404, 'no_snapshot', 'Hetktõmmist veel ei ole.');
    }
    $data = is_resource($row['data']) ? (string) stream_get_contents($row['data']) : (string) $row['data'];
    return new ApiReply(200, $data, ['X-EPD-Turn' => (string) (int) $row['turn'], 'X-EPD-Cmd' => (string) (int) $row['cmd_id']], 'application/gzip');
}

/** POST /api/rooms/{code}/role `{ role }`: a player picks their role in a co-op lobby. */
function epd_route_coop_role(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $role = epd_json_body()['role'] ?? null;
    if (!is_string($role) || !in_array($role, EPD_COOP_ROLES, true)) {
        epd_room_invalid('role');
    }
    $db = epd_db();
    $now = epd_room_now_ms();
    $clean = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $role, $now): string {
        [$room, $member] = epd_coop_room_for_member($db, $code, $userId, $now);
        if ($room['state'] !== 'lobby') {
            epd_fail(409, 'room_started', 'Selle ruumi vahetus on juba alanud.');
        }
        if ((string) $member['role'] !== $role) {
            $db->prepare('UPDATE room_players SET role = ?, seen = ? WHERE room_id = ? AND user_id = ?')->execute([$role, $now, $room['id'], $userId]);
            epd_room_bump($db, (int) $room['id'], $now);
        }
        return (string) $room['code'];
    });
    return epd_room_reply($db, $clean, $userId, $now);
}

/** POST /api/rooms/{code}/desk `{ desk }`: a player picks their desk in a sector room's lobby (one of the room's desks). */
function epd_route_coop_desk(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $desk = epd_json_body()['desk'] ?? null;
    if (!is_string($desk) || preg_match('/^[a-z]+-[a-z0-9][a-z0-9-]{0,40}$/', $desk) !== 1) {
        epd_room_invalid('desk');
    }
    $db = epd_db();
    $now = epd_room_now_ms();
    $clean = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $desk, $now): string {
        [$room, $member] = epd_coop_room_for_member($db, $code, $userId, $now);
        if ((string) $room['mode'] !== 'sector') {
            epd_fail(409, 'not_sector', 'Selles ruumis ei ole sektorite töölaudu.');
        }
        if ($room['state'] !== 'lobby') {
            epd_fail(409, 'room_started', 'Selle ruumi vahetus on juba alanud.');
        }
        if (!in_array($desk, epd_room_desks($room), true)) {
            epd_room_invalid('desk');
        }
        if ((string) $member['desk'] !== $desk) {
            $db->prepare('UPDATE room_players SET desk = ?, seen = ? WHERE room_id = ? AND user_id = ?')->execute([$desk, $now, $room['id'], $userId]);
            epd_room_bump($db, (int) $room['id'], $now);
        }
        return (string) $room['code'];
    });
    return epd_room_reply($db, $clean, $userId, $now);
}
