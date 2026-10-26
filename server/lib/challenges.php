<?php

declare(strict_types=1);

/**
 * Väljakutse lingiga (2.38.0, docs/CHALLENGE.md): a free shift's setup and its sender's result under a code. Anybody
 * may open it (a guest opens a link too); an account's first run of it goes on its board. `/v/<code>` is the link's
 * page: the game's index.html with the challenge's preview tags, so a messenger shows who challenges whom.
 */

/** The rooms' alphabet: no 0/O, 1/I. */
const EPD_CHALLENGE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** A challenge is kept this long after it was sent (swept when a new one is sent). */
const EPD_CHALLENGE_KEEP_MS = 90 * 24 * 3600 * 1000;
/** New challenges per account and hour. */
const EPD_CHALLENGE_CREATE_LIMIT = 30;
/** Rows on a challenge's board. */
const EPD_CHALLENGE_BOARD = 50;
/** The player's challenges in the menu. */
const EPD_CHALLENGE_MINE = 30;
/** Weather kinds of the briefing (src/sim/types.ts Weather['kind']). */
const EPD_CHALLENGE_WEATHER = ['clear', 'cloudy', 'rain', 'snow', 'sleet', 'fog', 'storm'];
/** The public address of the game, for the preview tags (index.html names it too). */
const EPD_SITE = 'https://politsei.eu';

function epd_challenge_invalid(string $field): never
{
    epd_fail(400, 'invalid_challenge', 'Väljakutse andmed on vigased.', [], ['field' => $field]);
}

/**
 * A setup as the client sends it (src/sim/challenge.ts ShiftSetup), checked and in a canonical key order.
 *
 * @return array{seed: int, regionId: string, difficulty: string, start: int, hours: float|int, weather?: string, crisis?: float|int}
 */
function epd_challenge_setup(mixed $v): array
{
    if (!is_array($v)) {
        epd_challenge_invalid('setup');
    }
    $seed = $v['seed'] ?? null;
    if (!is_int($seed) || $seed < 0 || $seed > 4294967295) {
        epd_challenge_invalid('seed');
    }
    $region = $v['regionId'] ?? null;
    if (!is_string($region) || !in_array($region, EPD_REGIONS, true)) {
        epd_challenge_invalid('regionId');
    }
    $difficulty = $v['difficulty'] ?? null;
    if (!is_string($difficulty) || !in_array($difficulty, EPD_DIFFICULTIES, true)) {
        epd_challenge_invalid('difficulty');
    }
    $start = $v['start'] ?? null;
    // 2020 to 2100: a game time, not a stray number.
    if (!is_int($start) || $start < 1577836800000 || $start > 4102444800000) {
        epd_challenge_invalid('start');
    }
    $hours = $v['hours'] ?? null;
    if ((!is_int($hours) && !is_float($hours)) || $hours < 0.25 || $hours > 12 || abs($hours * 100 - round($hours * 100)) > 1e-6) {
        epd_challenge_invalid('hours');
    }
    $out = ['seed' => $seed, 'regionId' => $region, 'difficulty' => $difficulty, 'start' => $start, 'hours' => $hours];
    if (array_key_exists('weather', $v)) {
        if (!is_string($v['weather']) || !in_array($v['weather'], EPD_CHALLENGE_WEATHER, true)) {
            epd_challenge_invalid('weather');
        }
        $out['weather'] = $v['weather'];
    }
    if (array_key_exists('crisis', $v)) {
        $c = $v['crisis'];
        if ((!is_int($c) && !is_float($c)) || $c <= 0 || $c > 1) {
            epd_challenge_invalid('crisis');
        }
        $out['crisis'] = $c;
    }
    return $out;
}

/**
 * A run's result (src/sim/challenge.ts ChallengeStats): points, grade, incidents handled, arrests, the average
 * minutes to the first crew at the most urgent calls (kept in tenths) and the major incident's result.
 *
 * @return array{score: int, grade: string, closed: int, arrests: int, p1: ?int, crisis: ?int}
 */
