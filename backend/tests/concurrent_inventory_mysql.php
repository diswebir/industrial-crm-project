<?php

declare(strict_types=1);

// The parent creates disposable fixtures; child processes race on the same stock row.
require dirname(__DIR__) . '/vendor/autoload.php';
$app = require dirname(__DIR__) . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Customer;
use App\Models\Part;
use App\Models\User;
use App\Services\Customers\CustomerService;
use App\Services\Inventory\InventoryService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

if (!$app->environment('testing') || DB::connection()->getDriverName() !== 'mysql' || !str_ends_with(DB::connection()->getDatabaseName(), '_test')) {
    throw new RuntimeException('Requires APP_ENV=testing and a disposable MySQL database ending in _test.');
}
if (($argv[1] ?? '') === 'worker') {
    [, , $userId, $customerId, $partId, $serial, $ready, $go] = $argv;
    file_put_contents($ready, 'ready');
    $deadline = microtime(true) + 30;
    while (!is_file($go) && microtime(true) < $deadline) usleep(10000);
    if (!is_file($go)) throw new RuntimeException('Start barrier timed out.');
    try {
        app(CustomerService::class)->assignPart(Customer::findOrFail($customerId), Part::findOrFail($partId), $serial, ['quantity' => 2], User::findOrFail($userId));
        echo 'assigned';
    } catch (ValidationException $exception) {
        echo 'insufficient';
    }
    exit(0);
}

$suffix = bin2hex(random_bytes(6));
$user = User::create(['name' => 'Concurrency test', 'email' => "race-{$suffix}@example.invalid", 'password' => 'test-password', 'user_type' => 'salesperson', 'is_active' => true]);
$customers = [];
foreach (['A', 'B'] as $name) {
    $customers[] = Customer::create(['customer_type' => 'potential', 'type' => 'company', 'company_name' => $name, 'created_by_user_id' => $user->id]);
}
$part = Part::create(['name' => 'Race device', 'code' => 'R' . $suffix, 'periodic_service_months' => 12, 'is_active' => true]);
app(InventoryService::class)->adjust($part, 'in', 3, $user);
$directory = sys_get_temp_dir() . '/crm-inventory-race-' . $suffix;
if (!mkdir($directory, 0700)) throw new RuntimeException('Unable to create race barrier directory.');
$processes = [];
try {
    foreach ($customers as $index => $customer) {
        $args = [PHP_BINARY, __FILE__, 'worker', (string) $user->id, (string) $customer->id, (string) $part->id, 'SER' . $suffix . $index, "$directory/ready$index", "$directory/go"];
        $process = proc_open($args, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) throw new RuntimeException('Could not start worker.');
        fclose($pipes[0]);
        $processes[] = [$process, $pipes];
    }
    $deadline = microtime(true) + 30;
    while ((!is_file("$directory/ready0") || !is_file("$directory/ready1")) && microtime(true) < $deadline) usleep(10000);
    if (!is_file("$directory/ready0") || !is_file("$directory/ready1")) throw new RuntimeException('Workers did not become ready.');
    file_put_contents("$directory/go", 'go');
    $results = [];
    foreach ($processes as [$process, $pipes]) {
        $out = stream_get_contents($pipes[1]);
        $err = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $status = proc_close($process);
        if ($status !== 0) throw new RuntimeException("Worker failed: {$err}");
        $results[] = $out;
    }
    $processes = [];
    sort($results);
    if ($results !== ['assigned', 'insufficient'] || $part->fresh()->stock_quantity !== 1 || DB::table('inventory_logs')->where('part_id', $part->id)->where('type', 'assignment_out')->count() !== 1) {
        throw new RuntimeException('Concurrent allocation did not preserve stock: ' . json_encode($results));
    }
    echo "PASS: concurrent allocations cannot oversell MySQL stock\n";
} finally {
    foreach ($processes as [$process, $pipes]) {
        foreach ([1, 2] as $pipe) if (is_resource($pipes[$pipe])) fclose($pipes[$pipe]);
        if (is_resource($process)) { proc_terminate($process); proc_close($process); }
    }
    foreach (['ready0', 'ready1', 'go'] as $name) if (is_file("$directory/$name")) unlink("$directory/$name");
    rmdir($directory);
}
