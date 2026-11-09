<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  v2.0.0 — تسک ۴: جدول تاریخچه کامل ورود/خروج انبار (Inventory Audit Log)
 *
 *  نوع عملیات (type):
 *    in          → ورود کالا به انبار
 *    out         → خروج جهت تخصیص به مشتری
 *    return      → برگشت به انبار (حذف تخصیص یا کاهش تعداد)
 *    adjustment  → اصلاح دستی موجودی توسط مدیر انبار
 *
 *  quantity همیشه عدد مثبت است و جهت حرکت از روی type تعیین می‌شود.
 *  stock_before / stock_after برای حسابرسی دقیق موجودی در لحظه عملیات ثبت می‌شود.
 * ─────────────────────────────────────────────────────────────────────────────
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('inventory_logs')) {
            return;
        }

        Schema::create('inventory_logs', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('part_id');
            $table->unsignedBigInteger('customer_id')->nullable()->index();
            $table->unsignedBigInteger('customer_part_id')->nullable()->index();
            $table->unsignedBigInteger('user_id')->nullable()->index();

            $table->string('type', 20)->index();          // in | out | return | adjustment
            $table->unsignedInteger('quantity')->default(1);
            $table->integer('stock_before')->default(0);
            $table->integer('stock_after')->default(0);

            $table->string('reference', 100)->nullable();  // شماره فاکتور / سریال مرتبط
            $table->text('notes')->nullable();

            $table->timestamps();
            $table->timestamp('logged_at')->nullable()->index();

            if (Schema::hasTable('parts')) {
                $table->foreign('part_id')->references('id')->on('parts')->cascadeOnDelete();
            }
            if (Schema::hasTable('customers')) {
                $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            }
            if (Schema::hasTable('customer_parts')) {
                $table->foreign('customer_part_id')->references('id')->on('customer_parts')->nullOnDelete();
            }
            if (Schema::hasTable('users')) {
                $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_logs');
    }
};
