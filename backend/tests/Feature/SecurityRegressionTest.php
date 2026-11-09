<?php

namespace Tests\Feature;

use App\Imports\CustomersImport;
use App\Models\Customer;
use App\Models\User;
use App\Services\Sms\MelipayamakService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

class SecurityRegressionTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $email, string $type = 'manager'): User
    {
        return User::create(['name' => $email, 'email' => $email, 'phone' => '09123456789', 'password' => bcrypt('password1'), 'user_type' => $type, 'is_active' => true]);
    }

    public function test_otp_response_never_discloses_the_code(): void
    {
        $this->user('otp@example.test');
        $this->mock(MelipayamakService::class)->shouldReceive('sendNormalSms')->once()->andReturn(['success' => true, 'is_sandbox' => false]);
        $response = $this->postJson('/api/v1/auth/otp/send', ['phone' => '09123456789'])->assertOk();
        $code = Cache::get('otp_09123456789');
        $this->assertNotEmpty($code);
        $this->assertStringNotContainsString((string) $code, $response->getContent());
        $response->assertJsonMissingPath('sandbox_code');
    }

    public function test_sandbox_otp_is_not_usable(): void
    {
        $this->user('otp@example.test');
        $this->mock(MelipayamakService::class)->shouldReceive('sendNormalSms')->once()->andReturn(['success' => true, 'is_sandbox' => true]);
        $this->postJson('/api/v1/auth/otp/send', ['phone' => '09123456789'])->assertStatus(503)->assertJsonMissingPath('sandbox_code');
        $this->assertNull(Cache::get('otp_09123456789'));
    }

    public function test_failed_otp_delivery_does_not_report_success_or_leave_valid_code(): void
    {
        $this->user('otp@example.test');
        $this->mock(MelipayamakService::class)->shouldReceive('sendNormalSms')->once()->andReturn(['success' => false, 'is_sandbox' => false]);
        $this->postJson('/api/v1/auth/otp/send', ['phone' => '09123456789'])->assertStatus(503);
        $this->assertNull(Cache::get('otp_09123456789'));
    }

    public function test_inactive_user_cannot_use_existing_token(): void
    {
        $user = $this->user('inactive@example.test');
        $token = $user->createToken('test')->plainTextToken;
        $user->update(['is_active' => false]);
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_import_without_edit_permission_cannot_modify_existing_customer(): void
    {
        $user = $this->user('import@example.test', 'salesperson');
        Permission::findOrCreate('customers.import', 'web');
        Permission::findOrCreate('customers.edit', 'web');
        $user->givePermissionTo('customers.import');
        $customer = Customer::create(['customer_type' => 'potential', 'type' => 'company', 'company_name' => 'Original', 'mobile' => '09111111111', 'created_by_user_id' => $user->id]);
        $import = new CustomersImport($user);
        $import->model(['company_name' => 'Changed', 'mobile' => '09111111111']);
        $this->assertSame('Original', $customer->fresh()->company_name);
        $this->assertNotEmpty($import->getErrors());
    }

    public function test_restricted_sms_logs_do_not_disclose_otp(): void
    {
        $user = $this->user('logs@example.test');
        Permission::findOrCreate('sms.logs', 'web');
        $user->givePermissionTo('sms.logs');
        \App\Models\SmsLog::create(['recipient_mobile' => '09123456789', 'pattern_code' => 'NORMAL-OTP', 'tokens' => ['text' => 'secret12345'], 'status' => 'sent']);
        Sanctum::actingAs($user);
        $this->assertStringNotContainsString('secret12345', $this->getJson('/api/v1/sms/logs')->assertOk()->getContent());
    }
    public function test_manager_cannot_change_another_managers_password(): void
    {
        $manager = $this->user('manager@example.test');
        Permission::findOrCreate('users.manage', 'web');
        $manager->givePermissionTo('users.manage');
        $target = User::create(['name' => 'Target', 'email' => 'target@example.test', 'password' => bcrypt('password1'), 'user_type' => 'manager', 'is_active' => true]);
        Sanctum::actingAs($manager);
        $this->putJson('/api/v1/users/'.$target->id, ['name' => 'Target', 'email' => $target->email, 'password' => 'Newpass123'])->assertForbidden();
    }

    public function test_deactivation_revokes_existing_tokens(): void
    {
        $admin = $this->user('admin@example.test', 'administrator');
        Permission::findOrCreate('users.manage', 'web');
        $admin->givePermissionTo('users.manage');
        $target = User::create(['name' => 'Target', 'email' => 'target@example.test', 'password' => bcrypt('password1'), 'user_type' => 'salesperson', 'is_active' => true]);
        $target->createToken('test');
        Sanctum::actingAs($admin);
        $this->patchJson('/api/v1/users/'.$target->id.'/toggle-active')->assertOk();
        $this->assertSame  (0, $target->tokens()->count());
    }

    public function test_import_rejects_invalid_email_and_national_code(): void
    {
        $user = $this->user('import@example.test', 'salesperson');
        $import = new CustomersImport($user);
        $import->model(['company_name' => 'Bad email', 'email' => 'invalid']);
        $import->model(['company_name' => 'Bad ID', 'national_code' => '123']);
        $this->assertDatabaseMissing('customers', ['company_name' => 'Bad email']);
        $this->assertDatabaseMissing('customers', ['company_name' => 'Bad ID']);
        $this->assertCount(2, $import->getErrors());
    }

    public function test_import_without_identifier_is_rejected_to_prevent_duplicates(): void
    {
        $user = $this->user('import@example.test', 'salesperson');
        $import = new CustomersImport($user);
        $import->model(['company_name' => 'No identifier']);
        $this->assertDatabaseMissing('customers', ['company_name' => 'No identifier']);
        $this->assertNotEmpty($import->getErrors());
    }

}
