<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * v2.0.0 — تعداد/فاکتور دستگاه‌های تخصیص‌یافته، موجودی انبار و لاگ تراکنش‌ها
 *
 * همه تغییرات افزایشی هستند؛ تنها دو ستون «nullable» می‌شوند که داده موجود را تغییر نمی‌دهد:
 *  - customers.first_name / last_name / mobile  → برای پشتیبانی از مشتری حقوقی بدون نام و بدون موبایل
 *  - customer_parts.serial_number               → تخصیص چندعددی، شماره سریال تکی ندارد
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── 1) مشتریان: اختیاری شدن نام/نام‌خانوادگی و شماره همراه (تسک ۵) ──
        Schema::table('customers', function (Blueprint $table) {
            $table->string('first_name')->nullable()->change();
            $table->string('last_name')->nullable()->change();
            $table->string('mobile')->nullable()->change();
        });

        // ── 2) کاتالوگ دستگاه‌ها: موجودی کل و حد هشدار (تسک ۴) ──
        if (! Schema::hasColumn('parts', 'stock_quantity')) {
            Schema::table('parts', function (Blueprint $table) {
                $table->integer('stock_quantity')->default(0)->after('is_active');
            });
        }

        if (! Schema::hasColumn('parts', 'min_stock_quantity')) {
            Schema::table('parts', function (Blueprint $table) {
                $table->integer('min_stock_quantity')->default(0)->after('stock_quantity');
            });
        }

        // ── 3) تخصیص دستگاه: تعداد، شماره و مبلغ فاکتور، ثبت‌کننده (تسک ۳) ──
        if (! Schema::hasColumn('customer_parts', 'quantity')) {
            Schema::table('customer_parts', function (Blueprint $table) {
                $table->integer('quantity')->default(1)->after('part_id');
            });
        }

        if (! Schema::hasColumn('customer_parts', 'invoice_number')) {
            Schema::table('customer_parts', function (Blueprint $table) {
                $table->string('invoice_number', 100)->nullable()->after('quantity');
            });
        }

        if (! Schema::hasColumn('customer_parts', 'invoice_amount')) {
            Schema::table('customer_parts', function (Blueprint $table) {
                $table->decimal('invoice_amount', 15, 2)->nullable()->after('invoice_number');
            });
        }

        if (! Schema::hasColumn('customer_parts', 'assigned_by_user_id')) {
            Schema::table('customer_parts', function (Blueprint $table) {
                $table->unsignedBigInteger('assigned_by_user_id')->nullable()->after('status');
                $table->index('assigned_by_user_id', 'cp_assigned_by_index');
            });
        }

        // شماره سریال اختیاری می‌شود اما یکتایی خود را حفظ می‌کند (در MySQL چند NULL مجاز است).
        Schema::table('customer_parts', function (Blueprint $table) {
            $table->string('serial_number')->nullable()->change();
        });

        // ── 4) جدول جدید لاگ انبار (تسک ۴) ──
        if (! Schema::hasTable('inventory_logs')) {
            Schema::create('inventory_logs', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('part_id');
                $table->unsignedBigInteger('user_id')->nullable();
                $table->unsignedBigInteger('customer_id')->nullable();
                $table->unsignedBigInteger('customer_part_id')->nullable();
                // in = ورود به انبار | out = خروج جهت تخصیص | return = برگشت به انبار | adjust = اصلاح موجودی
                $table->string('type', 20)->default('in');
                $table->integer('quantity')->default(0);
                $table->integer('stock_after')->default(0);
                $table->text('note')->nullable();
                $table->timestamps();

                $table->index('part_id', 'inv_log_part_index');
                $table->index('user_id', 'inv_log_user_index');
                $table->index('customer_id', 'inv_log_customer_index');
                $table->index('customer_part_id', 'inv_log_customer_part_index');
                $table->index(['type', 'created_at'], 'inv_log_type_date_index');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_logs');

        if (Schema::hasColumn('customer_parts', 'assigned_by_user_id')) {
            Schema::table('customer_parts', function (Blueprint $table) {
                $table->dropIndex('cp_assigned_by_index');
                $table->dropColumn('assigned_by_user_id');
            });
        }

        foreach (['invoice_amount', 'invoice_number', 'quantity'] as $column) {
            if (Schema::hasColumn('customer_parts', $column)) {
                Schema::table('customer_parts', function (Blueprint $table) use ($column) {
                    $table->dropColumn($column);
                });
            }
        }

        foreach (['min_stock_quantity', 'stock_quantity'] as $column) {
            if (Schema::hasColumn('parts', $column)) {
                Schema::table('parts', function (Blueprint $table) use ($column) {
                    $table->dropColumn($column);
                });
            }
        }

        // بازگردانی اجباری بودن ستون‌ها فقط در صورت خالی نبودن داده‌های قدیمی انجام می‌شود
        // تا rollback هرگز داده را از دست ندهد.
    }
};
