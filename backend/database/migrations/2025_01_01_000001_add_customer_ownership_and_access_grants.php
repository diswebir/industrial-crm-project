<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * v2.0.0 — مالکیت مشتری و دسترسی استثنا (Granular Customer Access)
 *
 * این مایگریشن کاملاً افزایشی (additive) است و روی دیتابیس تولید بدون حذف داده اجرا می‌شود:
 *  - users.data_scope          : دامنه دسترسی مشتری (all | own | custom)
 *  - customers.created_by      : کارمندی که مشتری را ثبت کرده است
 *  - customer_access_grants    : جدول جدید دسترسی‌های استثنا
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1) کاربران: دامنه دسترسی مشتری. پیش‌فرض all باعث می‌شود دسترسی کاربران فعلی تغییر نکند.
        if (! Schema::hasColumn('users', 'data_scope')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('data_scope', 20)->default('all')->after('user_type');
                $table->index('data_scope', 'users_data_scope_index');
            });
        }

        // 2) مشتریان: مالکیت پرونده. داده‌های فعلی NULL می‌مانند و برای دارندگان data_scope=all قابل مشاهده‌اند.
        if (! Schema::hasColumn('customers', 'created_by')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->unsignedBigInteger('created_by')->nullable()->after('notes');
                $table->index('created_by', 'customers_created_by_index');
            });
        }

        // 3) جدول جدید دسترسی‌های استثنا (مشتریان یک کارمند خاص یا مشتریان تکی)
        if (! Schema::hasTable('customer_access_grants')) {
            Schema::create('customer_access_grants', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id');
                // staff = مشتریان یک کارمند دیگر | customer = یک مشتری خاص
                $table->string('scope_type', 20)->default('customer');
                $table->unsignedBigInteger('target_user_id')->nullable();
                $table->unsignedBigInteger('customer_id')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();

                $table->index(['user_id', 'scope_type'], 'cag_user_scope_index');
                $table->index('target_user_id', 'cag_target_user_index');
                $table->index('customer_id', 'cag_customer_index');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_access_grants');

        if (Schema::hasColumn('customers', 'created_by')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->dropIndex('customers_created_by_index');
                $table->dropColumn('created_by');
            });
        }

        if (Schema::hasColumn('users', 'data_scope')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropIndex('users_data_scope_index');
                $table->dropColumn('data_scope');
            });
        }
    }
};