function epd_challenge_result(mixed $v): array
{
    if (!is_array($v)) {
        epd_challenge_invalid('result');
    }
    $int = static function (string $field, int $max) use ($v): int {
        $x = $v[$field] ?? null;
        if (!is_int($x) || $x < 0 || $x > $max) {
            epd_challenge_invalid($field);
        }
        return $x;
    };
    $grade = $v['grade'] ?? null;
    if (!is_string($grade) || !in_array($grade, EPD_GRADES, true)) {
        epd_challenge_invalid('grade');
    }
    $p1 = $v['p1'] ?? null;
    if ($p1 !== null && ((!is_int($p1) && !is_float($p1)) || $p1 < 0 || $p1 > 600)) {
        epd_challenge_invalid('p1');
    }
    $crisis = $v['crisis'] ?? null;
    if ($crisis !== null && (!is_int($crisis) || $crisis < 0 || $crisis > 100)) {
        epd_challenge_invalid('crisis');
    }
    return [
        'score' => $int('score', 100),
        'grade' => $grade,
        'closed' => $int('closed', 5000),
        'arrests' => $int('arrests', 5000),
        'p1' => $p1 === null ? null : (int) round($p1 * 10),
        'crisis' => $crisis,
    ];
}

/** The game version the challenge was played in ('' when the client sent none or nonsense). */
function epd_challenge_version(mixed $v): string
{
    return is_string($v) && preg_match('/^\d{1,3}\.\d{1,3}\.\d{1,3}$/', $v) === 1 ? $v : '';
}

