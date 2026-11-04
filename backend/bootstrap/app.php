<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

// Support split deployment (cPanel): when public/ lives in the web root and the
// rest of the app lives in a configurable private path, public/index.php exports
// APP_BASE_PATH / APP_PUBLIC_PATH before this file is loaded. Fall back to the
// standard single-folder layout.
$app = Application::configure(basePath: env('APP_BASE_PATH') ?: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->api(prepend: [
            \App\Http\Middleware\AuthenticateFromCookie::class,
        ]);
        $middleware->validateCsrfTokens(except: [
            'api/*',
        ]);
        $middleware->redirectGuestsTo(fn () => response()->json(['message' => 'Unauthenticated.'], 401));
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->shouldRenderJsonWhen(function (\Illuminate\Http\Request $request, \Throwable $e) {
            return $request->is('api/*') || $request->expectsJson();
        });
    })->create();

// In split deployment the web root is NOT basePath/public; point public_path()
// at the real web root so the public disk (uploads) and assets resolve correctly.
$publicPath = env('APP_PUBLIC_PATH');
if ($publicPath && is_dir($publicPath)) {
    $app->usePublicPath(rtrim($publicPath, '/'));
}

return $app;
