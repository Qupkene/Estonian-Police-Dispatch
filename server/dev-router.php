<?php

declare(strict_types=1);

/**
 * Router for PHP's built-in server during development:
 *
 *   php -S 127.0.0.1:8787 server/dev-router.php      (npm run dev:api)
 *
 * /api/* goes to the API; everything else is 404 (Vite serves the frontend and proxies /api).
 * Data goes to EPD_DATA, or data-dev/ in the repository when it is not set.
 */

$epdDevPath = explode('?', (string) ($_SERVER['REQUEST_URI'] ?? '/'), 2)[0];

if ($epdDevPath === '/api' || str_starts_with($epdDevPath, '/api/')) {
    require __DIR__ . '/api/index.php';
    return true;
}

header_remove('X-Powered-By');
http_response_code(404);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode(['error' => 'not_found', 'message' => 'Arendusserver vastab ainult /api/ päringutele.'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
return true;
