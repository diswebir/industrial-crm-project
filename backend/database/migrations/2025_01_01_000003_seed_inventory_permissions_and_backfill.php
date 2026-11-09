<?php

use App\Models\Part;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

/**
 * v2.0.0 — مجوزهای جدید + همگام‌سازی مدیران + موجودی اولیه انبار
 *
 *  - چهار مجوز جدید برای ویرایش/حذف تخصیص و مدیریت انبار ساخته می‌شود.
 *  - همه کاربران administrator مجوزهای جدید را می‌گیرند تا بعد از آپدیت قطع نشوند.
 *  - موجودی اولیه هر دستگاه برابر مجموع تعدادهای تخصیص‌یافته فعلی تنظیم می‌شود تا
 *    موجودی منفی کاذب ایجاد نشود و یک ردیف لاگ «موجودی اولیه» ثبت می‌گردد.
 */
return new class extends Migration
{
    public const NEW_PERMISSIONS = [
        'parts.assign.edit',
        'parts.assign.delete',
        'inventory.view',
        'inventory.manage',
    ];

    public function up(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (self::NEW_PERMISSIONS as $permissionName) {
            Permission::firstOrCreate(['name' => $permissionName, 'guard_name' => 'web']);
        }

        // مدیران ارشد باید بدون قطعی سرویس مجوزهای جدید را داشته باشند.
        if (Schema::hasTable('users') && Schema::hasTable('permissions')) {
            User::query()
                ->where('user_type', 'administrator')
                ->get()
                ->each(function (User $admin) {
                    $admin->givePermissionTo(self::NEW_PERMISSIONS);
                });
        }

        // موجودی اولیه انبار بر اساس تخصیص‌های فعلی (فقط روی داده واقعی، بدون حذف چیزی).
        if (
            Schema::hasTable('parts')
            && Schema::hasTable('customer_parts')
            && Schema::hasColumn('parts', 'stock_quantity')
            && Schema::hasColumn('customer_parts', 'quantity')
            && Schema::hasTable('inventory_logs')
        ) {
            Part::query()->orderBy('id')->each(function (Part $part) {
                $allocated = (int) DB::table('customer_parts')
                    ->where('part_id', $part->id)
                    ->sum('quantity');

                if ($allocated <= 0) {
                    return;
                }

                // فقط اگر موجودی هنوز ثبت نشده باشد (اجرای دوباره، داده را بازنویسی نمی‌کند).
                if ((int) $part->stock_quantity > 0) {
                    return;
                }

                // اگر قبلاً هر تراکنشی برای این دستگاه ثبت شده باشد، موجودی واقعی است و
                // بازنویسی نمی‌شود (اجرای دوباره مایگریشن هرگز داده انبار را عوض نمی‌کند).
                $hasAnyLog = DB::table('inventory_logs')
                    ->where('part_id', $part->id)
                    ->exists();

                if ($hasAnyLog) {
                    return;
                }

                DB::table('parts')->where('id', $part->id)->update([
                    'stock_quantity' => $allocated,
                ]);

                DB::table('inventory_logs')->insert([
                    'part_id' => $part->id,
                    'user_id' => null,
                    'customer_id' => null,
                    'customer_part_id' => null,
                    'type' => 'in',
                    'quantity' => $allocated,
                    'stock_after' => $allocated,
                    'note' => 'موجودی اولیه در زمان ارتقا به نسخه ۲',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            });
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Permission::whereIn('name', self::NEW_PERMISSIONS)
            ->where('guard_name', 'web')
            ->delete();

        DB::table('inventory_logs')
            ->where('note', 'موجودی اولیه در زمان ارتقا به نسخه ۲')
            ->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
