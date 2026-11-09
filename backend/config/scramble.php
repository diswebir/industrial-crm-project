<?php

return [
    /*
     * Your API path. By default, all routes starting with this path will be added to the docs.
     */
    'api_path' => 'api/v1',

    'api_domain' => null,

    /*
     * The title and info of the API.
     */
    'info' => [
        'version' => '1.0.0',
        'title' => 'سامانه مدیریت مشتریان و دستگاه‌های صنعتی (Industrial Devices CRM API)',
        'description' => 'مستندات کامل اندپوئینت‌های احراز هویت، مدیریت مشتریان و نقش‌ها (RBAC)، کاتالوگ دستگاه‌ها، انبار و کنترل موجودی، تخصیص دستگاه با شماره سریال، سوابق سرویس و پیامک‌های الگو.',
    ],

    /*
     * Customize Scramble UI.
     */
    'ui' => [
        'title' => 'Parts CRM - OpenAPI Documentation',
        'theme' => 'light',
        'hide_try_it' => false,
    ],

    'servers' => [
        'Local API Server' => 'http://localhost:8000/api/v1',
    ],

    'middleware' => [
        'web',
    ],
];
