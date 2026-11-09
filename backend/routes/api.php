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

        // Dashboard statistics (scoped to the authenticated user's customer access)
        Route::get('/dashboard/stats', [DashboardController::class, 'stats']);

        // Customers
        Route::get('/customers/export', [CustomerController::class, 'export']);
        Route::post('/customers/import', [CustomerController::class, 'import']);
        Route::apiResource('customers', CustomerController::class);

        // Catalog of devices (parts) & Assignments
        Route::apiResource('parts', PartController::class);
        Route::post('/customers/{customer}/parts', [PartController::class, 'assign']);
        Route::put('/customer-parts/{customerPart}', [PartController::class, 'updateAssignment']);
        Route::delete('/customer-parts/{customerPart}', [PartController::class, 'destroyAssignment']);
        Route::post('/customer-parts/{customerPart}/history', [PartController::class, 'addServiceHistory']);
        Route::delete('/customer-parts/{customerPart}/history/{history}', [PartController::class, 'destroyServiceHistory']);

        // Inventory (stock control + audit log)
        Route::get('/inventory/summary', [InventoryController::class, 'summary']);
        Route::get('/inventory/logs', [InventoryController::class, 'logs']);
        Route::get('/inventory/parts', [InventoryController::class, 'parts']);
        Route::get('/inventory/customers', [InventoryController::class, 'customers']);
        Route::post('/inventory/movements', [InventoryController::class, 'store']);

        // SMS (Melipayamak)
        Route::post('/sms/send-pattern', [SmsController::class, 'sendPattern']);
        Route::get('/sms/logs', [SmsController::class, 'logs']);

        // System Settings
        Route::get('/settings/sms', [SettingController::class, 'getSmsSettings']);
        Route::put('/settings/sms', [SettingController::class, 'updateSmsSettings']);
        Route::post('/settings/company', [SettingController::class, 'updateCompanySettings']);

        // Users & Pure ACL Permissions
        Route::get('/permissions', [UserController::class, 'availablePermissions']);
        Route::get('/users/staff-options', [UserController::class, 'staffOptions']);
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::get('/users/{user}', [UserController::class, 'show']);
        Route::match(['put', 'post'], '/users/{user}', [UserController::class, 'update']);
        Route::delete('/users/{user}', [UserController::class, 'destroy']);
        Route::put('/users/{user}/permissions', [UserController::class, 'updatePermissions']);
        Route::get('/users/{user}/customer-access', [UserController::class, 'showCustomerAccess']);
        Route::put('/users/{user}/customer-access', [UserController::class, 'updateCustomerAccess']);
        Route::patch('/users/{user}/toggle-active', [UserController::class, 'toggleActive']);
    });
});
