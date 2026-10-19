<?php

declare(strict_types=1);

/**
 * Päeva väljakutse (daily challenge): every day the same shift for everyone, with a board of its own
 * (docs/SERVER.md, "Daily challenge"). The client builds the shift from the date (src/sim/daily.ts); the
 * server keeps the first run of each player and day (POST /api/daily) and lists a day's board
 * (GET /api/daily?day=). Daily runs never go to the normal leaderboard.
 */

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/scores.php';

const EPD_DAILY_TZ = 'Europe/Tallinn';
/** A run started before midnight may still be sent for its day this long after midnight (4 h, in ms). */
const EPD_DAILY_GRACE_MS = 4 * 3600 * 1000;
/** Clock skew allowed on `started` (the client's clock), ms. */
const EPD_DAILY_SKEW_MS = 10 * 60 * 1000;
const EPD_DAILY_LIMIT = 50;

/**
 * Current time for the day rules, unix ms. Only PHP's built-in server with EPD_TEST_CLOCK=1 (the test
 * suite) takes it from the `X-EPD-Test-Now` header; FrankenPHP is never `cli-server`.
 */
function epd_daily_now_ms(): int
{
    if (PHP_SAPI === 'cli-server' && epd_env('EPD_TEST_CLOCK') === '1') {
        $fake = epd_header('X-EPD-Test-Now');
        if ($fake !== null && preg_match('/^\d{1,16}$/', $fake) === 1) {
            return (int) $fake;
        }
    }
    return epd_now_ms();
}

function epd_daily_tz(): DateTimeZone
{
    static $tz = null;
    return $tz ??= new DateTimeZone(EPD_DAILY_TZ);
}

/** Calendar date ('YYYY-MM-DD') in Tallinn at unix ms $ms. */
function epd_daily_date(int $ms): string
{
    return (new DateTimeImmutable('@' . intdiv($ms, 1000)))->setTimezone(epd_daily_tz())->format('Y-m-d');
}

/** Unix ms of midnight starting $day in Tallinn. */
function epd_daily_midnight(string $day): int
{
    return (new DateTimeImmutable($day . ' 00:00:00', epd_daily_tz()))->getTimestamp() * 1000;
}

/** True for a real calendar date written as YYYY-MM-DD. */
function epd_daily_valid_day(mixed $day): bool
{
    if (!is_string($day) || preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $day, $m) !== 1) {
        return false;
    }
    return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
}

/**
 * Whether a run of $day may be counted now: today's challenge, or yesterday's when the run started
 * before midnight and it is sent within the grace window after it.
 */
function epd_daily_open(string $day, ?int $started, int $now): bool
{
    $today = epd_daily_date($now);
    if ($day === $today) {
        return true;
    }
    $midnight = epd_daily_midnight($today);
    $yesterday = epd_daily_date($midnight - 12 * 3600 * 1000);
    return $day === $yesterday
        && $now < $midnight + EPD_DAILY_GRACE_MS
        && $started !== null
        && $started < $midnight
        && $started >= epd_daily_midnight($yesterday);
}

/**
 * Validated daily run from a POST body (the same field rules as POST /api/score).
 *
 * @param array<string, mixed> $body
 * @return array{day: string, region_id: string, sector: string, score: int, grade: string, incidents: int, arrests: int, started: ?int}
 */
function epd_daily_input(array $body): array
{
    if (!epd_daily_valid_day($body['day'] ?? null)) {
        epd_invalid_field('day');
    }
    $sector = $body['sector'] ?? '';
    if (!is_string($sector) || preg_match('/^(?:[a-z0-9][a-z0-9-]{0,47})?$/', $sector) !== 1) {
        epd_invalid_field('sector');
    }
    $row = [
        'day' => (string) $body['day'],
        'region_id' => epd_enum_field($body, 'regionId', EPD_REGIONS),
        'sector' => $sector,
        'score' => epd_number_field($body, 'score', 0, 100),
        'grade' => epd_enum_field($body, 'grade', EPD_GRADES),
        'incidents' => epd_number_field($body, 'incidents', 0, 100000),
        'arrests' => epd_number_field($body, 'arrests', 0, 100000),
        'started' => ($body['started'] ?? null) === null ? null : epd_number_field($body, 'started', 0, EPD_MAX_SAFE_INT),
    ];
    // A shift with no incidents gets a flat grade from the sim; it says nothing about the player.
    if ($row['incidents'] < 1) {
        epd_fail(400, 'empty_shift', 'Sündmusteta vahetus edetabelisse ei lähe.', [], ['field' => 'incidents']);
    }
    return $row;
}

