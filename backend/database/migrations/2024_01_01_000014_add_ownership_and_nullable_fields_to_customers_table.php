<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  v2.0.0 — تسک ۱ (RBAC) و تسک ۵ (اعتبارسنجی حقیقی/حقوقی)
 *
 *  ۱) افزودن ستون مالکیت مشتری (created_by_user_id) تا مشخص شود هر مشتری را
 *     کدام کارمند ثبت کرده است (پایه «کارمند فروش فقط مشتریان خودش را می‌بیند»).
 *  ۲) اختیاری (NULL) کردن first_name / last_name / mobile تا ثبت مشتری حقوقی
 *     فقط با «نام شرکت» و بدون شماره همراه ممکن شود.
 *
 *  ⚠️ این مایگریشن کاملاً افزودنی و Idempotent است: هیچ ستونی حذف نمی‌شود و
 *     هیچ داده‌ای بازنویسی نمی‌شود. تبدیل NOT NULL به NULL همیشه امن است.
 * ─────────────────────────────────────────────────────────────────────────────
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('customers')) {
            return;
        }

        // ۱) ستون مالکیت مشتری
        if (!Schema::hasColumn('customers', 'created_by_user_id')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->unsignedBigInteger('created_by_user_id')->nullable()->after('notes')->index();
            });

            if (Schema::hasTable('users')) {
                Schema::table('customers', function (Blueprint $table) {
                    $table->foreign('created_by_user_id', 'customers_created_by_user_id_foreign')
                        ->references('id')->on('users')->nullOnDelete();
                });
            }
        }

        // ۲) اختیاری کردن فیلدهای هویتی/تماس (برای شخصیت حقوقی)
        $nullableColumns = ['first_name', 'last_name', 'mobile'];
        $changeable = [];
        foreach ($nullableColumns as $column) {
            if (Schema::hasColumn('customers', $column)) {
                $changeable[] = $column;
            }
        }

        if (!empty($changeable)) {
            Schema::table('customers', function (Blueprint $table) use ($changeable) {
                foreach ($changeable as $column) {
                    $table->string($column)->nullable()->change();
                }
            });
        }

        // ۳) اطمینان از وجود ستون نام شرکت (در نصب‌های خیلی قدیمی)
        if (!Schema::hasColumn('customers', 'company_name')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->string('company_name')->nullable()->after('last_name');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('customers')) {
            return;
        }

        if (Schema::hasColumn('customers', 'created_by_user_id')) {
            // حذف کلید خارجی فقط در صورت وجود؛ در غیر این صورت خطا نادیده گرفته می‌شود.
            try {
                Schema::table('customers', function (Blueprint $table) {
                    $table->dropForeign('customers_created_by_user_id_foreign');
                });
            } catch (\Throwable $e) {
                // کلید خارجی وجود نداشته است
            }

            Schema::table('customers', function (Blueprint $table) {
                $table->dropColumn('created_by_user_id');
            });
        }
    }
};
