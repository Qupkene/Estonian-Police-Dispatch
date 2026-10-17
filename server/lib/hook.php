<?php

declare(strict_types=1);

/**
 * GitHub webhook (POST /api/deploy-hook). A successful CI run on main leaves an update
 * ticket in EPD_DATA/control/uuenda.json; the host's politsei-uuenda.path picks it up.
 * The host script only ever deploys the tip of origin/main, so the ticket is a nudge,
 * not an instruction.
 */

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/db.php';

const EPD_HOOK_BODY_LIMIT = 1024 * 1024;
const EPD_HOOK_REPOSITORY = 'Qupkene/Estonian-Police-Dispatch';
const EPD_HOOK_WORKFLOW = 'CI';
const EPD_HOOK_BRANCH = 'main';

/** Shared secret from EPD_DATA/deploy-secret; 503 while it is not set up. */
function epd_deploy_secret(): string
{
    $file = epd_data_dir() . '/deploy-secret';
    $secret = is_file($file) && is_readable($file) ? trim((string) file_get_contents($file)) : '';
    return $secret !== '' ? $secret : epd_fail(503, 'not_configured', 'Automaatne uuendus pole seadistatud.');
}

/** 401 unless X-Hub-Signature-256 is the HMAC-SHA256 of the exact body. */
function epd_hook_verify(string $body, string $secret): void
{
    $expected = 'sha256=' . hash_hmac('sha256', $body, $secret);
    $given = trim(epd_header('X-Hub-Signature-256') ?? '');
    if ($given === '' || !hash_equals($expected, $given)) {
        epd_fail(401, 'bad_signature', 'Vale allkiri.');
    }
}

/** Short text for a field that does not match, e.g. "conclusion=failure". */
function epd_hook_mismatch(string $field, mixed $value): string
{
    $text = is_scalar($value) ? (string) $value : ($value === null ? 'null' : gettype($value));
    return $field . '=' . mb_substr($text, 0, 80, 'UTF-8');
}

/**
 * Why a workflow_run payload does not trigger an update, or null when it should.
 *
 * @param array<string, mixed> $payload
 */
function epd_hook_ignore_reason(array $payload): ?string
{
    $run = $payload['workflow_run'] ?? null;
    if (!is_array($run)) {
        return 'workflow_run=missing';
    }
    $repo = is_array($run['head_repository'] ?? null) ? ($run['head_repository']['full_name'] ?? null) : null;
    $checks = [
        'action' => [$payload['action'] ?? null, 'completed'],
        'conclusion' => [$run['conclusion'] ?? null, 'success'],
        'head_branch' => [$run['head_branch'] ?? null, EPD_HOOK_BRANCH],
        'event' => [$run['event'] ?? null, 'push'],
        'name' => [$run['name'] ?? null, EPD_HOOK_WORKFLOW],
        'head_repository' => [$repo, EPD_HOOK_REPOSITORY],
    ];
    foreach ($checks as $field => [$actual, $wanted]) {
        if ($actual !== $wanted) {
            return epd_hook_mismatch($field, $actual);
        }
    }
    $sha = $run['head_sha'] ?? null;
    if (!is_string($sha) || preg_match('/^[0-9a-f]{40}$/', $sha) !== 1) {
        return epd_hook_mismatch('head_sha', $sha);
    }
    return null;
}

/** Write the ticket atomically: temp file in the same directory, then rename over the old one. */
function epd_write_ticket(string $sha): void
{
    $dir = epd_data_dir() . '/control';
    epd_ensure_dir($dir, 0755);
    $json = epd_json(['sha' => $sha, 'at' => epd_now_ms(), 'source' => 'webhook']) . "\n";
    $tmp = $dir . '/.uuenda.json.' . bin2hex(random_bytes(6)) . '.tmp';
    try {
        if (file_put_contents($tmp, $json) !== strlen($json)) {
            throw new RuntimeException('Short write to ' . $tmp);
        }
        chmod($tmp, 0644);
        if (!rename($tmp, $dir . '/uuenda.json')) {
            throw new RuntimeException('Cannot rename ' . $tmp);
        }
    } catch (Throwable $e) {
        if (is_file($tmp)) {
            unlink($tmp);
        }
        throw $e;
    }
}

function epd_route_deploy_hook(): ApiReply
{
    $secret = epd_deploy_secret();
    $body = epd_raw_body(EPD_HOOK_BODY_LIMIT);
    epd_hook_verify($body, $secret);

    $event = trim(epd_header('X-GitHub-Event') ?? '');
    if ($event === 'ping') {
        return epd_reply(['pong' => true]);
    }
    if ($event !== 'workflow_run') {
        return epd_reply(['ignored' => epd_hook_mismatch('event', $event)]);
    }
    try {
        $payload = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        epd_fail(400, 'bad_json', 'Vigane JSON.');
    }
    if (!is_array($payload)) {
        epd_fail(400, 'bad_json', 'Vigane JSON.');
    }
    $reason = epd_hook_ignore_reason($payload);
    if ($reason !== null) {
        return epd_reply(['ignored' => $reason]);
    }
    $sha = (string) $payload['workflow_run']['head_sha'];
    epd_write_ticket($sha);
    return epd_reply(['queued' => $sha], 202);
}
