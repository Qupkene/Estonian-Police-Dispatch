<?php

declare(strict_types=1);

/**
 * EPD API: the single entry point for every /api/* request (see docs/SERVER.md, section 4).
 * The web server hands all /api/* paths to this file; the router reads the path itself.
 */

require_once dirname(__DIR__) . '/lib/http.php';
require_once dirname(__DIR__) . '/lib/db.php';
require_once dirname(__DIR__) . '/lib/auth.php';
require_once dirname(__DIR__) . '/lib/saves.php';
require_once dirname(__DIR__) . '/lib/scores.php';
require_once dirname(__DIR__) . '/lib/daily.php';
require_once dirname(__DIR__) . '/lib/rooms.php';
require_once dirname(__DIR__) . '/lib/hook.php';
require_once dirname(__DIR__) . '/lib/tts.php';
require_once dirname(__DIR__) . '/lib/admin.php';

/**
 * Method, path pattern and handler. Capture groups become handler arguments.
 *
 * @return list<array{0: string, 1: string, 2: callable}>
 */
function epd_routes(): array
{
    return [
        ['GET', '#^/api/health$#', epd_route_health(...)],
        ['GET', '#^/api/me$#', epd_route_me(...)],
        ['DELETE', '#^/api/me$#', epd_route_delete_me(...)],
        ['POST', '#^/api/register$#', epd_route_register(...)],
        ['POST', '#^/api/login$#', epd_route_login(...)],
        ['POST', '#^/api/logout$#', epd_route_logout(...)],
        ['GET', '#^/api/save$#', epd_route_save_get(...)],
        ['PUT', '#^/api/save/([A-Za-z0-9_-]{1,32})$#', epd_route_save_put(...)],
        ['DELETE', '#^/api/save/([A-Za-z0-9_-]{1,32})$#', epd_route_save_delete(...)],
        ['POST', '#^/api/score$#', epd_route_score_post(...)],
        ['GET', '#^/api/scores$#', epd_route_scores_get(...)],
        ['POST', '#^/api/daily$#', epd_route_daily_post(...)],
        ['GET', '#^/api/daily$#', epd_route_daily_get(...)],
        ['GET', '#^/api/rooms$#', epd_route_room_mine(...)],
        ['POST', '#^/api/rooms$#', epd_route_room_create(...)],
        ['POST', '#^/api/rooms/join$#', epd_route_room_join(...)],
        ['GET', '#^/api/rooms/([A-Za-z0-9]{6})$#', epd_route_room_get(...)],
        ['PUT', '#^/api/rooms/([A-Za-z0-9]{6})$#', epd_route_room_update(...)],
        ['POST', '#^/api/rooms/([A-Za-z0-9]{6})/ready$#', epd_route_room_ready(...)],
        ['POST', '#^/api/rooms/([A-Za-z0-9]{6})/custom$#', epd_route_room_custom(...)],
        ['POST', '#^/api/rooms/([A-Za-z0-9]{6})/start$#', epd_route_room_start(...)],
        ['POST', '#^/api/rooms/([A-Za-z0-9]{6})/leave$#', epd_route_room_leave(...)],
        ['POST', '#^/api/rooms/([A-Za-z0-9]{6})/result$#', epd_route_room_result(...)],
        ['POST', '#^/api/rooms/([A-Za-z0-9]{6})/role$#', epd_route_coop_role(...)],
        ['POST', '#^/api/rooms/([A-Za-z0-9]{6})/desk$#', epd_route_coop_desk(...)],
        ['POST', '#^/api/rooms/([A-Za-z0-9]{6})/ticket$#', epd_route_room_ticket(...)],
        ['POST', '#^/api/rooms/([A-Za-z0-9]{6})/cmd$#', epd_route_coop_cmd(...)],
        ['GET', '#^/api/rooms/([A-Za-z0-9]{6})/log$#', epd_route_coop_log(...)],
        ['PUT', '#^/api/rooms/([A-Za-z0-9]{6})/snapshot$#', epd_route_coop_snapshot_put(...)],
        ['GET', '#^/api/rooms/([A-Za-z0-9]{6})/snapshot$#', epd_route_coop_snapshot_get(...)],
        // Admin panel (server/lib/admin.php): admins only, unlocked with the password again.
        ['GET', '#^/api/admin/me$#', epd_route_admin_me(...)],
        ['POST', '#^/api/admin/unlock$#', epd_route_admin_unlock(...)],
        ['POST', '#^/api/admin/lock$#', epd_route_admin_lock(...)],
        ['GET', '#^/api/admin/stats$#', epd_route_admin_stats(...)],
        ['GET', '#^/api/admin/users$#', epd_route_admin_users(...)],
        ['POST', '#^/api/admin/users$#', epd_route_admin_user_create(...)],
        ['GET', '#^/api/admin/users/([0-9]{1,12})$#', epd_route_admin_user_get(...)],
        ['PATCH', '#^/api/admin/users/([0-9]{1,12})$#', epd_route_admin_user_patch(...)],
        ['DELETE', '#^/api/admin/users/([0-9]{1,12})$#', epd_route_admin_user_delete(...)],
        ['POST', '#^/api/admin/users/([0-9]{1,12})/password$#', epd_route_admin_user_password(...)],
        ['POST', '#^/api/admin/users/([0-9]{1,12})/logout$#', epd_route_admin_user_logout(...)],
        ['POST', '#^/api/admin/users/([0-9]{1,12})/unlimit$#', epd_route_admin_user_unlimit(...)],
        ['GET', '#^/api/admin/users/([0-9]{1,12})/saves/([A-Za-z0-9_-]{1,32})$#', epd_route_admin_save_get(...)],
        ['PUT', '#^/api/admin/users/([0-9]{1,12})/saves/([A-Za-z0-9_-]{1,32})$#', epd_route_admin_save_put(...)],
        ['DELETE', '#^/api/admin/users/([0-9]{1,12})/saves/([A-Za-z0-9_-]{1,32})$#', epd_route_admin_save_delete(...)],
        ['GET', '#^/api/admin/scores$#', epd_route_admin_scores(...)],
        ['POST', '#^/api/admin/scores$#', epd_route_admin_score_create(...)],
        ['PATCH', '#^/api/admin/scores/([0-9]{1,12})$#', epd_route_admin_score_patch(...)],
        ['DELETE', '#^/api/admin/scores/([0-9]{1,12})$#', epd_route_admin_score_delete(...)],
        ['GET', '#^/api/admin/daily$#', epd_route_admin_daily(...)],
        ['POST', '#^/api/admin/daily$#', epd_route_admin_daily_create(...)],
        ['PATCH', '#^/api/admin/daily/([0-9]{1,12})$#', epd_route_admin_daily_patch(...)],
        ['DELETE', '#^/api/admin/daily/([0-9]{1,12})$#', epd_route_admin_daily_delete(...)],
        ['GET', '#^/api/admin/rooms$#', epd_route_admin_rooms(...)],
        ['GET', '#^/api/admin/rooms/([A-Za-z0-9]{6})$#', epd_route_admin_room_get(...)],
        ['DELETE', '#^/api/admin/rooms/([A-Za-z0-9]{6})$#', epd_route_admin_room_delete(...)],
        ['POST', '#^/api/admin/rooms/([A-Za-z0-9]{6})/close$#', epd_route_admin_room_close(...)],
        ['DELETE', '#^/api/admin/rooms/([A-Za-z0-9]{6})/results/([0-9]{1,12})$#', epd_route_admin_room_result_delete(...)],
        ['GET', '#^/api/admin/log$#', epd_route_admin_log(...)],
        ['GET', '#^/api/admin/backups$#', epd_route_admin_backups(...)],
        ['POST', '#^/api/admin/backups$#', epd_route_admin_backup_create(...)],
        ['POST', '#^/api/deploy-hook$#', epd_route_deploy_hook(...)],
        ['POST', '#^/api/tts$#', epd_route_tts(...)],
    ];
}

