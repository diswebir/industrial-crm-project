<?php

declare(strict_types=1);

// Run only against an explicitly configured, disposable SQLite test database.
require dirname(__DIR__) . '/vendor/autoload.php';
$app = require dirname(__DIR__) . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Exports\CustomersExport;
use App\Exports\CustomersTemplateExport;
use App\Imports\CustomersImport;
use App\Models\Customer;
use App\Models\Part;
use App\Models\User;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Imports\HeadingRowFormatter;
use Spatie\Permission\Models\Permission;

if (!$app->environment('testing') || DB::connection()->getDriverName() !== 'sqlite') {
    fwrite(STDERR, "This smoke test requires APP_ENV=testing and a disposable SQLite database.\n");
    exit(1);
}

function check(bool $condition, string $description): void
{
    if (!$condition) {
        throw new RuntimeException($description);
    }
    echo "PASS: {$description}\n";
}

function api(Kernel $kernel, string $token, string $method, string $url, ?array $payload = null): array
{
    $server = ['HTTP_ACCEPT' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer ' . $token];
    if ($payload !== null) {
        $server['CONTENT_TYPE'] = 'application/json';
    }
    $request = Request::create($url, $method, [], [], [], $server, $payload === null ? null : json_encode($payload, JSON_THROW_ON_ERROR));
    $response = $kernel->handle($request);
    return [$response->getStatusCode(), json_decode($response->getContent(), true)];
}

$failed = false;
DB::beginTransaction();
try {
    $suffix = bin2hex(random_bytes(6));
    $a = User::create(['name' => 'فروشنده الف', 'email' => "a-{$suffix}@example.invalid", 'password' => 'test-password', 'user_type' => 'salesperson', 'is_active' => true]);
    $b = User::create(['name' => 'فروشنده ب', 'email' => "b-{$suffix}@example.invalid", 'password' => 'test-password', 'user_type' => 'salesperson', 'is_active' => true]);
    foreach (['customers.view', 'customers.create', 'customers.edit', 'customers.export', 'parts.view', 'parts.manage', 'parts.assign', 'sms.send'] as $permission) {
        Permission::findOrCreate($permission, 'web');
        $a->givePermissionTo($permission);
    }
    $mine = Customer::create(['customer_type' => 'potential', 'type' => 'company', 'company_name' => 'شرکت الف', 'created_by_user_id' => $a->id]);
    $theirs = Customer::create(['customer_type' => 'potential', 'type' => 'company', 'company_name' => 'شرکت ب', 'created_by_user_id' => $b->id]);
    $part = Part::create(['name' => 'دستگاه آزمایشی', 'code' => 'X' . $suffix, 'periodic_service_months' => 12, 'is_active' => true]);
    $token = $a->createToken('smoke')->plainTextToken;
    $kernel = $app->make(Kernel::class);

    [$status] = api($kernel, $token, 'GET', '/api/v1/customers/' . $theirs->id);
    check($status === 404, 'A cannot view B customer by URL');
    [$status] = api($kernel, $token, 'PUT', '/api/v1/customers/' . $theirs->id, ['company_name' => 'غیرمجاز']);
    check($status === 404, 'A cannot edit B customer');
    [$status] = api($kernel, $token, 'POST', '/api/v1/customers/' . $theirs->id . '/parts', []);
    check($status === 404, 'A cannot assign device to B customer');
    [$status] = api($kernel, $token, 'POST', '/api/v1/sms/send-pattern', ['customer_id' => $theirs->id, 'mobile' => '09123456789', 'pattern_code' => 'test', 'tokens' => ['name' => 'test']]);
    check($status === 404, 'A cannot send a message linked to B customer');
    check(!(new CustomersExport(null, $a))->collection()->contains('id', $theirs->id), 'export excludes B customer');
    $theirs->update(['mobile' => '09129876543']);
    $blockedImport = new CustomersImport($a);
    $blocked = $blockedImport->model(['person_type' => 'company', 'company_name' => 'بازنویسی غیرمجاز', 'mobile' => '09129876543']);
    check($blocked === null && $theirs->fresh()->company_name === 'شرکت ب', 'import cannot overwrite an out-of-scope customer');
    DB::table('user_customer_access')->insert(['user_id' => $a->id, 'customer_id' => $theirs->id]);
    [$status] = api($kernel, $token, 'GET', '/api/v1/customers/' . $theirs->id);
    check($status === 200, 'individual customer grant works');
    DB::table('user_customer_access')->where('user_id', $a->id)->delete();
    DB::table('user_customer_owner_access')->insert(['user_id' => $a->id, 'owner_user_id' => $b->id]);
    [$status] = api($kernel, $token, 'GET', '/api/v1/customers/' . $theirs->id);
    check($status === 200, 'owner grant works');

    [$status, $company] = api($kernel, $token, 'POST', '/api/v1/customers', ['customer_type' => 'potential', 'type' => 'company', 'company_name' => 'شرکت بدون تلفن']);
    check($status === 201 && ($company['customer']['mobile'] ?? null) === null, 'company without name or mobile is accepted');
    [$status] = api($kernel, $token, 'POST', '/api/v1/customers', ['customer_type' => 'potential', 'type' => 'individual']);
    check($status === 422, 'individual requires first and last name');

    [$status] = api($kernel, $token, 'POST', '/api/v1/parts/' . $part->id . '/stock', ['type' => 'in', 'quantity' => 5]);
    check($status === 201, 'stock receipt succeeds');
    [$status, $created] = api($kernel, $token, 'POST', '/api/v1/customers/' . $mine->id . '/parts', ['part_id' => $part->id, 'serial_number' => 'SN' . $suffix, 'quantity' => 2, 'invoice_number' => '001', 'invoice_amount' => '100.50']);
    check($status === 201 && $part->fresh()->stock_quantity === 3, 'assignment subtracts quantity');
    $assignmentId = $created['customer_part']['id'];
    check(DB::table('inventory_logs')->where(['part_id' => $part->id, 'customer_id' => $mine->id, 'user_id' => $a->id, 'type' => 'assignment_out', 'quantity' => 2])->exists(), 'assignment audit links actor and customer');
    $export = new CustomersExport(null, $a);
    $rows = $export->map($mine->fresh()->load('customerParts.part'));
    check($rows[0][14] === 'دستگاه آزمایشی' && $rows[0][17] === 2 && $rows[0][18] === '001', 'export maps device, quantity and invoice number');
    $xlsx = \Maatwebsite\Excel\Facades\Excel::raw($export, \Maatwebsite\Excel\Excel::XLSX);
    check(str_starts_with($xlsx, "PK"), 'XLSX starts with ZIP signature without a BOM');
    $temporary = tempnam(sys_get_temp_dir(), 'crm-xlsx-');
    try {
        file_put_contents($temporary, $xlsx);
        $sheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($temporary)->getActiveSheet();
        $found = false;
        for ($rowNumber = 2; $rowNumber <= $sheet->getHighestRow(); $rowNumber++) {
            if ($sheet->getCell('E' . $rowNumber)->getValue() === 'شرکت الف') {
                $found = $sheet->getCell('O' . $rowNumber)->getValue() === 'دستگاه آزمایشی'
                    && $sheet->getCell('S' . $rowNumber)->getValue() === '001'
                    && $sheet->getCell('S' . $rowNumber)->getDataType() === 's';
            }
        }
        check($found, 'XLSX round trip preserves Persian text and invoice leading zeros as text');
    } finally {
        if (is_string($temporary)) unlink($temporary);
    }

    [$status] = api($kernel, $token, 'PUT', '/api/v1/customer-parts/' . $assignmentId, ['serial_number' => 'SN' . $suffix, 'quantity' => 6]);
    check($status === 422 && $part->fresh()->stock_quantity === 3, 'insufficient stock rejected and rolled back');
    [$status] = api($kernel, $token, 'PUT', '/api/v1/customer-parts/' . $assignmentId, ['serial_number' => 'SN' . $suffix, 'quantity' => 1, 'return_confirmed' => true]);
    check($status === 200 && $part->fresh()->stock_quantity === 4, 'reducing quantity returns stock');
    [$status] = api($kernel, $token, 'DELETE', '/api/v1/customer-parts/' . $assignmentId);
    check($status === 200 && $part->fresh()->stock_quantity === 4, 'archiving allocation does not return stock');

    $headings = HeadingRowFormatter::format((new CustomersTemplateExport())->headings());
    $row = array_combine($headings, ['بالقوه', 'حقوقی', '', '', 'شرکت نمونه', '12345678901', '', '', '', '', '', '', '']);
    $import = new CustomersImport($a);
    $imported = $import->model($row);
    check($imported !== null && $imported->company_name === 'شرکت نمونه' && $imported->type === 'company', 'Persian template headings import a company without phone');
    $template = \Maatwebsite\Excel\Facades\Excel::raw(new CustomersTemplateExport(), \Maatwebsite\Excel\Excel::XLSX);
    $temporary = tempnam(sys_get_temp_dir(), 'crm-template-');
    try {
        file_put_contents($temporary, $template);
        $templateImport = new CustomersImport($a);
        \Maatwebsite\Excel\Facades\Excel::import($templateImport, $temporary, null, \Maatwebsite\Excel\Excel::XLSX);
        check($templateImport->getImportedCount() === 2 && $templateImport->getErrors() === [], 'XLSX template import reads both sample rows');
    } finally {
        if (is_string($temporary)) unlink($temporary);
    }

    echo "All smoke checks passed.\n";
} catch (Throwable $exception) {
    fwrite(STDERR, 'FAIL: ' . $exception->getMessage() . "\n");
    $failed = true;
} finally {
    DB::rollBack();
}
exit($failed ? 1 : 0);
