<?php

declare(strict_types=1);

/**
 * SQLite storage. The database lives in EPD_DATA (container: /data), or in data-dev/ next to
 * the repository during development. The schema migrates itself on first use.
 */

require_once __DIR__ . '/http.php';

/** Data directory, created when missing. */
function epd_data_dir(): string
{
    static $dir = null;
    if (is_string($dir)) {
        return $dir;
    }
    $configured = epd_env('EPD_DATA');
    $path = $configured !== '' ? (rtrim($configured, '/') ?: '/') : dirname(__DIR__, 2) . '/data-dev';
    epd_ensure_dir($path, 0770);
    if ($configured === '' && !is_file($path . '/.gitignore')) {
        // Keep the development database out of git without touching the repository's .gitignore.
        file_put_contents($path . '/.gitignore', "*\n");
    }
    return $dir = $path;
}

function epd_ensure_dir(string $path, int $mode): void
{
    if (is_dir($path)) {
        return;
    }
    // Another request may create it at the same moment, so only a still-missing directory is an error.
    if (!@mkdir($path, $mode, true) && !is_dir($path)) {
        throw new RuntimeException('Cannot create directory ' . $path);
    }
}

/** Shared connection for this request, migrated to the latest schema. */
function epd_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $db = new PDO('sqlite:' . epd_data_dir() . '/epd.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $db->exec('PRAGMA busy_timeout = 5000');
    $db->exec('PRAGMA journal_mode = WAL');
    $db->exec('PRAGMA synchronous = NORMAL');
    $db->exec('PRAGMA foreign_keys = ON');
    epd_migrate($db);
    return $pdo = $db;
}

/**
 * Schema migrations, applied in order. Players' accounts, saves and scores live in this database,
 * and an update must never lose them, so every step follows these rules (tests/server.test.ts
 * checks them against databases made by released versions, tests/fixtures/db/):
 *
 * - Never edit or renumber a released step: append a new one.
 * - Additive only: CREATE TABLE, CREATE [UNIQUE] INDEX, ALTER TABLE ... ADD COLUMN, INSERT.
 *   No DROP, DELETE, UPDATE, RENAME, REPLACE, PRAGMA or VACUUM. With foreign keys on, a dropped
 *   or rebuilt users table would cascade-delete every save and score.
 * - A new column is nullable or has a DEFAULT, so the previous version (an automatic rollback runs
 *   it on the migrated database) can still insert rows.
 * - All pending steps run in one transaction: if any statement fails, the database stays exactly
 *   as it was and the update script rolls the code back (health check fails).
 *
 * The update script takes a snapshot of the database before every switch (data/varu/, see
 * docs/DEPLOY.md, "Andmed ja varukoopiad").
 *
 * @return array<int, list<string>>
 */
