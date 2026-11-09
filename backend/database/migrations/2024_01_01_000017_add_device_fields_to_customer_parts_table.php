<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  v2.0.0 — تسک ۳: مدیریت کامل دستگاه‌های تخصیص‌یافته به مشتری
 *
 *  customer_parts.quantity            → تعداد دستگاه در این تخصیص (پیش‌فرض ۱)
 *  customer_parts.invoice_amount      → مبلغ فاکتور (ورودی دستی، اختیاری)
 *  customer_parts.invoice_number      → شماره فاکتور (دستی و اختیاری/Nullable)
 *  customer_parts.assigned_by_user_id → کارمندی که تخصیص را ثبت کرده (برای لاگ انبار)
 *
 *  رکوردهای موجود دست‌نخورده می‌مانند و فقط مقدار پیش‌فرض امن می‌گیرند:
 *  quantity = 1 (چون پیش از این هر ردیف دقیقاً یک دستگاه فیزیکی بود).
 * ─────────────────────────────────────────────────────────────────────────────
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('customer_parts')) {
            return;
        }

        $createdAssignedBy = false;

        Schema::table('customer_parts', function (Blueprint $table) use (&$createdAssignedBy) {
            if (!Schema::hasColumn('customer_parts', 'quantity')) {
                $table->unsignedInteger('quantity')->default(1)->after('serial_number');
            }
            if (!Schema::hasColumn('customer_parts', 'invoice_number')) {
                $table->string('invoice_number', 50)->nullable()->after('quantity')->index();
            }
            if (!Schema::hasColumn('customer_parts', 'invoice_amount')) {
                $table->decimal('invoice_amount', 14, 2)->nullable()->after('invoice_number');
            }
            if (!Schema::hasColumn('customer_parts', 'assigned_by_user_id')) {
                $table->unsignedBigInteger('assigned_by_user_id')->nullable()->after('notes')->index();
                $createdAssignedBy = true;
            }
        });

        // کلید خارجی فقط وقتی ساخته می‌شود که ستون در همین اجرا ایجاد شده باشد؛
        // در غیر این صورت اجرای مجدد مایگریشن باعث خطای «کلید خارجی تکراری» می‌شد.
        if ($createdAssignedBy && Schema::hasTable('users')) {
            Schema::table('customer_parts', function (Blueprint $table) {
                $table->foreign('assigned_by_user_id', 'customer_parts_assigned_by_user_id_foreign')
                    ->references('id')->on('users')->nullOnDelete();
            });
        }

        // اطمینان از اینکه هیچ رکورد قدیمی با quantity = 0 یا NULL باقی نمانده باشد.
        DB::table('customer_parts')
            ->whereNull('quantity')
            ->orWhere('quantity', '<', 1)
            ->update(['quantity' => 1]);
    }

    public function down(): void
    {
        if (!Schema::hasTable('customer_parts')) {
            return;
        }

        // ابتدا کلید خارجی (در صورت وجود) و سپس ستون‌های افزوده‌شده حذف می‌شوند.
        // این متد فقط برای محیط توسعه است و هرگز روی پایگاه داده پروداکشن اجرا نمی‌شود.
        try {
            Schema::table('customer_parts', function (Blueprint $table) {
                $table->dropForeign('customer_parts_assigned_by_user_id_foreign');
            });
        } catch (\Throwable $e) {
            // کلید خارجی وجود نداشته است — نادیده گرفته می‌شود
        }

        Schema::table('customer_parts', function (Blueprint $table) {
            foreach (['quantity', 'invoice_number', 'invoice_amount', 'assigned_by_user_id'] as $column) {
                if (Schema::hasColumn('customer_parts', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
