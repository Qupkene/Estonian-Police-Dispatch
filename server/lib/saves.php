<?php

declare(strict_types=1);

/**
 * Cloud saves: one JSON object per user and slot (/api/save, /api/save/{slot}).
 * The JSON is stored as sent and spliced into the GET reply unchanged, so a 4 MB autosave
 * is never decoded into PHP arrays.
 *
 * Every write gets a version (`updated`, unix ms, strictly growing per slot). A client sends the
 * version it last saw as `?base=`, and the write only happens when that is still the stored
 * version (else 409 `save_conflict`), so a stale tab or device can never overwrite newer progress.
 * A delete keeps a marker row (JSON `null` with its own version), so other devices see it.
 */

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

/** Slot name => maximum size in bytes. */
const EPD_SAVE_SLOTS = [
    'career' => 512 * 1024,
    'settings' => 512 * 1024,
    'autosave' => 4 * 1024 * 1024,
];

function epd_save_limit(string $slot): int
{
    return EPD_SAVE_SLOTS[$slot] ?? epd_fail(400, 'bad_slot', 'Tundmatu salvestuskoht.');
}

/** The `base` query parameter (the version the client last saw, 0 = none), or null when it was not sent. */
function epd_save_base(): ?int
{
    $raw = $_GET['base'] ?? null;
    if ($raw === null) {
        return null;
    }
    if (!is_string($raw) || $raw === '' || strlen($raw) > 16 || !ctype_digit($raw)) {
        epd_fail(400, 'bad_base', 'Vigane versioon.', [], ['field' => 'base']);
    }
    return (int) $raw;
}

/**
 * Store $json ('null' for a deletion marker) in a slot and return its new version. With a $base,
 * the write only happens when the stored version (0 for a missing row) still equals it.
 */
function epd_save_write(int $userId, string $slot, string $json, ?int $base): int
{
    $db = epd_db();
    // IMMEDIATE takes the write lock before the version is read, so two writers cannot both pass the check.
    $db->exec('BEGIN IMMEDIATE');
    try {
        $stmt = $db->prepare('SELECT updated FROM saves WHERE user_id = ? AND slot = ?');
        $stmt->execute([$userId, $slot]);
        $found = $stmt->fetchColumn();
        $current = $found === false ? 0 : (int) $found;
        if ($base !== null && $base !== $current) {
            epd_fail(409, 'save_conflict', 'Salvestus on vahepeal teises seadmes muutunud.', [], ['updated' => $current]);
        }
        // Versions only grow, also when two writes land in the same millisecond.
        $updated = max(epd_now_ms(), $current + 1);
        $db->prepare(
            'INSERT INTO saves (user_id, slot, json, updated) VALUES (?, ?, ?, ?)
             ON CONFLICT (user_id, slot) DO UPDATE SET json = excluded.json, updated = excluded.updated'
        )->execute([$userId, $slot, $json, $updated]);
        $db->exec('COMMIT');
        return $updated;
    } catch (Throwable $e) {
        $db->exec('ROLLBACK');
        throw $e;
    }
}

/**
 * GET /api/save: every slot (null when missing or deleted) and the versions that exist, in unix ms.
 * `?versions=1` answers only `{ updated }`, a cheap check whether another device saved something.
 */
function epd_route_save_get(): ApiReply
{
    $user = epd_require_user();
    $versionsOnly = ($_GET['versions'] ?? '') === '1';
    $stmt = epd_db()->prepare(
        $versionsOnly ? 'SELECT slot, updated FROM saves WHERE user_id = ?' : 'SELECT slot, json, updated FROM saves WHERE user_id = ?'
    );
    $stmt->execute([$user['id']]);
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $rows[(string) $row['slot']] = $row;
    }

    $parts = [];
    $updated = [];
    foreach (array_keys(EPD_SAVE_SLOTS) as $slot) {
        if (!$versionsOnly) {
            // Stored JSON was validated on write, so it can be embedded as is (a deletion marker is `null`).
            $parts[] = epd_json($slot) . ':' . (isset($rows[$slot]) ? (string) $rows[$slot]['json'] : 'null');
        }
        if (isset($rows[$slot])) {
            $updated[$slot] = (int) $rows[$slot]['updated'];
        }
    }
    $parts[] = '"updated":' . epd_json((object) $updated);
    return new ApiReply(200, '{' . implode(',', $parts) . '}');
}

/** PUT /api/save/{slot}[?base=]: store any JSON object within the slot's size limit. */
function epd_route_save_put(string $slot): ApiReply
{
    $user = epd_require_user();
    $json = trim(epd_raw_body(epd_save_limit($slot)));
    if ($json === '' || $json[0] !== '{') {
        epd_fail(400, 'not_object', 'Salvestus peab olema JSON-objekt.');
    }
    if (!json_validate($json)) {
        epd_fail(400, 'bad_json', 'Vigane JSON.');
    }
    $updated = epd_save_write((int) $user['id'], $slot, $json, epd_save_base());
    return epd_reply(['ok' => true, 'updated' => $updated]);
}

/** DELETE /api/save/{slot}[?base=]: replace the slot with a deletion marker. Deleting a missing slot is fine. */
function epd_route_save_delete(string $slot): ApiReply
{
    $user = epd_require_user();
    epd_save_limit($slot);
    $updated = epd_save_write((int) $user['id'], $slot, 'null', epd_save_base());
    return epd_reply(['ok' => true, 'updated' => $updated]);
}
