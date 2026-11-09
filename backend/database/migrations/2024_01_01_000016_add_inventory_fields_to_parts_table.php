<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  v2.0.0 — تسک ۴: سیستم انبارداری و کنترل موجودی «دستگاه‌ها»
 *
 *  parts.stock_quantity      → موجودی کل انبار از این دستگاه
 *  parts.min_stock_quantity  → حد هشدار کمبود موجودی (اختیاری، پیش‌فرض صفر)
 *
 *  ⚠️ نکته مهم برای ارتقا: موجودی دستگاه‌های قبلی صفر ثبت می‌شود، زیرا سامانه
 *     پیش از این نسخه هیچ اطلاعاتی از انبار واقعی نداشته است. بعد از ارتقا باید
 *     «ورود کالا» برای هر دستگاه ثبت شود. هیچ عددی به‌صورت ساختگی ساخته نمی‌شود
 *     تا آمار انبار غیرواقعی نشود.
 * ─────────────────────────────────────────────────────────────────────────────
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('parts')) {
            return;
        }

        Schema::table('parts', function (Blueprint $table) {
            if (!Schema::hasColumn('parts', 'stock_quantity')) {
                $table->integer('stock_quantity')->default(0)->after('periodic_service_months');
            }
            if (!Schema::hasColumn('parts', 'min_stock_quantity')) {
                $table->integer('min_stock_quantity')->default(0)->after('stock_quantity');
            }
            if (!Schema::hasColumn('parts', 'unit_label')) {
                $table->string('unit_label', 30)->default('عدد')->after('min_stock_quantity');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('parts')) {
            return;
        }

        Schema::table('parts', function (Blueprint $table) {
            foreach (['stock_quantity', 'min_stock_quantity', 'unit_label'] as $column) {
                if (Schema::hasColumn('parts', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
