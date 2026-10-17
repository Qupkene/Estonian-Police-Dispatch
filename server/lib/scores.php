<?php

declare(strict_types=1);

/**
 * Leaderboard: one row per finished shift (POST /api/score), best shift per user (GET /api/scores).
 */

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

const EPD_REGIONS = ['pohja', 'ida', 'louna', 'laane'];
const EPD_MODES = ['career', 'free', 'director', 'tutorial'];
/** Director and tutorial shifts are not comparable, so they never reach the leaderboard. */
const EPD_RANKED_MODES = ['career', 'free'];
const EPD_DIFFICULTIES = ['cadet', 'normal', 'veteran', 'realistic'];
const EPD_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'];
const EPD_SCORES_DEFAULT_LIMIT = 20;
const EPD_SCORES_MAX_LIMIT = 50;
/** Largest integer a JavaScript number holds exactly. */
const EPD_MAX_SAFE_INT = 9007199254740991;

function epd_invalid_field(string $field): never
{
    epd_fail(400, 'invalid_score', 'Vigane väli: ' . $field . '.', [], ['field' => $field]);
}

/** @param array<string, mixed> $body */
function epd_enum_field(array $body, string $field, array $allowed): string
{
    $value = $body[$field] ?? null;
    return is_string($value) && in_array($value, $allowed, true) ? $value : epd_invalid_field($field);
}

/**
 * A finite number between $min and $max, rounded to an integer.
 *
 * @param array<string, mixed> $body
 */
function epd_number_field(array $body, string $field, int $min, int $max): int
{
    $value = $body[$field] ?? null;
    if (!is_int($value) && !(is_float($value) && is_finite($value))) {
        epd_invalid_field($field);
    }
    if ($value < $min || $value > $max) {
        epd_invalid_field($field);
    }
    return (int) round($value);
}

/**
 * Validated score row from a POST body.
 *
 * @param array<string, mixed> $body
 * @return array{region_id: string, mode: string, difficulty: string, score: int, grade: string, incidents: int, arrests: int, start: int}
 */
function epd_score_input(array $body): array
{
    $row = [
        'region_id' => epd_enum_field($body, 'regionId', EPD_REGIONS),
        'mode' => epd_enum_field($body, 'mode', EPD_MODES),
        'difficulty' => epd_enum_field($body, 'difficulty', EPD_DIFFICULTIES),
        'score' => epd_number_field($body, 'score', 0, 100),
        'grade' => epd_enum_field($body, 'grade', EPD_GRADES),
        'incidents' => epd_number_field($body, 'incidents', 0, 100000),
        'arrests' => epd_number_field($body, 'arrests', 0, 100000),
        'start' => epd_number_field($body, 'start', 0, EPD_MAX_SAFE_INT),
    ];
    if (!in_array($row['mode'], EPD_RANKED_MODES, true)) {
        epd_fail(400, 'unranked_mode', 'Selle režiimi tulemusi edetabelisse ei kanta.', [], ['field' => 'mode']);
    }
    // A shift with no incidents gets a flat grade from the sim; it says nothing about the player.
    if ($row['incidents'] < 1) {
        epd_fail(400, 'empty_shift', 'Sündmusteta vahetus edetabelisse ei lähe.', [], ['field' => 'incidents']);
    }
    return $row;
}

/**
 * Place a score takes on its region's leaderboard: 1 + the number of other players whose
 * best shift in that region is strictly higher.
 */
function epd_score_rank(PDO $db, string $regionId, int $userId, int $score): int
{
    $stmt = $db->prepare(
        'SELECT COUNT(*) FROM (
             SELECT user_id FROM scores WHERE region_id = :region AND user_id <> :user
             GROUP BY user_id HAVING MAX(score) > :score
         ) AS better'
    );
    $stmt->bindValue(':region', $regionId);
    $stmt->bindValue(':user', $userId, PDO::PARAM_INT);
    // Bound as an integer on purpose: MAX() has no column affinity, so a text '80' would never compare as a number.
    $stmt->bindValue(':score', $score, PDO::PARAM_INT);
    $stmt->execute();
    return 1 + (int) $stmt->fetchColumn();
}

/** POST /api/score (logged-in users only). */
function epd_route_score_post(): ApiReply
{
    $user = epd_require_user();
    $row = epd_score_input(epd_json_body());
    $db = epd_db();
    $db->prepare(
        'INSERT INTO scores (user_id, region_id, mode, difficulty, score, grade, incidents, arrests, start, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $user['id'], $row['region_id'], $row['mode'], $row['difficulty'], $row['score'],
        $row['grade'], $row['incidents'], $row['arrests'], $row['start'], epd_now_ms(),
    ]);
    return epd_reply(['ok' => true, 'rank' => epd_score_rank($db, $row['region_id'], (int) $user['id'], $row['score'])]);
}

/**
 * Best shift per user, highest first; ties go to whoever got there first.
 *
 * @return list<array{name: string, score: int, grade: string, regionId: string, difficulty: string, incidents: int, at: int}>
 */
function epd_leaderboard(PDO $db, ?string $regionId, int $limit): array
{
    $where = $regionId === null ? '' : 'WHERE s.region_id = :region';
    $stmt = $db->prepare(
        "SELECT name, score, grade, region_id, difficulty, incidents, at FROM (
             SELECT u.name, s.score, s.grade, s.region_id, s.difficulty, s.incidents, s.at,
                    ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.score DESC, s.at ASC, s.id ASC) AS pos
             FROM scores s JOIN users u ON u.id = s.user_id
             $where
         ) AS best
         WHERE pos = 1
         ORDER BY score DESC, at ASC
         LIMIT :limit"
    );
    if ($regionId !== null) {
        $stmt->bindValue(':region', $regionId);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $scores = [];
    foreach ($stmt->fetchAll() as $r) {
        $scores[] = [
            'name' => (string) $r['name'],
            'score' => (int) $r['score'],
            'grade' => (string) $r['grade'],
            'regionId' => (string) $r['region_id'],
            'difficulty' => (string) $r['difficulty'],
            'incidents' => (int) $r['incidents'],
            'at' => (int) $r['at'],
        ];
    }
    return $scores;
}

/** GET /api/scores?region=&limit= (public). */
function epd_route_scores_get(): ApiReply
{
    $region = $_GET['region'] ?? '';
    if (!is_string($region) || ($region !== '' && !in_array($region, EPD_REGIONS, true))) {
        epd_fail(400, 'bad_region', 'Tundmatu piirkond.');
    }
    $limit = filter_var($_GET['limit'] ?? null, FILTER_VALIDATE_INT);
    $limit = is_int($limit) ? max(1, min(EPD_SCORES_MAX_LIMIT, $limit)) : EPD_SCORES_DEFAULT_LIMIT;
    return epd_reply(['scores' => epd_leaderboard(epd_db(), $region === '' ? null : $region, $limit)]);
}
