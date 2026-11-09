<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\PartController;
use App\Http\Controllers\Api\V1\SettingController;
use App\Http\Controllers\Api\V1\SmsController;
use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Public Auth & Utility endpoints
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1')->name('login');
    Route::post('/auth/otp/send', [AuthController::class, 'sendOtp'])->middleware('throttle:5,1');
    Route::post('/auth/otp/verify', [AuthController::class, 'verifyOtp'])->middleware('throttle:10,1');
    Route::get('/customers/template', [CustomerController::class, 'template']);
    Route::get('/settings/company', [SettingController::class, 'getCompanySettings']);

    // Protected API endpoints
    Route::middleware('auth:sanctum')->group(function () {
        // User profile & logout
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::match(['put', 'post'], '/auth/me', [AuthController::class, 'updateProfile']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        // Dashboard statistics
        Route::get('/dashboard/stats', [DashboardController::class, 'stats']);

        // Customers
        Route::get('/customers/export', [CustomerController::class, 'export']);
        Route::post('/customers/import', [CustomerController::class, 'import']);
        Route::apiResource('customers', CustomerController::class);

        // Devices (نام قبلی: Parts) — کاتالوگ، موجودی انبار و تخصیص به مشتری
        Route::apiResource('parts', PartController::class);

        // Device assignment to a customer (create / edit / delete)
        Route::post('/customers/{customer}/parts', [PartController::class, 'assign']);
        Route::match(['put', 'post'], '/customer-parts/{customerPart}', [PartController::class, 'updateAssignment']);
        Route::delete('/customer-parts/{customerPart}', [PartController::class, 'destroyAssignment']);

        // Device service / repair histories (create / edit / delete)
        Route::post('/customer-parts/{customerPart}/history', [PartController::class, 'addServiceHistory']);
        Route::match(['put', 'post'], '/service-histories/{serviceHistory}', [PartController::class, 'updateServiceHistory']);
        Route::delete('/service-histories/{serviceHistory}', [PartController::class, 'destroyServiceHistory']);

        // Inventory: stock movements and full audit log
        Route::get('/inventory/summary', [InventoryController::class, 'summary']);
        Route::get('/inventory/reconciliation', [InventoryController::class, 'reconciliation']);
        Route::get('/inventory/logs', [InventoryController::class, 'logs']);
        Route::post('/inventory/stock', [InventoryController::class, 'store']);
        Route::get('/inventory/parts/{part}', [InventoryController::class, 'show']);

        // SMS (Melipayamak)
        Route::post('/sms/send-pattern', [SmsController::class, 'sendPattern']);
        Route::get('/sms/logs', [SmsController::class, 'logs']);

        // System Settings
        Route::get('/settings/sms', [SettingController::class, 'getSmsSettings']);
        Route::put('/settings/sms', [SettingController::class, 'updateSmsSettings']);
        Route::post('/settings/company', [SettingController::class, 'updateCompanySettings']);

        // Roles, Pure ACL permissions and granular customer access
        Route::get('/permissions', [UserController::class, 'availablePermissions']);
        Route::get('/acl/roles', [UserController::class, 'roles']);
        Route::get('/acl/staff', [UserController::class, 'selectableStaff']);
        Route::get('/acl/customers', [UserController::class, 'selectableCustomers']);
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::get('/users/{user}', [UserController::class, 'show']);
        Route::match(['put', 'post'], '/users/{user}', [UserController::class, 'update']);
        Route::delete('/users/{user}', [UserController::class, 'destroy']);
        Route::put('/users/{user}/permissions', [UserController::class, 'updatePermissions']);
        Route::put('/users/{user}/access-scope', [UserController::class, 'updateAccessScope']);
        Route::patch('/users/{user}/toggle-active', [UserController::class, 'toggleActive']);
    });
});
