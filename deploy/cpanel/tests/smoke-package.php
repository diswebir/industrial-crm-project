<?php
// Run ONLY against a disposable database via smoke-package.sh.
declare(strict_types=1);
[$script, $private, $public] = $argv;
require $private.'/vendor/autoload.php';
$app = require $private.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo "PASS: $message\n";
}

check($app->publicPath() === $public, 'Separate public_path resolves before config load');
check(config('filesystems.disks.public.root') === $public.'/storage', 'Upload disk points to the external public directory');
foreach ([1, 2] as $attempt) {
    $code = Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
    echo Illuminate\Support\Facades\Artisan::output();
    check($code === 0, "Migration run $attempt succeeds");
}
$admin = App\Models\User::where('email', 'admin@crm.local')->firstOrFail();
check($admin->isAdministrator(), 'Migrated administrator has administrator type');
check(!Illuminate\Support\Facades\Hash::check('Admin@123456', $admin->password), 'Installer migration does not expose the demo password');
$expectedPermissions = Spatie\Permission\Models\Permission::where('guard_name', 'web')->count();
check($expectedPermissions >= 18, 'All v2 permissions are seeded');
check($admin->getAllPermissions()->count() === $expectedPermissions, 'Administrator has every seeded permission');
check(Illuminate\Support\Facades\Artisan::call('route:list', ['--except-vendor' => true]) === 0, 'Packaged application routes load');
check(Illuminate\Support\Facades\Storage::disk('public')->put('smoke.txt', 'upload test'), 'Public disk accepts an upload');
check(is_file($public.'/storage/smoke.txt'), 'Upload lands in external document root');
Illuminate\Support\Facades\Storage::disk('public')->delete('smoke.txt');
echo "Packaged Laravel smoke test passed.\n";