function epd_migrations(): array
{
    return [
        1 => [
            'CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                name_key TEXT NOT NULL UNIQUE,
                pass_hash TEXT NOT NULL,
                created INTEGER NOT NULL,
                last_login INTEGER
            )',
            'CREATE TABLE saves (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                slot TEXT NOT NULL,
                json TEXT NOT NULL,
                updated INTEGER NOT NULL,
                PRIMARY KEY (user_id, slot)
            )',
            'CREATE TABLE scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                region_id TEXT NOT NULL,
                mode TEXT NOT NULL,
                difficulty TEXT NOT NULL,
                score INTEGER NOT NULL,
                grade TEXT NOT NULL,
                incidents INTEGER NOT NULL,
                arrests INTEGER NOT NULL,
                start INTEGER NOT NULL,
                at INTEGER NOT NULL
            )',
            'CREATE INDEX scores_region ON scores (region_id, user_id, score)',
            'CREATE INDEX scores_user ON scores (user_id, score)',
            'CREATE TABLE login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT NOT NULL,
                name_key TEXT NOT NULL,
                kind TEXT NOT NULL,
                at INTEGER NOT NULL
            )',
            'CREATE INDEX login_attempts_ip ON login_attempts (ip, at)',
            'CREATE INDEX login_attempts_name ON login_attempts (ip, name_key, at)',
            'CREATE INDEX login_attempts_at ON login_attempts (at)',
        ],
        // General per-IP limits (first user: uncached speech synthesis, POST /api/tts). Kept apart
        // from login_attempts so they never count against the login and register limits.
        2 => [
            'CREATE TABLE rate_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bucket TEXT NOT NULL,
                ip TEXT NOT NULL,
                at INTEGER NOT NULL
            )',
            'CREATE INDEX rate_events_ip ON rate_events (bucket, ip, at)',
            'CREATE INDEX rate_events_at ON rate_events (at)',
        ],
        // Päeva väljakutse (server/lib/daily.php): one counted run per player and day.
        3 => [
            'CREATE TABLE daily_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                day TEXT NOT NULL,
                region_id TEXT NOT NULL,
                sector TEXT NOT NULL DEFAULT \'\',
                score INTEGER NOT NULL,
                grade TEXT NOT NULL,
                incidents INTEGER NOT NULL,
                arrests INTEGER NOT NULL DEFAULT 0,
                at INTEGER NOT NULL,
                UNIQUE (user_id, day)
            )',
            'CREATE INDEX daily_scores_day ON daily_scores (day, score)',
        ],
        // Mitmikmäng (server/lib/rooms.php, docs/MULTIPLAYER.md): rooms with a code, their players and the
        // results of a same-seed race. A deleted account takes its seats and results with it (auth.php).
        4 => [
            'CREATE TABLE rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                mode TEXT NOT NULL DEFAULT \'race\',
                host_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                region_id TEXT NOT NULL,
                sector TEXT NOT NULL DEFAULT \'\',
                difficulty TEXT NOT NULL,
                hours INTEGER NOT NULL,
                slot TEXT NOT NULL,
                seed INTEGER NOT NULL,
                day TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT \'lobby\',
                rev INTEGER NOT NULL DEFAULT 1,
                created INTEGER NOT NULL,
                started INTEGER,
                updated INTEGER NOT NULL
            )',
            'CREATE INDEX rooms_created ON rooms (created)',
            'CREATE INDEX rooms_host ON rooms (host_id)',
            'CREATE TABLE room_players (
                room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                seat INTEGER NOT NULL,
                ready INTEGER NOT NULL DEFAULT 0,
                joined INTEGER NOT NULL,
                seen INTEGER NOT NULL,
                left_at INTEGER,
                PRIMARY KEY (room_id, user_id)
            )',
            'CREATE INDEX room_players_user ON room_players (user_id)',
            'CREATE TABLE room_results (
                room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                score INTEGER NOT NULL,
                grade TEXT NOT NULL,
                incidents INTEGER NOT NULL,
                arrests INTEGER NOT NULL DEFAULT 0,
                at INTEGER NOT NULL,
                PRIMARY KEY (room_id, user_id)
            )',
            'CREATE INDEX room_results_user ON room_results (user_id)',
        ],
        // Ühisvahetus (server/lib/coop.php, docs/MULTIPLAYER.md section 4): the command log the server orders, the
        // host's latest snapshot, the room's clock and the players' roles, presence and digests. Commands and
        // snapshots go with a deleted account (auth.php) and with a room that finishes or closes.
        5 => [
            'CREATE TABLE room_commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                seat INTEGER NOT NULL,
                turn INTEGER NOT NULL,
                kind TEXT NOT NULL,
                args TEXT NOT NULL,
                at INTEGER NOT NULL
            )',
            'CREATE INDEX room_commands_room ON room_commands (room_id, id)',
            'CREATE INDEX room_commands_user ON room_commands (user_id)',
            'CREATE TABLE room_snapshots (
                room_id INTEGER PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                turn INTEGER NOT NULL,
                cmd_id INTEGER NOT NULL,
                data BLOB NOT NULL,
                size INTEGER NOT NULL,
                at INTEGER NOT NULL
            )',
            'CREATE INDEX room_snapshots_user ON room_snapshots (user_id)',
            'ALTER TABLE rooms ADD COLUMN turn_ms INTEGER NOT NULL DEFAULT 1000',
            'ALTER TABLE rooms ADD COLUMN input_delay INTEGER NOT NULL DEFAULT 2',
            'ALTER TABLE rooms ADD COLUMN host_seat INTEGER NOT NULL DEFAULT -1',
            'ALTER TABLE rooms ADD COLUMN cmd_count INTEGER NOT NULL DEFAULT 0',
            "ALTER TABLE rooms ADD COLUMN ref_hashes TEXT NOT NULL DEFAULT ''",
            'ALTER TABLE rooms ADD COLUMN snap_req INTEGER NOT NULL DEFAULT 0',
            "ALTER TABLE room_players ADD COLUMN role TEXT NOT NULL DEFAULT ''",
            'ALTER TABLE room_players ADD COLUMN away INTEGER NOT NULL DEFAULT 0',
            'ALTER TABLE room_players ADD COLUMN hash_turn INTEGER NOT NULL DEFAULT -1',
            "ALTER TABLE room_players ADD COLUMN hash TEXT NOT NULL DEFAULT ''",
            'ALTER TABLE room_players ADD COLUMN resync INTEGER NOT NULL DEFAULT -1',
            'ALTER TABLE room_players ADD COLUMN cmd_tokens REAL NOT NULL DEFAULT 4',
            'ALTER TABLE room_players ADD COLUMN cmd_at INTEGER NOT NULL DEFAULT 0',
            'ALTER TABLE room_results ADD COLUMN xp INTEGER NOT NULL DEFAULT 0',
        ],
        // Sektorite koostöö (coop.php, docs/MULTIPLAYER.md section 8): a sector room's desks (sector ids, comma
        // separated) and the desk each player picked in the lobby.
        6 => [
            "ALTER TABLE rooms ADD COLUMN desks TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE room_players ADD COLUMN desk TEXT NOT NULL DEFAULT ''",
        ],
        // Mänguserver (mp.php, docs/MULTIPLAYER.md section 9): 'server' when the game server runs the room's shift,
        // '' for lockstep and race rooms.
        7 => [
            "ALTER TABLE rooms ADD COLUMN engine TEXT NOT NULL DEFAULT ''",
        ],
        // Kohandatud mäng (rooms.php epd_room_custom, src/sim/custom.ts): the host's drafted force as compact JSON,
        // '' for the prefecture's own roster.
        8 => [
            "ALTER TABLE rooms ADD COLUMN custom TEXT NOT NULL DEFAULT ''",
        ],
        // Kohandatud mäng, each player's own draft (rooms.php epd_route_room_custom): a race player's force, a sector
        // player's desk; '' for none. A sector room's drafts are joined into rooms.custom at the start.
        9 => [
            "ALTER TABLE room_players ADD COLUMN custom TEXT NOT NULL DEFAULT ''",
        ],
        // Admin (admin.php, docs/SERVER.md "Admin"): a user's role ('admin' or ''), a blocked account, and a session
        // generation (a password reset or "log out everywhere" bumps it, which ends every older session); the log of
        // what the admins did (no foreign keys: it outlives the accounts it names).
        10 => [
            "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT ''",
            'ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0',
            'ALTER TABLE users ADD COLUMN sess_gen INTEGER NOT NULL DEFAULT 0',
            "CREATE TABLE admin_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                at INTEGER NOT NULL,
                admin_id INTEGER,
                admin_name TEXT NOT NULL DEFAULT '',
                action TEXT NOT NULL,
                target TEXT NOT NULL DEFAULT '',
                detail TEXT NOT NULL DEFAULT '',
                ip TEXT NOT NULL DEFAULT ''
            )",
            'CREATE INDEX admin_log_at ON admin_log (at)',
        ],
        // Mitmikmängu voorud (rooms.php epd_room_new_round, docs/MULTIPLAYER.md section 11): a room plays one round
        // after another without its players joining again. `round` counts them; when the room opens for the next
        // round, the results of the one before move to room_round_results with that round's mode and seed.
        11 => [
            'ALTER TABLE rooms ADD COLUMN round INTEGER NOT NULL DEFAULT 1',
            "CREATE TABLE room_round_results (
                room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                round INTEGER NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                mode TEXT NOT NULL DEFAULT 'race',
                seed INTEGER NOT NULL DEFAULT 0,
                score INTEGER NOT NULL,
                grade TEXT NOT NULL,
                incidents INTEGER NOT NULL,
                arrests INTEGER NOT NULL DEFAULT 0,
                xp INTEGER NOT NULL DEFAULT 0,
                at INTEGER NOT NULL,
                PRIMARY KEY (room_id, round, user_id)
            )",
            'CREATE INDEX room_round_results_user ON room_round_results (user_id)',
        ],
        // Mitmikmängust eemaldamine (rooms.php epd_route_room_kick, docs/MULTIPLAYER.md section 12): the host removes a
        // player, who cannot come back to that room with its code.
        12 => [
            'CREATE TABLE room_bans (
                room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                at INTEGER NOT NULL,
                PRIMARY KEY (room_id, user_id)
            )',
            'CREATE INDEX room_bans_user ON room_bans (user_id)',
        ],
        // Profiilipilt (auth.php epd_route_avatar, 2.35.0): '' for the drawn avatar of the name, 'face:<id>' for a photo of
        // the game's face pool (public/faces), 'draw:<seed>' for another drawing.
        13 => [
            "ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''",
        ],
        // Ühine raport ja ruumi ajalugu (rooms.php epd_route_room_history, 2.36.0, docs/MULTIPLAYER.md section 14): the
        // joint report of a co-op round, as the first result of the round brought it (a game server round: its signed
        // result), so the room's players can open it again later.
        14 => [
            'CREATE TABLE room_reports (
                room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                round INTEGER NOT NULL,
                summary TEXT NOT NULL,
                at INTEGER NOT NULL,
                PRIMARY KEY (room_id, round)
            )',
        ],
        // Suurõnnetus (rooms.php epd_room_options, 2.37.0, docs/CRISIS.md): whether the room's shift may have a crisis,
        // 'random' (its chance), 'on' (always) or 'off' (never).
        15 => [
            "ALTER TABLE rooms ADD COLUMN crisis TEXT NOT NULL DEFAULT 'random'",
        ],
        // Väljakutse lingiga (challenges.php, 2.38.0, docs/CHALLENGE.md): a free shift's setup under a code, and the runs
        // of it (the sender's first, then each player's first).
        16 => [
            'CREATE TABLE challenges (
                id INTEGER PRIMARY KEY,
                code TEXT NOT NULL UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                setup TEXT NOT NULL,
                version TEXT NOT NULL DEFAULT \'\',
                created INTEGER NOT NULL
            )',
            'CREATE INDEX challenges_user ON challenges (user_id, created)',
            'CREATE TABLE challenge_results (
                challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                score INTEGER NOT NULL,
                grade TEXT NOT NULL,
                closed INTEGER NOT NULL,
                arrests INTEGER NOT NULL,
                p1 INTEGER,
                crisis INTEGER,
                at INTEGER NOT NULL,
                PRIMARY KEY (challenge_id, user_id)
            )',
            'CREATE INDEX challenge_results_user ON challenge_results (user_id)',
        ],
    ];
}

