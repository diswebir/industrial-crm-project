<?php

declare(strict_types=1);

define('LARAVEL_START', microtime(true));
$baseDir = require __DIR__.'/paths.php';
if (!is_string($baseDir) || !is_file($baseDir.'/vendor/autoload.php')) {
    http_response_code(500);
    exit('Application path is not configured.');
}
if (file_exists($maintenance = $baseDir.'/storage/framework/maintenance.php')) {
    require $maintenance;
}
require $baseDir.'/vendor/autoload.php';
$app = require $baseDir.'/bootstrap/app.php';
$app->usePublicPath(__DIR__);
$app->handleRequest(Illuminate\Http\Request::capture());
