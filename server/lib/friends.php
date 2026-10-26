<?php

declare(strict_types=1);

/**
 * Sõbrad (2.40.0, docs/MULTIPLAYER.md section 18): friends by user name, who of them is online and what they do, and
 * invitations to a room or to a challenge.
 *
 * - A friendship starts as a request (`friends.state` 'asked', `user_id` asked `friend_id`) and holds once the other
 *   accepts ('friends'); either may end it. Asking someone who already asked you accepts.
 * - Presence: a signed-in client says every so often that it is here and what it does (the menu, a shift, a room).
 *   Only friends see it, and only whether one is online now and what they do (no "last seen").
 * - An invitation goes to friends only: to the room the sender is in (while it takes players) or to a challenge. The
 *   invited player's client gets it with its next presence call and shows it in the menu.
 */

/** Friends per account (asked and accepted together). */
const EPD_FRIENDS_MAX = 100;
/** Friend requests per account and hour. */
const EPD_FRIENDS_ASK_LIMIT = 30;
/** Online: seen within this long (the client says it is here every 20 to 60 seconds). */
const EPD_PRESENCE_ONLINE_MS = 150 * 1000;
/** A presence call more often than this changes nothing (it still answers). */
const EPD_PRESENCE_EVERY_MS = 5 * 1000;
/** What a client may say it does. */
const EPD_PRESENCE_WHAT = ['menu', 'shift', 'room'];
/** An invitation to a room is good this long, one to a challenge this long. */
const EPD_INVITE_ROOM_MS = 30 * 60 * 1000;
const EPD_INVITE_CHALLENGE_MS = 7 * 24 * 3600 * 1000;
/** Invitations per account and hour, and friends per invitation call. */
const EPD_INVITE_LIMIT = 60;
const EPD_INVITE_TO_MAX = 10;
/** Invitations a presence call brings at most. */
const EPD_INVITE_SHOWN = 10;

function epd_friend_not_found(): never
{
    epd_fail(404, 'friend_not_found', 'Sellist mängijat ei ole.');
}

