<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  v2.0.0 — تسک ۱: نقش‌ها و سطح دسترسی پیشرفته کارمندان (RBAC & Granular ACL)
 *
 *  ۱) users.customers_scope  →  دامنه دید کاربر نسبت به مشتریان:
 *        'all'  = مشاهده و ویرایش تمام مشتریان سامانه
 *        'own'  = فقط مشتریان خودش + استثناهای اعطاشده توسط مدیر
 *     مقدار پیش‌فرض عمداً 'all' است تا کاربران فعلی پروداکشن بعد از ارتقا
 *     قفل نشوند (Zero Data Loss / Zero Access Loss).
 *
 *  ۲) جدول user_staff_access     → دسترسی به مشتریانِ یک یا چند کارمند خاص
 *  ۳) جدول user_customer_access  → دسترسی به یک یا چند مشتری خاص (تکی)
 *
 *  نقش سازمانی در همان ستون موجود user_type نگهداری می‌شود و دو مقدار جدید
 *  'salesperson' (کارمند فروش) و 'installer' (نصاب) به آن اضافه می‌گردد؛
 *  چون نوع ستون VARCHAR است، هیچ تغییر schema برای نقش‌ها لازم نیست.
 * ─────────────────────────────────────────────────────────────────────────────
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('users') && !Schema::hasColumn('users', 'customers_scope')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('customers_scope', 20)->default('all')->after('user_type')->index();
            });
        }

        // اطمینان از وجود ستون user_type در نصب‌های خیلی قدیمی
        if (Schema::hasTable('users') && !Schema::hasColumn('users', 'user_type')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('user_type')->default('manager')->after('is_active');
            });
        }

        if (!Schema::hasTable('user_staff_access')) {
            Schema::create('user_staff_access', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id');
                $table->unsignedBigInteger('staff_id');
                $table->timestamps();

                $table->unique(['user_id', 'staff_id'], 'user_staff_access_unique');
                $table->index('staff_id', 'user_staff_access_staff_id_index');

                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('staff_id')->references('id')->on('users')->cascadeOnDelete();
            });
        }

        if (!Schema::hasTable('user_customer_access')) {
            Schema::create('user_customer_access', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id');
                $table->unsignedBigInteger('customer_id');
                $table->timestamps();

                $table->unique(['user_id', 'customer_id'], 'user_customer_access_unique');
                $table->index('customer_id', 'user_customer_access_customer_id_index');

                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();

                if (Schema::hasTable('customers')) {
                    $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
                }
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('user_customer_access');
        Schema::dropIfExists('user_staff_access');

        if (Schema::hasTable('users') && Schema::hasColumn('users', 'customers_scope')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('customers_scope');
            });
        }
    }
};