/** Number of players with a counted run on $day. */
function epd_daily_players(PDO $db, string $day): int
{
    $stmt = $db->prepare('SELECT COUNT(*) FROM daily_scores WHERE day = ?');
    $stmt->execute([$day]);
    return (int) $stmt->fetchColumn();
}

/**
 * A player's counted run of $day with its place (1 + the number of players with a strictly higher
 * score), or null.
 *
 * @return array{name: string, score: int, grade: string, incidents: int, at: int, rank: int}|null
 */
function epd_daily_row(PDO $db, string $day, int $userId): ?array
{
    $stmt = $db->prepare(
        'SELECT u.name, d.score, d.grade, d.incidents, d.at,
                1 + (SELECT COUNT(*) FROM daily_scores o WHERE o.day = d.day AND o.score > d.score) AS rank
         FROM daily_scores d JOIN users u ON u.id = d.user_id
         WHERE d.day = ? AND d.user_id = ?'
    );
    $stmt->execute([$day, $userId]);
    $r = $stmt->fetch();
    return is_array($r) ? epd_daily_public($r) : null;
}

/**
 * @param array<string, mixed> $r
 * @return array{name: string, score: int, grade: string, incidents: int, at: int, rank: int}
 */
function epd_daily_public(array $r): array
{
    return [
        'name' => (string) $r['name'],
        'score' => (int) $r['score'],
        'grade' => (string) $r['grade'],
        'incidents' => (int) $r['incidents'],
        'at' => (int) $r['at'],
        'rank' => (int) $r['rank'],
    ];
}

/** POST /api/daily (logged-in users only): the first run of the day counts, later ones are practice. */
function epd_route_daily_post(): ApiReply
{
    $user = epd_require_user();
    $row = epd_daily_input(epd_json_body());
    $now = epd_daily_now_ms();
    if ($row['started'] !== null && $row['started'] > $now + EPD_DAILY_SKEW_MS) {
        epd_invalid_field('started');
    }
    if (!epd_daily_open($row['day'], $row['started'], $now)) {
        epd_fail(400, 'day_closed', 'Selle päeva väljakutse on läbi.', [], ['field' => 'day']);
    }
    $db = epd_db();
    $userId = (int) $user['id'];
    $insert = $db->prepare(
        'INSERT INTO daily_scores (user_id, day, region_id, sector, score, grade, incidents, arrests, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, day) DO NOTHING'
    );
    $insert->execute([
        $userId, $row['day'], $row['region_id'], $row['sector'], $row['score'],
        $row['grade'], $row['incidents'], $row['arrests'], $now,
    ]);
    $counted = $insert->rowCount() === 1;
    $mine = epd_daily_row($db, $row['day'], $userId);
    return epd_reply([
        'ok' => true,
        'counted' => $counted,
        'rank' => $mine['rank'] ?? null,
        'players' => epd_daily_players($db, $row['day']),
    ]);
}

/** GET /api/daily?day=YYYY-MM-DD (public; `me` only for a logged-in caller). Without `day`: today. */
function epd_route_daily_get(): ApiReply
{
    $day = $_GET['day'] ?? '';
    if ($day === '') {
        $day = epd_daily_date(epd_daily_now_ms());
    }
    if (!epd_daily_valid_day($day)) {
        epd_fail(400, 'bad_day', 'Vigane kuupäev.');
    }
    $db = epd_db();
    $stmt = $db->prepare(
        'SELECT u.name, d.score, d.grade, d.incidents, d.at,
                RANK() OVER (ORDER BY d.score DESC) AS rank
         FROM daily_scores d JOIN users u ON u.id = d.user_id
         WHERE d.day = :day
         ORDER BY d.score DESC, d.at ASC, d.id ASC
         LIMIT :limit'
    );
    $stmt->bindValue(':day', $day);
    $stmt->bindValue(':limit', EPD_DAILY_LIMIT, PDO::PARAM_INT);
    $stmt->execute();
    $scores = array_map(epd_daily_public(...), $stmt->fetchAll());
    $user = epd_current_user();
    return epd_reply([
        'day' => $day,
        'players' => epd_daily_players($db, $day),
        'scores' => $scores,
        'me' => $user === null ? null : epd_daily_row($db, $day, (int) $user['id']),
    ]);
}
