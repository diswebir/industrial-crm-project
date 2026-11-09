<?php
// Run ONLY against a disposable database via smoke-package.sh.
declare(strict_types=1);
use App\Models\Customer;
use App\Models\InventoryLog;
use App\Models\Part;
use App\Models\User;
use App\Services\Customers\CustomerService;
use App\Services\Inventory\InventoryService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

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
    $code = Artisan::call('migrate', ['--force' => true]);
    echo Artisan::output();
    check($code === 0, "Migration run $attempt succeeds");
}
$admin = User::where('email', 'admin@crm.local')->firstOrFail();
check($admin->isAdministrator(), 'Migrated administrator has administrator type');
check(!Hash::check('Admin@123456', $admin->password), 'Installer migration does not expose the demo password');
check($admin->getAllPermissions()->count() === 16, 'Administrator has all 16 direct permissions (14 legacy + 2 inventory)');
check(Artisan::call('route:list', ['--except-vendor' => true]) === 0, 'Packaged application routes load');
check(Storage::disk('public')->put('smoke.txt', 'upload test'), 'Public disk accepts an upload');
check(is_file($public.'/storage/smoke.txt'), 'Upload lands in external document root');
Storage::disk('public')->delete('smoke.txt');

/* ─── v2.0.0 schema must exist after an in-place upgrade ─── */
$schemaChecks = [
    ['customers', 'created_by_user_id'],
    ['users', 'customers_scope'],
    ['parts', 'stock_quantity'],
    ['parts', 'min_stock_quantity'],
    ['customer_parts', 'quantity'],
    ['customer_parts', 'invoice_number'],
    ['customer_parts', 'invoice_amount'],
    ['customer_parts', 'assigned_by_user_id'],
];
foreach ($schemaChecks as [$table, $column]) {
    check(Schema::hasColumn($table, $column), "Column {$table}.{$column} exists");
}
foreach (['inventory_logs', 'user_staff_access', 'user_customer_access'] as $table) {
    check(Schema::hasTable($table), "Table {$table} exists");
}

/* ─── v2.0.0 functional checks: inventory, assignment edit/delete, RBAC scope ─── */
$inventory = app(InventoryService::class);
$customers = app(CustomerService::class);
$stamp = (string) time();

$part = Part::create([
    'name' => 'دستگاه آزمون دود',
    'code' => 'SMOKE'.$stamp,
    'periodic_service_months' => 12,
    'is_active' => true,
    'stock_quantity' => 0,
    'min_stock_quantity' => 1,
    'unit_label' => 'عدد',
]);

$inventory->receive(part: $part, quantity: 5, userId: $admin->id, notes: 'ورود اولیه آزمون');
check((int) $part->fresh()->stock_quantity === 5, 'Stock receipt increases device stock to 5');
check(InventoryLog::where('part_id', $part->id)->where('type', 'in')->count() === 1, 'Stock receipt writes one inventory log');

$customer = Customer::create([
    'customer_type' => 'potential',
    'type' => 'company',
    'first_name' => null,
    'last_name' => null,
    'company_name' => 'شرکت آزمون '.$stamp,
    'mobile' => null,
    'created_by_user_id' => $admin->id,
]);
check($customer->fresh()->full_name !== '', 'Company customer without personal name still has a display name');

$assignment = $customers->assignPart($customer->fresh(), $part->fresh(), [
    'serial_number' => 'SMK'.$stamp,
    'quantity' => 2,
    'invoice_number' => 'INV-'.$stamp,
    'invoice_amount' => 1500000,
], $admin->id);

check((int) $part->fresh()->stock_quantity === 3, 'Assigning 2 devices reduces stock from 5 to 3');
check((int) $assignment->quantity === 2, 'Assignment stores the requested quantity');
check((string) $assignment->invoice_number === 'INV-'.$stamp, 'Assignment stores the optional invoice number');
check((float) $assignment->invoice_amount === 1500000.0, 'Assignment stores the invoice amount');
check((int) $assignment->assigned_by_user_id === (int) $admin->id, 'Assignment records the staff member who assigned it');
check(InventoryLog::where('part_id', $part->id)->where('type', 'out')->count() === 1, 'Assignment writes one outbound inventory log');
check($customer->fresh()->customer_type === 'effective', 'Potential customer becomes effective after assignment');

$updated = $customers->updateAssignment($assignment->fresh(), ['quantity' => 1], $admin->id);
check((int) $part->fresh()->stock_quantity === 4, 'Reducing assignment quantity returns one device to stock');
check(InventoryLog::where('part_id', $part->id)->where('type', 'return')->count() === 1, 'Quantity reduction writes a return log');

$customers->deleteAssignment($updated->fresh(), $admin->id);
check((int) $part->fresh()->stock_quantity === 5, 'Deleting the assignment returns all devices to stock');
check(Customer::find($customer->id)->customerParts()->count() === 0, 'Assignment row is removed from the customer profile');

$rejected = false;
try {
    $customers->assignPart($customer->fresh(), $part->fresh(), ['serial_number' => 'SMKX'.$stamp, 'quantity' => 99], $admin->id);
} catch (ValidationException $e) {
    $rejected = true;
}
check($rejected, 'Assigning more devices than available stock is rejected');
check((int) $part->fresh()->stock_quantity === 5, 'Rejected assignment leaves the stock untouched');

$sales = User::firstOrCreate(
    ['email' => 'smoke-sales-'.$stamp.'@crm.local'],
    ['name' => 'کارمند فروش آزمون', 'password' => Hash::make('Smoke@123456'), 'is_active' => true]
);
$sales->user_type = User::ROLE_SALESPERSON;
$sales->customers_scope = User::SCOPE_OWN;
$sales->save();
$sales->flushAccessCache();

check(Customer::query()->visibleTo($sales)->whereKey($customer->id)->doesntExist(), 'Salesperson cannot see customers registered by another user');
check($sales->canAccessCustomer($customer) === false, 'canAccessCustomer denies other staff customers');

$sales->accessibleStaff()->sync([$admin->id]);
$sales->flushAccessCache();
check(Customer::query()->visibleTo($sales)->whereKey($customer->id)->exists(), 'Granting staff access exposes that staff member customers');
check($sales->canAccessCustomer($customer) === true, 'canAccessCustomer allows granted staff customers');

$sales->accessibleStaff()->detach();
$sales->accessibleCustomers()->sync([$customer->id]);
$sales->flushAccessCache();
check(Customer::query()->visibleTo($sales)->whereKey($customer->id)->exists(), 'Granting a single customer exposes exactly that customer');

$sales->accessibleCustomers()->detach();
$sales->customers_scope = User::SCOPE_ALL;
$sales->save();
$sales->flushAccessCache();
check(Customer::query()->visibleTo($sales)->whereKey($customer->id)->exists(), 'Scope "all" exposes every customer');

$customers->deleteCustomer($customer->fresh(), $admin->id);
check(Customer::find($customer->id) === null, 'Customer deletion removes the record');
check((int) $part->fresh()->stock_quantity === 5, 'Customer deletion keeps stock consistent');

$part->fresh()->delete();
$sales->delete();

echo "Packaged Laravel smoke test passed.\n";
