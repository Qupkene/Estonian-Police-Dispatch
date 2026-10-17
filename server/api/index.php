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
require_once dirname(__DIR__) . '/lib/hook.php';

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
        ['POST', '#^/api/deploy-hook$#', epd_route_deploy_hook(...)],
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
