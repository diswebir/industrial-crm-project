<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

$app = Application::configure(basePath: dirname(__DIR__))
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
        $middleware->alias([
            'active' => \App\Http\Middleware\EnsureUserIsActive::class,
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

// Set before any configuration/provider resolves public_path(). Also supports CLI.
if ($publicPath = ($_SERVER['APP_PUBLIC_PATH'] ?? getenv('APP_PUBLIC_PATH'))) {
    $app->usePublicPath($publicPath);
}

$app->afterBootstrapping(\Illuminate\Foundation\Bootstrap\LoadEnvironmentVariables::class, function ($app) {
    if ($publicPath = ($_SERVER['APP_PUBLIC_PATH'] ?? env('APP_PUBLIC_PATH'))) {
        $app->usePublicPath($publicPath);
    }
});

return $app;