/** Deployed commit from version.txt (written by the update script), else "dev". */
function epd_version(): string
{
    $candidates = ['/app/www/version.txt', dirname(__DIR__, 2) . '/../www/version.txt'];
    foreach ($candidates as $file) {
        if (!is_file($file) || !is_readable($file)) {
            continue;
        }
        $version = trim((string) file_get_contents($file, false, null, 0, 256));
        if (preg_match('/^[0-9A-Za-z._+-]{1,64}$/', $version) === 1) {
            return $version;
        }
    }
    return 'dev';
}

/** GET /api/health. Also opens the database, so a broken data volume shows up here. */
function epd_route_health(): ApiReply
{
    epd_db()->query('SELECT 1')->fetchColumn();
    return epd_reply(['ok' => true, 'version' => epd_version(), 'accounts' => true]);
}

function epd_dispatch(string $method, string $path): ApiReply
{
    $allowed = [];
    foreach (epd_routes() as [$routeMethod, $pattern, $handler]) {
        if (preg_match($pattern, $path, $match) !== 1) {
            continue;
        }
        if ($routeMethod !== $method) {
            $allowed[] = $routeMethod;
            continue;
        }
        epd_csrf_guard($method, $path);
        return $handler(...array_slice($match, 1));
    }
    if ($allowed !== []) {
        epd_fail(405, 'method_not_allowed', 'Seda meetodit siin ei toetata.', ['Allow' => implode(', ', array_unique($allowed))]);
    }
    epd_fail(404, 'not_found', 'Sellist aadressi ei ole.');
}

function epd_main(): void
{
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    // Warnings and notices become exceptions (answered with a clean 500); deprecations only get logged.
    set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
        if (!(error_reporting() & $severity) || in_array($severity, [E_DEPRECATED, E_USER_DEPRECATED], true)) {
            return false;
        }
        throw new ErrorException($message, 0, $severity, $file, $line);
    });

    $method = epd_method();
    $path = epd_path();
    try {
        $reply = epd_dispatch($method, $path);
    } catch (ApiError $e) {
        $reply = epd_error_reply($e);
    } catch (Throwable $e) {
        error_log(sprintf('EPD API %s %s failed: %s: %s (%s:%d)', $method, $path, $e::class, $e->getMessage(), $e->getFile(), $e->getLine()));
        $reply = epd_reply(['error' => 'server_error', 'message' => 'Serveri viga, proovi hiljem uuesti.'], 500);
    } finally {
        restore_error_handler();
    }
    epd_send($reply);
}

epd_main();