/** A challenge by its code (any case), or null when there is none or it is older than it is kept. */
function epd_challenge_find(PDO $db, string $code, int $now): ?array
{
    $stmt = $db->prepare('SELECT * FROM challenges WHERE code = ? AND created > ?');
    $stmt->execute([strtoupper($code), $now - EPD_CHALLENGE_KEEP_MS]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

/** A board row as the API shows it. */
function epd_challenge_row_out(array $r, int $rank, ?int $me): array
{
    $out = [
        'name' => (string) $r['name'],
        'score' => (int) $r['score'],
        'grade' => (string) $r['grade'],
        'closed' => (int) $r['closed'],
        'arrests' => (int) $r['arrests'],
        'p1' => $r['p1'] === null ? null : ((int) $r['p1']) / 10,
        'crisis' => $r['crisis'] === null ? null : (int) $r['crisis'],
        'at' => (int) $r['at'],
        'rank' => $rank,
    ];
    if ((string) ($r['avatar'] ?? '') !== '') {
        $out['avatar'] = (string) $r['avatar'];
    }
    if ($me !== null && (int) $r['user_id'] === $me) {
        $out['me'] = true;
    }
    if ((int) $r['user_id'] === (int) $r['sender']) {
        $out['sender'] = true;
    }
    return $out;
}

/**
 * The challenge as the API shows it: the sender, the setup, the version, how many played and the board (best
 * first; rank 1 + the players with strictly more points), and the caller's own row.
 */
function epd_challenge_json(PDO $db, array $ch, ?int $me): array
{
    $id = (int) $ch['id'];
    $stmt = $db->prepare(
        'SELECT r.*, u.name, u.avatar, ? AS sender FROM challenge_results r JOIN users u ON u.id = r.user_id
         WHERE r.challenge_id = ? ORDER BY r.score DESC, r.at ASC'
    );
    $stmt->execute([(int) $ch['user_id'], $id]);
    $rows = $stmt->fetchAll();
    $results = [];
    $mine = null;
    $higher = 0;
    $prev = null;
    foreach ($rows as $i => $r) {
        if ($prev === null || (int) $r['score'] < $prev) {
            $higher = $i;
            $prev = (int) $r['score'];
        }
        $out = epd_challenge_row_out($r, $higher + 1, $me);
        if ($i < EPD_CHALLENGE_BOARD) {
            $results[] = $out;
        }
        if (!empty($out['me'])) {
            $mine = $out;
        }
    }
    $by = epd_find_user_by_id($db, (int) $ch['user_id']);
    return [
        'code' => (string) $ch['code'],
        'by' => $by === null ? ['name' => ''] : array_intersect_key(epd_public_user($by), ['name' => 1, 'avatar' => 1]),
        'setup' => json_decode((string) $ch['setup'], true),
        'version' => (string) $ch['version'],
        'created' => (int) $ch['created'],
        'players' => count($rows),
        'results' => $results,
        'me' => $mine,
    ];
}

function epd_challenge_not_found(): never
{
    epd_fail(404, 'challenge_not_found', 'Sellist väljakutset ei ole või see on aegunud.');
}

/**
 * POST /api/challenges `{ setup, result, version }` (an account): the challenge of a finished free shift, with the
 * sender's result as its first row. The same shift sent again answers the same challenge.
 */
function epd_route_challenge_create(): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $body = epd_json_body(8 * 1024);
    $setup = epd_challenge_setup($body['setup'] ?? null);
    $result = epd_challenge_result($body['result'] ?? null);
    $version = epd_challenge_version($body['version'] ?? null);
    $json = epd_json($setup);
    $db = epd_db();
    $now = epd_room_now_ms();
    $known = $db->prepare('SELECT * FROM challenges WHERE user_id = ? AND setup = ? AND created > ?');
    $known->execute([$userId, $json, $now - EPD_CHALLENGE_KEEP_MS]);
    $row = $known->fetch();
    if (is_array($row)) {
        return epd_reply(['challenge' => epd_challenge_json($db, $row, $userId)]);
    }
    $key = 'u' . $userId;
    if (epd_rate_events($db, 'challenge_create', $key, 3600) >= EPD_CHALLENGE_CREATE_LIMIT) {
        epd_fail(429, 'rate_limited', 'Liiga palju väljakutseid, proovi hiljem uuesti.', ['Retry-After' => '600']);
    }
    $code = epd_transaction($db, static function (PDO $db) use ($userId, $json, $version, $result, $now, $key): string {
        epd_rate_event($db, 'challenge_create', $key);
        // Old challenges go with their boards.
        $old = 'SELECT id FROM challenges WHERE created <= ?';
        $db->prepare("DELETE FROM challenge_results WHERE challenge_id IN ($old)")->execute([$now - EPD_CHALLENGE_KEEP_MS]);
        $db->prepare('DELETE FROM challenges WHERE created <= ?')->execute([$now - EPD_CHALLENGE_KEEP_MS]);
        $insert = $db->prepare('INSERT INTO challenges (code, user_id, setup, version, created) VALUES (?, ?, ?, ?, ?)');
        for ($try = 0; ; $try++) {
            $code = '';
            for ($i = 0; $i < 6; $i++) {
                $code .= EPD_CHALLENGE_ALPHABET[random_int(0, strlen(EPD_CHALLENGE_ALPHABET) - 1)];
            }
            try {
                $insert->execute([$code, $userId, $json, $version, $now]);
                break;
            } catch (PDOException $e) {
                if (!epd_is_unique_violation($e) || $try >= 8) {
                    throw $e;
                }
            }
        }
        epd_challenge_insert_result($db, (int) $db->lastInsertId(), $userId, $result, $now);
        return $code;
    });
    $row = epd_challenge_find($db, $code, $now) ?? epd_challenge_not_found();
    return epd_reply(['challenge' => epd_challenge_json($db, $row, $userId)]);
}

/** One player's run on a challenge's board. */
function epd_challenge_insert_result(PDO $db, int $challengeId, int $userId, array $r, int $now): void
{
    $db->prepare(
        'INSERT INTO challenge_results (challenge_id, user_id, score, grade, closed, arrests, p1, crisis, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$challengeId, $userId, $r['score'], $r['grade'], $r['closed'], $r['arrests'], $r['p1'], $r['crisis'], $now]);
}

/** GET /api/challenges/<code>: anybody may look (a guest opened a link); an account sees its own row too. */
function epd_route_challenge_get(string $code): ApiReply
{
    $db = epd_db();
    $row = epd_challenge_find($db, $code, epd_room_now_ms()) ?? epd_challenge_not_found();
    $user = epd_current_user();
    return epd_reply(['challenge' => epd_challenge_json($db, $row, $user === null ? null : (int) $user['id'])]);
}

/**
 * POST /api/challenges/<code>/result `{ result }` (an account): the first run counts; a later one answers
 * `counted: false` and changes nothing.
 */
function epd_route_challenge_result(string $code): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $result = epd_challenge_result(epd_json_body(8 * 1024)['result'] ?? null);
    $db = epd_db();
    $now = epd_room_now_ms();
    $row = epd_challenge_find($db, $code, $now) ?? epd_challenge_not_found();
    $counted = epd_transaction($db, static function (PDO $db) use ($row, $userId, $result, $now): bool {
        $has = $db->prepare('SELECT 1 FROM challenge_results WHERE challenge_id = ? AND user_id = ?');
        $has->execute([(int) $row['id'], $userId]);
        if ($has->fetchColumn() !== false) {
            return false;
        }
        epd_challenge_insert_result($db, (int) $row['id'], $userId, $result, $now);
        return true;
    });
    $json = epd_challenge_json($db, $row, $userId);
    return epd_reply([
        'counted' => $counted,
        'rank' => $json['me']['rank'] ?? null,
        'players' => $json['players'],
        'challenge' => $json,
    ]);
}

/** GET /api/challenges (an account): the challenges the player sent or played, newest first. */
function epd_route_challenge_mine(): ApiReply
{
    $user = epd_require_user();
    $userId = (int) $user['id'];
    $db = epd_db();
    $now = epd_room_now_ms();
    $stmt = $db->prepare(
        'SELECT c.* FROM challenges c WHERE c.created > ? AND (c.user_id = ? OR EXISTS
           (SELECT 1 FROM challenge_results r WHERE r.challenge_id = c.id AND r.user_id = ?))
         ORDER BY c.created DESC LIMIT ' . EPD_CHALLENGE_MINE
    );
    $stmt->execute([$now - EPD_CHALLENGE_KEEP_MS, $userId, $userId]);
    $list = [];
    foreach ($stmt->fetchAll() as $row) {
        $json = epd_challenge_json($db, $row, $userId);
        $json['results'] = array_slice($json['results'], 0, 3);
        $list[] = $json;
    }
    return epd_reply(['challenges' => $list]);
}