function epd_schema_version(PDO $db): int
{
    return (int) $db->query('SELECT COALESCE(MAX(version), 0) FROM schema_version')->fetchColumn();
}

/**
 * Bring $db to the latest schema. $migrations replaces epd_migrations() in tests only.
 *
 * @param array<int, list<string>>|null $migrations
 */
function epd_migrate(PDO $db, ?array $migrations = null): void
{
    $db->exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied INTEGER NOT NULL)');
    $migrations ??= epd_migrations();
    ksort($migrations);
    if (epd_schema_version($db) >= max(array_keys($migrations))) {
        return;
    }
    // IMMEDIATE takes the write lock up front, so two first requests cannot migrate twice.
    $db->exec('BEGIN IMMEDIATE');
    try {
        $current = epd_schema_version($db);
        $record = $db->prepare('INSERT INTO schema_version (version, applied) VALUES (?, ?)');
        foreach ($migrations as $version => $statements) {
            if ($version <= $current) {
                continue;
            }
            foreach ($statements as $sql) {
                $db->exec($sql);
            }
            $record->execute([$version, epd_now_ms()]);
        }
        $db->exec('COMMIT');
    } catch (Throwable $e) {
        try {
            $db->exec('ROLLBACK');
        } catch (Throwable) {
            // SQLite already rolled back by itself (e.g. disk full): keep the original error.
        }
        throw $e;
    }
}

/** Run $fn inside a transaction and return its result. */
function epd_transaction(PDO $db, callable $fn): mixed
{
    $db->beginTransaction();
    try {
        $result = $fn($db);
        $db->commit();
        return $result;
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}

function epd_is_unique_violation(PDOException $e): bool
{
    return $e->getCode() === '23000' || str_contains($e->getMessage(), 'UNIQUE constraint failed');
}
