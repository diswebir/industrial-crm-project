<?php

/*
 * توکن‌های Sanctum به‌طور پیش‌فرض تاریخ انقضا ندارند؛ عمر آن‌ها را با عمر کوکی
 * ورود (۷ روز) هم‌تراز می‌کنیم تا توکن گم‌شده/دزدیده‌شده برای همیشه معتبر نماند.
 *
 * این فایل کامل است (نه فقط کلید expiration) چون هنگام `config:cache`، لاراول
 * مقادیر پیش‌فرض بسته را با فایل برنامه merge نمی‌کند.
 */
return [
    // احراز هویت SPA مبتنی بر دامنه در این پروژه استفاده نمی‌شود؛ توکن از کوکی
    // httpOnly به هدر Authorization منتقل می‌شود.
    'stateful' => [],

    'guard' => ['web'],

    'expiration' => 60 * 24 * 7,

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    'middleware' => [
        'authenticate_session' => Laravel\Sanctum\Http\Middleware\AuthenticateSession::class,
        'encrypt_cookies' => Illuminate\Cookie\Middleware\EncryptCookies::class,
        'validate_csrf_token' => Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
    ],
];