/** Account deletion (auth.php, inside its transaction): its challenges go with their boards, and its rows elsewhere. */
function epd_challenges_forget(PDO $db, int $userId): void
{
    $db->prepare('DELETE FROM challenge_results WHERE challenge_id IN (SELECT id FROM challenges WHERE user_id = ?)')->execute([$userId]);
    $db->prepare('DELETE FROM challenges WHERE user_id = ?')->execute([$userId]);
    $db->prepare('DELETE FROM challenge_results WHERE user_id = ?')->execute([$userId]);
}

// ---------------------------------------------------------------- the link's page

const EPD_CHALLENGE_REGION = ['pohja' => 'Põhja', 'ida' => 'Ida', 'louna' => 'Lõuna', 'laane' => 'Lääne'];
const EPD_CHALLENGE_DIFFICULTY = ['cadet' => 'Kadett', 'normal' => 'Tavaline', 'veteran' => 'Veteran', 'realistic' => 'Realistlik'];
const EPD_CHALLENGE_WEEKDAY = [1 => 'esmaspäev', 'teisipäev', 'kolmapäev', 'neljapäev', 'reede', 'laupäev', 'pühapäev'];

/** The preview of a challenge: title, description, picture and its text (src/sim/challenge.ts shiftWhen says the same). */
function epd_challenge_preview(PDO $db, array $ch): array
{
    $setup = json_decode((string) $ch['setup'], true);
    $by = epd_find_user_by_id($db, (int) $ch['user_id']);
    $score = $db->prepare('SELECT score FROM challenge_results WHERE challenge_id = ? AND user_id = ?');
    $score->execute([(int) $ch['id'], (int) $ch['user_id']]);
    $points = $score->fetchColumn();
    $region = EPD_CHALLENGE_REGION[$setup['regionId'] ?? ''] ?? 'Eesti';
    $start = (new DateTimeImmutable('@' . intdiv((int) ($setup['start'] ?? 0), 1000)))->setTimezone(new DateTimeZone('Europe/Tallinn'));
    $end = $start->modify('+' . (int) round(((float) ($setup['hours'] ?? 0)) * 60) . ' minutes');
    $hour = (int) $start->format('G');
    $when = EPD_CHALLENGE_WEEKDAY[(int) $start->format('N')] . ' ' . ($hour < 6 || $hour >= 18 ? 'öö' : 'päev');
    $name = $by === null ? 'Dispetšer' : (string) $by['name'];
    $title = $points === false
        ? "$name kutsub sind väljakutsele. Kas teed paremini?"
        : "$name: $points punkti, $region, $when. Kas teed paremini?";
    $difficulty = EPD_CHALLENGE_DIFFICULTY[$setup['difficulty'] ?? ''] ?? '';
    $description = "EPD väljakutse: $region prefektuur, $when {$start->format('H:i')}-{$end->format('H:i')}, raskus $difficulty. "
        . 'Mängi sama vahetus samade väljakutsetega ja vaata tulemusi kõrvuti.';
    return [
        'title' => $title,
        'description' => $description,
        'image' => EPD_SITE . '/og/challenge-' . ($setup['regionId'] ?? 'pohja') . '.png',
        'alt' => "EPD väljakutse: $region prefektuur",
        'url' => EPD_SITE . '/v/' . (string) $ch['code'],
    ];
}

