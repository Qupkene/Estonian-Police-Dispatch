<?php

declare(strict_types=1);

/**
 * Mänguserver (docs/MULTIPLAYER.md section 9): the co-op rooms' shared shift runs on a small Node service next to
 * this API (server/mp, container politsei-mp). PHP keeps the rooms, the lobby, the players and the results; when a
 * co-op room starts while the game server answers, the room is marked `engine = 'server'` and its players play it
 * there over a WebSocket. Without the game server (EPD_MP unset, or down at the start) the room plays as before, in
 * lockstep over the command log (coop.php).
 *
 * The two services share a secret in EPD_DATA/mp/secret (created here on first use). A member of a running server
 * room gets a ticket signed with it: who they are, their seat and the room's shift. The game server believes nothing
 * else a client says about itself.
 *
 * Loaded at the end of coop.php.
 */

/** The game server's health is checked this long at most when a room starts. */
const EPD_MP_HEALTH_TIMEOUT_S = 1.0;
/** A ticket is good for this long (the client fetches a new one for every connection). */
const EPD_MP_TICKET_MS = 60 * 1000;

/** Is the game server configured for this API (EPD_MP=1)? */
function epd_mp_enabled(): bool
{
    return epd_env('EPD_MP') === '1';
}

/** The game server's base URL for the health check. */
function epd_mp_url(): string
{
    $url = epd_env('EPD_MP_URL');
    return rtrim($url !== '' ? $url : 'http://127.0.0.1:8790', '/');
}

/** The shared secret: EPD_DATA/mp/secret, 64 hex digits, created on first use (mode 0600). */
function epd_mp_secret(): string
{
    $dir = epd_data_dir() . '/mp';
    epd_ensure_dir($dir, 0770);
    $file = $dir . '/secret';
    $secret = is_file($file) ? trim((string) file_get_contents($file)) : '';
    if (strlen($secret) >= 32) {
        return $secret;
    }
    $new = bin2hex(random_bytes(32));
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $new . "\n") === false) {
        epd_fail(503, 'mp_unavailable', 'Mänguserveri võtit ei saanud luua.');
    }
    @chmod($tmp, 0600);
    // Another request may have won the race: the first file stays.
    if (!@link($tmp, $file)) {
        @unlink($tmp);
        $secret = trim((string) @file_get_contents($file));
        return strlen($secret) >= 32 ? $secret : epd_fail(503, 'mp_unavailable', 'Mänguserveri võtit ei saanud lugeda.');
    }
    @unlink($tmp);
    return $new;
}

/** Does the game server answer its health check now? (Configured, reachable, sees the secret.) */
function epd_mp_ready(): bool
{
    if (!epd_mp_enabled()) {
        return false;
    }
    epd_mp_secret();
    $ctx = stream_context_create(['http' => ['timeout' => EPD_MP_HEALTH_TIMEOUT_S, 'ignore_errors' => true]]);
    $body = @file_get_contents(epd_mp_url() . '/mp/health', false, $ctx);
    if (!is_string($body)) {
        return false;
    }
    $json = json_decode($body, true);
    return is_array($json) && ($json['ok'] ?? false) === true && ($json['secret'] ?? false) === true;
}

/** Engine of a room: 'server' (the game server runs its shift) or '' (lockstep, or not a co-op room). */
function epd_mp_engine(array $room): string
{
    return (string) ($room['engine'] ?? '') === 'server' ? 'server' : '';
}

function epd_mp_b64url(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

/** Sign a ticket payload: base64url(json).base64url(hmac-sha256 of the first part). */
function epd_mp_sign(array $payload, string $secret): string
{
    $body = epd_mp_b64url(epd_json($payload));
    return $body . '.' . epd_mp_b64url(hash_hmac('sha256', $body, $secret, true));
}

/**
 * The room's shift as the ticket carries it (server/mp/ticket.ts TicketRoom): the seed, the day, the options in the
 * API's JSON shape and the setup rows, so the game server builds exactly the shift every client of the room would.
 *
 * @param list<array<string, mixed>> $players players still in the room
 */
function epd_mp_ticket_room(array $room, array $players, int $hostId): array
{
    [$hostSeat, $rows] = epd_coop_setup_rows($room, $players, $hostId);
    return [
        'code' => (string) $room['code'],
        'mode' => (string) $room['mode'],
        'seed' => (int) $room['seed'],
        'day' => (string) $room['day'],
        'options' => [
            'regionId' => (string) $room['region_id'],
            'sector' => (string) $room['sector'],
            'difficulty' => (string) $room['difficulty'],
            'hours' => (int) $room['hours'],
            'slot' => (string) $room['slot'],
        ] + ((string) $room['mode'] === 'sector' ? ['desks' => epd_room_desks($room)] : []) + epd_room_custom_out($room),
        'started' => (int) $room['started'],
        'setup' => [$hostSeat, $rows],
    ];
}

/**
 * POST /api/rooms/{code}/ticket: an entry ticket to the game server for a member of a running server room.
 * The setup rows come from the players who started the shift (left_at is null at the start; a player who left the
 * room since gets no ticket).
 */
function epd_route_room_ticket(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $db = epd_db();
    $now = epd_room_now_ms();
    [$room, $member] = epd_room_tx($db, static function (PDO $db) use ($code, $userId, $now): array {
        [$room, $member] = epd_room_for_member($db, $code, $userId, $now);
        // The ticket counts as being here (the room's idle rule reads `seen`).
        if ((int) $member['seen'] < $now - EPD_ROOM_SEEN_EVERY_MS) {
            $db->prepare('UPDATE room_players SET seen = ? WHERE room_id = ? AND user_id = ?')->execute([$now, $room['id'], $userId]);
        }
        return [$room, $member];
    });
    if (!epd_coop_is_coop($room) || epd_mp_engine($room) !== 'server') {
        epd_fail(409, 'not_server_room', 'Selle ruumi vahetus ei käi mänguserveris.');
    }
    if ($room['state'] !== 'running') {
        epd_fail(409, 'not_running', 'Ühisvahetus ei käi.');
    }
    if ($member['left_at'] !== null) {
        epd_fail(409, 'left_room', 'Sa lahkusid sellest ruumist.');
    }
    $players = epd_room_players($db, (int) $room['id']);
    $starters = array_values(array_filter($players, static fn (array $p): bool => $p['left_at'] === null || (int) $p['left_at'] >= (int) $room['started']));
    $hostId = epd_mp_host_at_start($db, $room, $starters);
    $payload = [
        'v' => 1,
        'code' => (string) $room['code'],
        'user' => $userId,
        'seat' => (int) $member['seat'],
        'name' => (string) $user['name'],
        'exp' => $now + EPD_MP_TICKET_MS,
        'room' => epd_mp_ticket_room($room, $starters, $hostId),
    ];
    return epd_reply(['ticket' => epd_mp_sign($payload, epd_mp_secret()), 'url' => '/mp/ws', 'exp' => $payload['exp']]);
}

/**
 * The host the shift started with: the seat stored at the start (rooms.host_seat), as an account id. The game server
 * moves the host's role itself later; the ticket only has to describe the start the same way for every player.
 *
 * @param list<array<string, mixed>> $players
 */
function epd_mp_host_at_start(PDO $db, array $room, array $players): int
{
    $seat = (int) ($room['host_seat'] ?? -1);
    foreach ($players as $p) {
        if ((int) $p['seat'] === $seat) {
            return (int) $p['user_id'];
        }
    }
    return (int) ($room['host_id'] ?? 0);
}