/** The friendship row between two players, whichever asked, or null. */
function epd_friend_row(PDO $db, int $a, int $b): ?array
{
    $stmt = $db->prepare('SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)');
    $stmt->execute([$a, $b, $b, $a]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

/** Are the two friends (accepted)? */
function epd_are_friends(PDO $db, int $a, int $b): bool
{
    $row = epd_friend_row($db, $a, $b);
    return $row !== null && $row['state'] === 'friends';
}

/**
 * The player's friends with what they do now, the requests they sent and the ones sent to them.
 *
 * @return array{friends: list<array<string, mixed>>, asked: list<array<string, mixed>>, asking: list<array<string, mixed>>}
 */
function epd_friends_json(PDO $db, int $me, int $now): array
{
    $stmt = $db->prepare(
        'SELECT f.user_id, f.friend_id, f.state, f.created, f.accepted, u.id, u.name, u.avatar, p.seen, p.what, p.room
         FROM friends f
         JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
         LEFT JOIN presence p ON p.user_id = u.id
         WHERE f.user_id = ? OR f.friend_id = ?'
    );
    $stmt->execute([$me, $me, $me]);
    $friends = [];
    $asked = [];
    $asking = [];
    foreach ($stmt->fetchAll() as $r) {
        $who = ['id' => (int) $r['id'], 'name' => (string) $r['name']];
        if ((string) $r['avatar'] !== '') {
            $who['avatar'] = (string) $r['avatar'];
        }
        if ($r['state'] !== 'friends') {
            if ((int) $r['user_id'] === $me) {
                $asked[] = $who + ['since' => (int) $r['created']];
            } else {
                $asking[] = $who + ['since' => (int) $r['created']];
            }
            continue;
        }
        $online = $r['seen'] !== null && (int) $r['seen'] > $now - EPD_PRESENCE_ONLINE_MS;
        $who['online'] = $online;
        $who['since'] = (int) ($r['accepted'] ?? $r['created']);
        if ($online && in_array((string) $r['what'], EPD_PRESENCE_WHAT, true)) {
            $who['what'] = (string) $r['what'];
            // In a room: the room, and whether it takes players (a friend may join it from the list).
            $code = (string) $r['room'];
            if ($code !== '') {
                $room = epd_room_by_code($db, $code);
                if ($room !== null && $room['state'] !== 'closed') {
                    $who['room'] = [
                        'code' => (string) $room['code'],
                        'mode' => (string) $room['mode'],
                        'state' => (string) $room['state'],
                        'players' => epd_room_count($db, (int) $room['id']),
                        'max' => EPD_ROOM_MAX_PLAYERS,
                    ];
                }
            }
        }
        $friends[] = $who;
    }
    // Online first, then by name.
    usort($friends, static fn (array $a, array $b): int => [(int) !$a['online'], mb_strtolower($a['name'])] <=> [(int) !$b['online'], mb_strtolower($b['name'])]);
    $byName = static fn (array $a, array $b): int => mb_strtolower($a['name']) <=> mb_strtolower($b['name']);
    usort($asked, $byName);
    usort($asking, $byName);
    return ['friends' => $friends, 'asked' => $asked, 'asking' => $asking];
}

/** GET /api/friends (an account): the friends, what they do now, and the requests either way. */
function epd_route_friends_get(): ApiReply
{
    $user = epd_require_user();
    return epd_reply(epd_friends_json(epd_db(), (int) $user['id'], epd_room_now_ms()));
}

/**
 * POST /api/friends `{ name }` (an account): ask a player by their user name to be friends. Asking one who already
 * asked you makes you friends; asking a friend again changes nothing. Answers the list as GET does, and `state`:
 * 'asked' or 'friends'.
 */
function epd_route_friends_add(): ApiReply
{
    $user = epd_require_user();
    $me = (int) $user['id'];
    $name = epd_clean_name(epd_json_body()['name'] ?? null);
    $db = epd_db();
    $other = $name === '' ? null : epd_find_user_by_key($db, epd_name_key($name));
    if ($other === null || (int) ($other['disabled'] ?? 0) === 1) {
        epd_friend_not_found();
    }
    $them = (int) $other['id'];
    if ($them === $me) {
        epd_fail(400, 'friend_self', 'Iseennast ei saa sõbraks lisada.');
    }
    $now = epd_room_now_ms();
    $key = 'u' . $me;
    $state = epd_transaction($db, static function (PDO $db) use ($me, $them, $now, $key): string {
        $row = epd_friend_row($db, $me, $them);
        if ($row !== null) {
            if ($row['state'] === 'friends' || (int) $row['user_id'] === $me) {
                return (string) $row['state'];
            }
            // They asked first: now friends.
            $db->prepare("UPDATE friends SET state = 'friends', accepted = ? WHERE user_id = ? AND friend_id = ?")
                ->execute([$now, $them, $me]);
            return 'friends';
        }
        if (epd_rate_events($db, 'friend_ask', $key, 3600) >= EPD_FRIENDS_ASK_LIMIT) {
            epd_fail(429, 'rate_limited', 'Liiga palju sõbrakutseid, proovi hiljem uuesti.', ['Retry-After' => '600']);
        }
        foreach ([$me, $them] as $who) {
            $count = $db->prepare('SELECT COUNT(*) FROM friends WHERE user_id = ? OR friend_id = ?');
            $count->execute([$who, $who]);
            if ((int) $count->fetchColumn() >= EPD_FRIENDS_MAX) {
                epd_fail(409, 'friends_full', 'Sõprade nimekiri on täis.');
            }
        }
        epd_rate_event($db, 'friend_ask', $key);
        $db->prepare("INSERT INTO friends (user_id, friend_id, state, created) VALUES (?, ?, 'asked', ?)")->execute([$me, $them, $now]);
        return 'asked';
    });
    return epd_reply(['state' => $state] + epd_friends_json($db, $me, $now));
}

/** POST /api/friends/{id}/accept (an account): accept the request of player {id}. */
function epd_route_friends_accept(string $id): ApiReply
{
    $user = epd_require_user();
    $me = (int) $user['id'];
    $them = (int) $id;
    $db = epd_db();
    $now = epd_room_now_ms();
    $stmt = $db->prepare("UPDATE friends SET state = 'friends', accepted = ? WHERE user_id = ? AND friend_id = ? AND state = 'asked'");
    $stmt->execute([$now, $them, $me]);
    if ($stmt->rowCount() === 0 && !epd_are_friends($db, $me, $them)) {
        epd_fail(404, 'request_not_found', 'Seda sõbrakutset ei ole.');
    }
    return epd_reply(epd_friends_json($db, $me, $now));
}

/**
 * DELETE /api/friends/{id} (an account): end the friendship with player {id}, decline their request or take one's own
 * back. Their invitations to each other go with it.
 */
function epd_route_friends_remove(string $id): ApiReply
{
    $user = epd_require_user();
    $me = (int) $user['id'];
    $them = (int) $id;
    $db = epd_db();
    epd_transaction($db, static function (PDO $db) use ($me, $them): void {
        $db->prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
            ->execute([$me, $them, $them, $me]);
        $db->prepare('DELETE FROM invites WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)')
            ->execute([$me, $them, $them, $me]);
    });
    return epd_reply(epd_friends_json($db, $me, epd_room_now_ms()));
}

/** An invitation as the API shows it, or null when what it invites to is gone (or the player is in the room already). */
function epd_invite_out(PDO $db, array $r, int $now): ?array
{
    $out = [
        'id' => (int) $r['id'],
        'kind' => (string) $r['kind'],
        'code' => (string) $r['code'],
        'at' => (int) $r['created'],
        'from' => ['id' => (int) $r['from_id'], 'name' => (string) $r['name']],
    ];
    if ((string) $r['avatar'] !== '') {
        $out['from']['avatar'] = (string) $r['avatar'];
    }
    if ($r['kind'] === 'room') {
        $room = epd_room_by_code($db, (string) $r['code']);
        // Only while the room takes players (a lobby, or between two rounds) and the player is not in it yet.
        if ($room === null || in_array($room['state'], ['closed', 'running'], true)) {
            return null;
        }
        $in = epd_room_member($db, (int) $room['id'], (int) $r['to_id']);
        if ($in !== null && $in['left_at'] === null) {
            return null;
        }
        $out['room'] = [
            'mode' => (string) $room['mode'],
            'players' => epd_room_count($db, (int) $room['id']),
            'max' => EPD_ROOM_MAX_PLAYERS,
            'regionId' => (string) $room['region_id'],
        ];
        return $out;
    }
    $ch = epd_challenge_find($db, (string) $r['code'], $now);
    if ($ch === null) {
        return null;
    }
    $score = $db->prepare('SELECT score FROM challenge_results WHERE challenge_id = ? AND user_id = ?');
    $score->execute([(int) $ch['id'], (int) $r['from_id']]);
    $s = $score->fetchColumn();
    $setup = json_decode((string) $ch['setup'], true);
    $out['challenge'] = [
        'regionId' => is_array($setup) ? (string) ($setup['regionId'] ?? '') : '',
        'score' => $s === false ? null : (int) $s,
    ];
    return $out;
}

/** The invitations waiting for the player, newest first. */
function epd_invites_for(PDO $db, int $me, int $now): array
{
    $stmt = $db->prepare(
        "SELECT i.*, u.name, u.avatar FROM invites i JOIN users u ON u.id = i.from_id
         WHERE i.to_id = ? AND i.done IS NULL
           AND ((i.kind = 'room' AND i.created > ?) OR (i.kind = 'challenge' AND i.created > ?))
         ORDER BY i.created DESC LIMIT " . EPD_INVITE_SHOWN
    );
    $stmt->execute([$me, $now - EPD_INVITE_ROOM_MS, $now - EPD_INVITE_CHALLENGE_MS]);
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $json = epd_invite_out($db, $r, $now);
        if ($json !== null) {
            $out[] = $json;
        }
    }
    return $out;
}

/**
 * POST /api/presence `{ what, room? }` (an account): the client is here, in the menu, a shift or a room (its code).
 * Answers the invitations waiting for the player, how many friend requests wait and how many friends are online.
 */
function epd_route_presence(): ApiReply
{
    $user = epd_require_user();
    $me = (int) $user['id'];
    $body = epd_json_body(1024);
    $what = $body['what'] ?? 'menu';
    if (!is_string($what) || !in_array($what, EPD_PRESENCE_WHAT, true)) {
        epd_fail(400, 'invalid_presence', 'Vigane olek.', [], ['field' => 'what']);
    }
    $room = epd_room_clean_code($body['room'] ?? null) ?? '';
    $db = epd_db();
    $now = epd_room_now_ms();
    $prev = $db->prepare('SELECT seen, what, room FROM presence WHERE user_id = ?');
    $prev->execute([$me]);
    $p = $prev->fetch();
    if (!is_array($p) || (int) $p['seen'] <= $now - EPD_PRESENCE_EVERY_MS || $p['what'] !== $what || $p['room'] !== $room) {
        $db->prepare(
            'INSERT INTO presence (user_id, seen, what, room) VALUES (?, ?, ?, ?)
             ON CONFLICT (user_id) DO UPDATE SET seen = excluded.seen, what = excluded.what, room = excluded.room'
        )->execute([$me, $now, $what, $room]);
    }
    $asking = $db->prepare("SELECT COUNT(*) FROM friends WHERE friend_id = ? AND state = 'asked'");
    $asking->execute([$me]);
    $online = $db->prepare(
        "SELECT COUNT(*) FROM friends f JOIN presence p ON p.user_id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
         WHERE (f.user_id = ? OR f.friend_id = ?) AND f.state = 'friends' AND p.seen > ?"
    );
    $online->execute([$me, $me, $me, $now - EPD_PRESENCE_ONLINE_MS]);
    return epd_reply([
        'invites' => epd_invites_for($db, $me, $now),
        'asking' => (int) $asking->fetchColumn(),
        'online' => (int) $online->fetchColumn(),
    ]);
}

/**
 * POST /api/invites `{ kind: 'room'|'challenge', code, to: [ids] }` (an account): invite friends to the room the
 * player is in (while it takes players) or to a challenge. Anyone in `to` who is not a friend is left out; an
 * invitation still waiting for the same friend is renewed instead of sent twice. Answers `{ sent }`.
 */
function epd_route_invites_send(): ApiReply
{
    $user = epd_require_user();
    $me = (int) $user['id'];
    $body = epd_json_body(4 * 1024);
    $kind = $body['kind'] ?? null;
    if (!is_string($kind) || !in_array($kind, ['room', 'challenge'], true)) {
        epd_fail(400, 'invalid_invite', 'Vigane kutse.', [], ['field' => 'kind']);
    }
    $code = epd_room_clean_code($body['code'] ?? null);
    if ($code === null) {
        epd_fail(400, 'invalid_invite', 'Vigane kutse.', [], ['field' => 'code']);
    }
    $to = $body['to'] ?? null;
    if (!is_array($to) || !array_is_list($to) || count($to) === 0 || count($to) > EPD_INVITE_TO_MAX) {
        epd_fail(400, 'invalid_invite', 'Vigane kutse.', [], ['field' => 'to']);
    }
    $ids = [];
    foreach ($to as $x) {
        if (!is_int($x) || $x <= 0) {
            epd_fail(400, 'invalid_invite', 'Vigane kutse.', [], ['field' => 'to']);
        }
        $ids[$x] = true;
    }
    $db = epd_db();
    $now = epd_room_now_ms();
    if ($kind === 'room') {
        $room = epd_room_by_code($db, $code);
        $member = $room === null ? null : epd_room_member($db, (int) $room['id'], $me);
        if ($room === null || $member === null || $member['left_at'] !== null) {
            epd_fail(404, 'room_not_found', 'Sellise koodiga ruumi ei ole.');
        }
        if (in_array($room['state'], ['closed', 'running'], true)) {
            epd_fail(409, 'room_started', 'Selle ruumi vahetus on juba alanud.');
        }
    } elseif (epd_challenge_find($db, $code, $now) === null) {
        epd_challenge_not_found();
    }
    $key = 'u' . $me;
    $sent = epd_transaction($db, static function (PDO $db) use ($me, $ids, $kind, $code, $now, $key): int {
        // Old invitations go on the way.
        $db->prepare('DELETE FROM invites WHERE created <= ?')->execute([$now - EPD_INVITE_CHALLENGE_MS]);
        $sent = 0;
        foreach (array_keys($ids) as $to) {
            if ($to === $me || !epd_are_friends($db, $me, $to)) {
                continue;
            }
            $open = $db->prepare('SELECT id FROM invites WHERE from_id = ? AND to_id = ? AND kind = ? AND code = ? AND done IS NULL');
            $open->execute([$me, $to, $kind, $code]);
            $id = $open->fetchColumn();
            if ($id !== false) {
                $db->prepare('UPDATE invites SET created = ? WHERE id = ?')->execute([$now, (int) $id]);
                $sent++;
                continue;
            }
            if (epd_rate_events($db, 'invite', $key, 3600) >= EPD_INVITE_LIMIT) {
                epd_fail(429, 'rate_limited', 'Liiga palju kutseid, proovi hiljem uuesti.', ['Retry-After' => '600']);
            }
            epd_rate_event($db, 'invite', $key);
            $db->prepare('INSERT INTO invites (from_id, to_id, kind, code, created) VALUES (?, ?, ?, ?, ?)')
                ->execute([$me, $to, $kind, $code, $now]);
            $sent++;
        }
        return $sent;
    });
    return epd_reply(['sent' => $sent]);
}

/** POST /api/invites/{id}/done (an account): the invited player took the invitation up or put it away. */
function epd_route_invite_done(string $id): ApiReply
{
    $user = epd_require_user();
    $db = epd_db();
    $db->prepare('UPDATE invites SET done = ? WHERE id = ? AND to_id = ? AND done IS NULL')
        ->execute([epd_room_now_ms(), (int) $id, (int) $user['id']]);
    return epd_reply(['ok' => true]);
}

/** A deleted account: its friendships, requests, presence and invitations either way. */
function epd_friends_forget(PDO $db, int $userId): void
{
    $db->prepare('DELETE FROM friends WHERE user_id = ? OR friend_id = ?')->execute([$userId, $userId]);
    $db->prepare('DELETE FROM invites WHERE from_id = ? OR to_id = ?')->execute([$userId, $userId]);
    $db->prepare('DELETE FROM presence WHERE user_id = ?')->execute([$userId]);
}
