<?php

declare(strict_types=1);

/**
 * Cloud saves: one JSON object per user and slot (/api/save, /api/save/{slot}).
 * The JSON is stored as sent and spliced into the GET reply unchanged, so a 4 MB autosave
 * is never decoded into PHP arrays.
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

/** GET /api/save: every slot (null when missing) and the update times that exist, in unix ms. */
function epd_route_save_get(): ApiReply
{
    $user = epd_require_user();
    $stmt = epd_db()->prepare('SELECT slot, json, updated FROM saves WHERE user_id = ?');
    $stmt->execute([$user['id']]);
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $rows[(string) $row['slot']] = $row;
    }

    $parts = [];
    $updated = [];
    foreach (array_keys(EPD_SAVE_SLOTS) as $slot) {
        // Stored JSON was validated on write, so it can be embedded as is.
        $parts[] = epd_json($slot) . ':' . (isset($rows[$slot]) ? (string) $rows[$slot]['json'] : 'null');
        if (isset($rows[$slot])) {
            $updated[$slot] = (int) $rows[$slot]['updated'];
        }
    }
    $parts[] = '"updated":' . epd_json((object) $updated);
    return new ApiReply(200, '{' . implode(',', $parts) . '}');
}

/** PUT /api/save/{slot}: store any JSON object within the slot's size limit. */
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
    $updated = epd_now_ms();
    epd_db()->prepare(
        'INSERT INTO saves (user_id, slot, json, updated) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, slot) DO UPDATE SET json = excluded.json, updated = excluded.updated'
    )->execute([$user['id'], $slot, $json, $updated]);
    return epd_reply(['ok' => true, 'updated' => $updated]);
}

/** DELETE /api/save/{slot}. Deleting a missing slot is fine. */
function epd_route_save_delete(string $slot): ApiReply
{
    $user = epd_require_user();
    epd_save_limit($slot);
    epd_db()->prepare('DELETE FROM saves WHERE user_id = ? AND slot = ?')->execute([$user['id'], $slot]);
    return epd_reply(['ok' => true]);
}
