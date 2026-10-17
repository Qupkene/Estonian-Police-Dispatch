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
 * Schema migrations, applied in order. Never edit a released step: append a new one.
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
    ];
}

function epd_schema_version(PDO $db): int
{
    return (int) $db->query('SELECT COALESCE(MAX(version), 0) FROM schema_version')->fetchColumn();
}

function epd_migrate(PDO $db): void
{
    $db->exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied INTEGER NOT NULL)');
    $migrations = epd_migrations();
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
        $db->exec('ROLLBACK');
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
