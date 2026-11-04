<?php

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

/*
|--------------------------------------------------------------------------
| Resolve the private application root (split deployment support)
|--------------------------------------------------------------------------
|
| On shared hosting (cPanel) the public files may live in the web root
| (e.g. /home/USER/public_html/xx.example.com) while the rest of the
| application (vendor, app, storage, .env, ...) lives in a configurable
| private path outside the web root (e.g. /home/USER/private_pro/project1/myc).
|
| Resolution order:
|   1. app-path.txt next to this file (written by install.php)
|   2. APP_BASE_PATH environment variable
|   3. parent directory of public/ (standard single-directory layout)
|
*/

$appBasePath = dirname(__DIR__);

$pointerFile = __DIR__ . '/app-path.txt';
if (is_file($pointerFile)) {
    $pointed = rtrim(trim((string) file_get_contents($pointerFile)), '/');
    if ($pointed !== '' && is_dir($pointed)) {
        $appBasePath = $pointed;
    }
}

$envBasePath = getenv('APP_BASE_PATH');
if ($envBasePath && is_dir($envBasePath)) {
    $appBasePath = rtrim($envBasePath, '/');
}

// Expose the resolved paths to the framework (env() reads these before .env is loaded).
// APP_PUBLIC_PATH = the real web root (where this index.php lives) — in split
// deployment this differs from basePath/public, and Laravel must use it for
// public_path() so uploads land in <webroot>/storage and are served at /storage.
putenv('APP_BASE_PATH=' . $appBasePath);
$_ENV['APP_BASE_PATH'] = $appBasePath;
$_SERVER['APP_BASE_PATH'] = $appBasePath;

$publicPath = __DIR__;
putenv('APP_PUBLIC_PATH=' . $publicPath);
$_ENV['APP_PUBLIC_PATH'] = $publicPath;
$_SERVER['APP_PUBLIC_PATH'] = $publicPath;

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = $appBasePath . '/storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require $appBasePath . '/vendor/autoload.php';

// Bootstrap Laravel and handle the request...
(require_once $appBasePath . '/bootstrap/app.php')
    ->handleRequest(Request::capture());
