<?php

use Illuminate\Database\Migrations\Migration;
use App\Models\User;
use Spatie\Permission\Models\Permission;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public const PERMISSIONS = [
        'customers.view',
        'customers.create',
        'customers.edit',
        'customers.delete',
        'customers.import',
        'customers.export',
        'parts.view',
        'parts.manage',
        'parts.assign',
        'parts.history',
        'inventory.manage',
        'inventory.logs',
        'sms.send',
        'sms.logs',
        'users.manage',
        'settings.manage',
    ];

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Reset cached roles and permissions
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        // 1. Create all direct ACL permissions
        foreach (self::PERMISSIONS as $permissionName) {
            Permission::firstOrCreate(['name' => $permissionName, 'guard_name' => 'web']);
        }

        // 2. Create default system Administrator
        // Note: the user_type column is added by a later migration (2024_01_01_000013),
        // so it is only set here when it already exists (e.g. incremental upgrades).
        $adminData = [
            'name' => 'مدیر ارشد سامانه',
            'phone' => '09120000000',
            'password' => Hash::make(env('CPANEL_INSTALL_PENDING') ? bin2hex(random_bytes(32)) : 'Admin@123456'),
            'email_verified_at' => now(),
            'is_active' => true,
        ];
        if (Schema::hasColumn('users', 'user_type')) {
            $adminData['user_type'] = 'administrator';
        }
        $admin = User::firstOrCreate(['email' => 'admin@crm.local'], $adminData);

        // 3. Assign all permissions directly to the administrator (Pure ACL - NO ROLES)
        $permissions = Permission::where('guard_name', 'web')->get();
        $admin->syncPermissions($permissions);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        User::where('email', 'admin@crm.local')->delete();
        Permission::whereIn('name', self::PERMISSIONS)->delete();
    }
};
