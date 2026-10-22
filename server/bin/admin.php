<?php

declare(strict_types=1);

/**
 * Admins on the server's command line (docs/SERVER.md "Admin"): the first admin is made here, never over the web.
 *
 *   docker exec -it politsei php /app/server/bin/admin.php                  asks for the name, makes it an admin
 *   docker exec -it politsei php /app/server/bin/admin.php nimekiri         lists the admins
 *   docker exec -it politsei php /app/server/bin/admin.php lisa NIMI        makes NIMI an admin
 *   docker exec -it politsei php /app/server/bin/admin.php eemalda NIMI     takes the admin rights away
 *   docker exec -it politsei php /app/server/bin/admin.php parool NIMI      a new generated password (shown once),
 *                                                                           every session ends, the block goes
 *
 * The account must exist (register in the game first). Every change is in admin_log as "server".
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/lib/admin.php';

function epd_cli_say(string $line): void
{
    fwrite(STDOUT, $line . "\n");
}

function epd_cli_fail(string $line): never
{
    fwrite(STDERR, $line . "\n");
    exit(1);
}

/** @return array<string, mixed> */
function epd_cli_user(PDO $db, string $name): array
{
    $user = epd_find_user_by_key($db, epd_name_key(epd_clean_name($name)));
    if ($user === null) {
        epd_cli_fail("Kontot \"$name\" ei ole. Registreeri see enne mängus (politsei.eu, Konto).");
    }
    return $user;
}

/** @param array<string, mixed> $detail */
function epd_cli_log(PDO $db, string $action, int $userId, array $detail): void
{
    $db->prepare('INSERT INTO admin_log (at, admin_id, admin_name, action, target, detail, ip) VALUES (?, NULL, ?, ?, ?, ?, ?)')
        ->execute([epd_now_ms(), 'server', $action, "user:$userId", epd_json($detail), 'cli']);
}

function epd_cli_admins(PDO $db): void
{
    $rows = $db->query("SELECT name, last_login FROM users WHERE role = 'admin' ORDER BY name_key")->fetchAll();
    if (!$rows) {
        epd_cli_say('Admine ei ole veel.');
        return;
    }
    epd_cli_say('Adminid:');
    foreach ($rows as $r) {
        $last = $r['last_login'] === null ? 'pole sisse loginud' : 'viimati ' . gmdate('Y-m-d H:i', intdiv((int) $r['last_login'], 1000)) . ' UTC';
        epd_cli_say('  ' . $r['name'] . " ($last)");
    }
}

function epd_cli_grant(PDO $db, string $name): void
{
    $user = epd_cli_user($db, $name);
    if (($user['role'] ?? '') === 'admin') {
        epd_cli_say($user['name'] . ' on juba admin.');
        return;
    }
    $db->prepare("UPDATE users SET role = 'admin', disabled = 0 WHERE id = ?")->execute([(int) $user['id']]);
    epd_cli_log($db, 'user_update', (int) $user['id'], ['admin' => true]);
    epd_cli_say($user['name'] . ' on nüüd admin. Ava https://politsei.eu/admin/ ja logi sisse selle kontoga.');
}

function epd_cli_revoke(PDO $db, string $name): void
{
    $user = epd_cli_user($db, $name);
    if (($user['role'] ?? '') !== 'admin') {
        epd_cli_say($user['name'] . ' ei ole admin.');
        return;
    }
    $db->prepare("UPDATE users SET role = '' WHERE id = ?")->execute([(int) $user['id']]);
    epd_cli_log($db, 'user_update', (int) $user['id'], ['admin' => false]);
    epd_cli_say($user['name'] . ' ei ole enam admin.');
}

function epd_cli_password(PDO $db, string $name): void
{
    $user = epd_cli_user($db, $name);
    $password = epd_admin_new_password();
    $db->prepare('UPDATE users SET pass_hash = ?, sess_gen = sess_gen + 1, disabled = 0 WHERE id = ?')
        ->execute([epd_hash_password($password), (int) $user['id']]);
    $db->prepare('DELETE FROM login_attempts WHERE name_key = ?')->execute([(string) $user['name_key']]);
    epd_cli_log($db, 'user_password', (int) $user['id'], ['name' => (string) $user['name'], 'generated' => true]);
    epd_cli_say('Konto ' . $user['name'] . ' uus parool (näidatakse ainult nüüd): ' . $password);
    epd_cli_say('Kõik selle konto sessioonid lõppesid. Oma parooli saad hiljem muuta admini paneelis (Kontod, sinu konto).');
}

function epd_cli_ask(string $question): string
{
    fwrite(STDOUT, $question);
    $line = fgets(STDIN);
    return $line === false ? '' : trim($line);
}

try {
    $db = epd_db();
    $command = $argv[1] ?? '';
    $name = $argv[2] ?? '';
    match (true) {
        $command === '' => (static function () use ($db): void {
            epd_cli_admins($db);
            $name = epd_cli_ask('Mis konto teha adminiks? (kasutajanimi, tühi = loobu): ');
            if ($name === '') {
                epd_cli_say('Midagi ei muudetud.');
                return;
            }
            epd_cli_grant($db, $name);
        })(),
        $command === 'nimekiri' => epd_cli_admins($db),
        in_array($command, ['lisa', 'eemalda', 'parool'], true) && $name === '' => epd_cli_fail("Anna kasutajanimi: admin.php $command NIMI"),
        $command === 'lisa' => epd_cli_grant($db, $name),
        $command === 'eemalda' => epd_cli_revoke($db, $name),
        $command === 'parool' => epd_cli_password($db, $name),
        default => epd_cli_fail('Tundmatu käsk. Käsud: (tühi), nimekiri, lisa NIMI, eemalda NIMI, parool NIMI'),
    };
} catch (Throwable $e) {
    epd_cli_fail('Viga: ' . $e->getMessage());
}
