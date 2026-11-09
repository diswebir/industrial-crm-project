<?php

namespace Tests\Feature;

use App\Exports\CustomersExport;
use App\Models\Customer;
use App\Models\Part;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

class CustomerInventoryTest extends TestCase
{
    use RefreshDatabase;

    private function employee(string $email): User
    {
        $user = User::create(['name' => $email, 'email' => $email, 'password' => 'password', 'user_type' => 'salesperson', 'is_active' => true]);
        foreach (['customers.view', 'customers.create', 'customers.edit', 'customers.export', 'parts.view', 'parts.assign', 'parts.manage'] as $permission) {
            Permission::findOrCreate($permission, 'web');
            $user->givePermissionTo($permission);
        }
        return $user;
    }

    private function customer(User $owner, string $company): Customer
    {
        return Customer::create(['customer_type' => 'potential', 'type' => 'company', 'company_name' => $company, 'created_by_user_id' => $owner->id]);
    }

    public function test_customer_scope_covers_endpoints_export_and_explicit_exceptions(): void
    {
        $a = $this->employee('a@example.test');
        $b = $this->employee('b@example.test');
        $own = $this->customer($a, 'الف');
        $other = $this->customer($b, 'ب');
        Sanctum::actingAs($a);
        $this->getJson('/api/v1/customers/'.$other->id)->assertNotFound();
        $this->putJson('/api/v1/customers/'.$other->id, ['company_name' => 'غیرمجاز'])->assertNotFound();
        $this->assertSame([$own->id], (new CustomersExport(null, $a))->collection()->pluck('id')->all());
        DB::table('user_customer_access')->insert(['user_id' => $a->id, 'customer_id' => $other->id]);
        $this->getJson('/api/v1/customers/'.$other->id)->assertOk();
        DB::table('user_customer_access')->delete();
        DB::table('user_customer_owner_access')->insert(['user_id' => $a->id, 'owner_user_id' => $b->id]);
        $this->getJson('/api/v1/customers/'.$other->id)->assertOk();
        DB::table('user_customer_owner_access')->delete();
        $a->customer_access_all = true;
        $a->save();
        $this->getJson('/api/v1/customers/'.$other->id)->assertOk();
    }

    public function test_inventory_is_atomic_and_returns_stock_after_edit_and_delete(): void
    {
        $user = $this->employee('seller@example.test');
        $customer = $this->customer($user, 'شرکت');
        $part = Part::create(['name' => 'دستگاه', 'code' => 'X1', 'periodic_service_months' => 12, 'is_active' => true]);
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/parts/'.$part->id.'/stock', ['type' => 'in', 'quantity' => 5])->assertCreated();
        $response = $this->postJson('/api/v1/customers/'.$customer->id.'/parts', ['part_id' => $part->id, 'serial_number' => 'SN01', 'quantity' => 2, 'invoice_amount' => '100.50', 'invoice_number' => '001']);
        $response->assertCreated();
        $assignment = $response->json('customer_part.id');
        $this->assertSame(3, $part->fresh()->stock_quantity);
        $this->assertDatabaseHas('inventory_logs', ['type' => 'assignment_out', 'part_id' => $part->id, 'customer_id' => $customer->id, 'user_id' => $user->id, 'quantity' => 2]);
        $this->putJson('/api/v1/customer-parts/'.$assignment, ['serial_number' => 'SN01', 'quantity' => 6])->assertStatus(422);
        $this->assertSame(3, $part->fresh()->stock_quantity);
        $this->assertDatabaseHas('customer_parts', ['id' => $assignment, 'quantity' => 2]);
        $this->putJson('/api/v1/customer-parts/'.$assignment, ['serial_number' => 'SN01', 'quantity' => 1])->assertOk();
        $this->assertSame(4, $part->fresh()->stock_quantity);
        $this->deleteJson('/api/v1/customer-parts/'.$assignment)->assertOk();
        $this->assertSame(5, $part->fresh()->stock_quantity);
        $this->assertSoftDeleted('customer_parts', ['id' => $assignment]);
    }

    public function test_company_can_be_created_without_name_or_mobile(): void
    {
        $user = $this->employee('seller@example.test');
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/customers', ['customer_type' => 'potential', 'type' => 'company', 'company_name' => 'شرکت'])->assertCreated();
        $this->postJson('/api/v1/customers', ['customer_type' => 'potential', 'type' => 'individual'])->assertStatus(422);
    }
}
