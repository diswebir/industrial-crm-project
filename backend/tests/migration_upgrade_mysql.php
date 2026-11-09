<?php

declare(strict_types=1);

// CI-only upgrade simulation. It refuses any nonempty or non-test database.
require dirname(__DIR__) . '/vendor/autoload.php';
$app = require dirname(__DIR__) . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$name = DB::connection()->getDatabaseName();
if (!$app->environment('testing') || DB::connection()->getDriverName() !== 'mysql' || !str_ends_with($name, '_test') || Schema::hasTable('migrations')) {
    throw new RuntimeException('Requires a new, empty, disposable MySQL database ending in _test and APP_ENV=testing.');
}
if (DB::select('SHOW TABLES') !== []) {
    throw new RuntimeException('Refusing to run against a nonempty database.');
}

function migratePath(string $file): void
{
    $status = Artisan::call('migrate', ['--force' => true, '--path' => 'database/migrations/' . $file]);
    if ($status !== 0) throw new RuntimeException(Artisan::output());
}
function verify(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
    echo "PASS: {$message}\n";
}

$upgrade = '2026_11_09_000001_add_customer_access_and_inventory.php';
$files = glob(database_path('migrations/*.php'));
sort($files);
foreach ($files as $file) {
    if (basename($file) !== $upgrade) migratePath(basename($file));
}
$userId = DB::table('users')->where('email', 'admin@crm.local')->value('id');
$customerId = DB::table('customers')->insertGetId([
    'customer_type' => 'effective', 'type' => 'individual', 'first_name' => 'نام قدیمی',
    'last_name' => 'خانوادگی', 'mobile' => '09123456789', 'created_at' => now(), 'updated_at' => now(),
]);
DB::table('customer_histories')->insert(['customer_id' => $customerId, 'user_id' => $userId, 'action' => 'created', 'description' => 'ثبت اولیه', 'created_at' => now(), 'updated_at' => now()]);
$partId = DB::table('parts')->insertGetId(['name' => 'دستگاه قدیمی', 'code' => 'OLD001', 'periodic_service_months' => 12, 'is_active' => 1, 'created_at' => now(), 'updated_at' => now()]);
$assignmentId = DB::table('customer_parts')->insertGetId(['customer_id' => $customerId, 'part_id' => $partId, 'serial_number' => 'OLD0001', 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);

migratePath($upgrade);
migratePath($upgrade);
$customer = DB::table('customers')->where('id', $customerId)->first();
$assignment = DB::table('customer_parts')->where('id', $assignmentId)->first();
verify($customer && $customer->first_name === 'نام قدیمی' && $customer->mobile === '09123456789', 'legacy customer data preserved');
verify((int) $customer->created_by_user_id === (int) $userId, 'recorded creator recovered');
verify($assignment && $assignment->serial_number === 'OLD0001' && (int) $assignment->quantity === 1, 'legacy allocation preserved with quantity one');
verify((int) DB::table('parts')->where('id', $partId)->value('stock_quantity') === 0, 'opening stock is zero, not guessed');
DB::table('customers')->insert(['customer_type' => 'potential', 'type' => 'company', 'company_name' => 'شرکت', 'first_name' => null, 'last_name' => null, 'mobile' => null, 'created_at' => now(), 'updated_at' => now()]);
verify(true, 'company-only customer is allowed after upgrade');