/** The game's index.html: EPD_WWW (the built frontend; /app/www on the server). */
function epd_index_html(): ?string
{
    $dir = getenv('EPD_WWW') ?: '/app/www';
    $file = rtrim($dir, '/') . '/index.html';
    if (!is_file($file) || !is_readable($file)) {
        return null;
    }
    $html = file_get_contents($file);
    return is_string($html) && $html !== '' ? $html : null;
}

/** index.html with a meta tag's content replaced (property="og:..." or name="twitter:..."), or the tag added. */
function epd_html_meta(string $html, string $attr, string $key, string $value): string
{
    $tag = '<meta ' . $attr . '="' . $key . '" content="' . htmlspecialchars($value, ENT_QUOTES | ENT_HTML5) . '" />';
    $pattern = '#<meta\s+' . $attr . '="' . preg_quote($key, '#') . '"\s+content="[^"]*"\s*/?>#';
    $count = 0;
    $out = preg_replace_callback($pattern, static fn (): string => $tag, $html, 1, $count);
    if ($count > 0 && is_string($out)) {
        return $out;
    }
    return preg_replace('#</head>#', "    $tag\n  </head>", $html, 1) ?? $html;
}

/**
 * GET /v/<code>: the game itself (index.html, the app reads the code from the address), with the challenge's preview
 * tags for a messenger that fetches the link. An unknown or expired code gets the page as it is.
 */
function epd_route_challenge_page(string $code): ApiReply
{
    $html = epd_index_html();
    if ($html === null) {
        epd_fail(503, 'unavailable', 'Mängu leht ei ole praegu saadaval.');
    }
    $db = epd_db();
    $row = epd_challenge_find($db, $code, epd_room_now_ms());
    $headers = ['X-Robots-Tag' => 'noindex', 'Cache-Control' => 'no-cache'];
    if ($row === null) {
        return new ApiReply(200, $html, $headers, 'text/html; charset=utf-8');
    }
    $p = epd_challenge_preview($db, $row);
    $tags = [
        ['property', 'og:title', $p['title']],
        ['property', 'og:description', $p['description']],
        ['property', 'og:url', $p['url']],
        ['property', 'og:image', $p['image']],
        ['property', 'og:image:alt', $p['alt']],
        ['name', 'twitter:title', $p['title']],
        ['name', 'twitter:description', $p['description']],
        ['name', 'twitter:image', $p['image']],
        ['name', 'twitter:image:alt', $p['alt']],
        ['name', 'description', $p['description']],
        ['name', 'robots', 'noindex'],
    ];
    foreach ($tags as [$attr, $key, $value]) {
        $html = epd_html_meta($html, $attr, $key, $value);
    }
    $title = htmlspecialchars($p['title'] . ' · EPD', ENT_QUOTES | ENT_HTML5);
    $html = preg_replace('#<title>[^<]*</title>#', "<title>$title</title>", $html, 1) ?? $html;
    return new ApiReply(200, $html, $headers, 'text/html; charset=utf-8');
}
