<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  v2.0.0 — تسک ۱ و ۴: افزودن مجوزهای جدید ACL و اعطای آن‌ها بدون شکستن دسترسی‌های فعلی
 *
 *  مجوزهای جدید:
 *    inventory.manage → مدیریت موجودی انبار (ثبت ورود/خروج/اصلاح)
 *    inventory.logs   → مشاهده تاریخچه ورود و خروج انبار
 *
 *  ⚠️ نام مجوزهای قبلی (parts.*) عمداً تغییر نمی‌کند تا رکوردهای موجود در
 *     جدول model_has_permissions بی‌اثر نشوند؛ فقط برچسب نمایشی آن‌ها در
 *     UserController به «دستگاه» تغییر یافته است.
 *
 *  سیاست اعطای خودکار (برای اینکه بعد از ارتقا هیچ کاربری قفل نشود):
 *    - هر کاربری که parts.manage دارد → inventory.manage هم می‌گیرد
 *    - هر کاربری که parts.view   دارد → inventory.logs   هم می‌گیرد
 *    - همه کاربران با user_type = administrator → هر دو مجوز
 * ─────────────────────────────────────────────────────────────────────────────
 */
return new class extends Migration
{
    public const NEW_PERMISSIONS = [
        'inventory.manage',
        'inventory.logs',
    ];

    public function up(): void
    {
        if (!Schema::hasTable('permissions') || !Schema::hasTable('model_has_permissions')) {
            return;
        }

        if (class_exists(\Spatie\Permission\PermissionRegistrar::class)) {
            app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
        }

        $guard = 'web';
        $now = now();

        $created = [];
        foreach (self::NEW_PERMISSIONS as $name) {
            $row = DB::table('permissions')->where('name', $name)->where('guard_name', $guard)->first();
            if (!$row) {
                $id = DB::table('permissions')->insertGetId([
                    'name' => $name,
                    'guard_name' => $guard,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            } else {
                $id = $row->id;
            }
            $created[$name] = $id;
        }

        // نگاشت مجوز جدید ← مجوز مبنای اعطای خودکار
        $grants = [
            'inventory.manage' => 'parts.manage',
            'inventory.logs' => 'parts.view',
        ];

        foreach ($grants as $newName => $sourceName) {
            $source = DB::table('permissions')->where('name', $sourceName)->where('guard_name', $guard)->first();
            $targetId = $created[$newName];

            $modelIds = [];
            if ($source) {
                $modelIds = DB::table('model_has_permissions')
                    ->where('permission_id', $source->id)
                    ->where('model_type', User::class)
                    ->pluck('model_id')
                    ->all();
            }

            if (Schema::hasTable('users') && Schema::hasColumn('users', 'user_type')) {
                $adminIds = DB::table('users')->where('user_type', 'administrator')->pluck('id')->all();
                $modelIds = array_merge($modelIds, $adminIds);
            }

            foreach (array_unique($modelIds) as $modelId) {
                $exists = DB::table('model_has_permissions')
                    ->where('permission_id', $targetId)
                    ->where('model_type', User::class)
                    ->where('model_id', $modelId)
                    ->exists();

                if (!$exists) {
                    DB::table('model_has_permissions')->insert([
                        'permission_id' => $targetId,
                        'model_type' => User::class,
                        'model_id' => $modelId,
                    ]);
                }
            }
        }

        if (class_exists(\Spatie\Permission\PermissionRegistrar::class)) {
            app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('permissions')) {
            return;
        }

        $ids = DB::table('permissions')->whereIn('name', self::NEW_PERMISSIONS)->pluck('id')->all();

        if (!empty($ids) && Schema::hasTable('model_has_permissions')) {
            DB::table('model_has_permissions')->whereIn('permission_id', $ids)->delete();
        }
        if (!empty($ids) && Schema::hasTable('role_has_permissions')) {
            DB::table('role_has_permissions')->whereIn('permission_id', $ids)->delete();
        }

        DB::table('permissions')->whereIn('id', $ids)->delete();

        if (class_exists(\Spatie\Permission\PermissionRegistrar::class)) {
            app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
        }
    }
};
