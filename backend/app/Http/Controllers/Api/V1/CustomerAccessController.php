<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerAccessController extends Controller
{
    private function authorizeAdministrator(Request $request): void
    {
        $actor = $request->user();
        abort_unless($actor && $actor->isAdministrator() && $actor->hasPermissionTo('users.manage'), 403);
    }

    public function show(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdministrator($request);
        return response()->json($this->scopeData($user));
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdministrator($request);
        abort_unless($user->hasRestrictedCustomers(), 422, 'محدوده مشتری برای این نوع کاربر قابل تنظیم نیست.');
        $data = $request->validate([
            'all' => 'required|boolean',
            'owner_user_ids' => 'present|array|max:1000',
            'owner_user_ids.*' => 'integer|distinct|exists:users,id',
            'customer_ids' => 'present|array|max:1000',
            'customer_ids.*' => 'integer|distinct|exists:customers,id',
        ]);
        DB::transaction(function () use ($user, $data): void {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $locked->customer_access_all = $data['all'];
            $locked->save();
            DB::table('user_customer_owner_access')->where('user_id', $user->id)->delete();
            DB::table('user_customer_access')->where('user_id', $user->id)->delete();
            $owners = array_values(array_filter($data['owner_user_ids'], fn ($id) => (int) $id !== (int) $user->id));
            if ($owners) {
                DB::table('user_customer_owner_access')->insert(array_map(fn ($id) => ['user_id' => $user->id, 'owner_user_id' => $id], $owners));
            }
            if ($data['customer_ids']) {
                DB::table('user_customer_access')->insert(array_map(fn ($id) => ['user_id' => $user->id, 'customer_id' => $id], $data['customer_ids']));
            }
        }, 3);
        return response()->json(['message' => 'محدوده دسترسی مشتریان ذخیره شد.', ...$this->scopeData($user->fresh())]);
    }

    public function options(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdministrator($request);
        $term = trim((string) $request->input('q', ''));
        $op = $this->likeOp();
        $customers = Customer::query()->when($term !== '', function ($query) use ($term, $op): void {
            $query->where(function ($query) use ($term, $op): void {
                $query->where('first_name', $op, "%{$term}%")->orWhere('last_name', $op, "%{$term}%")
                    ->orWhere('company_name', $op, "%{$term}%")->orWhere('mobile', $op, "%{$term}%");
            });
        })->orderByDesc('id')->limit(100)->get(['id', 'first_name', 'last_name', 'company_name']);
        $owners = User::query()->whereKeyNot($user->id)->orderBy('name')->get(['id', 'name']);
        return response()->json(['customers' => $customers, 'owners' => $owners]);
    }

    /** Administrative repair for old records with unknown or departed creators. */
    public function updateOwner(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeAdministrator($request);
        $data = $request->validate(['created_by_user_id' => 'present|nullable|integer|exists:users,id']);
        DB::transaction(function () use ($customer, $data, $request): void {
            $customer = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();
            $old = $customer->created_by_user_id;
            $customer->update(['created_by_user_id' => $data['created_by_user_id']]);
            $customer->histories()->create([
                'user_id' => $request->user()->id,
                'action' => 'owner_changed',
                'description' => 'مالک پرونده مشتری توسط مدیر اصلاح شد.',
                'metadata' => ['previous_user_id' => $old, 'new_user_id' => $data['created_by_user_id']],
            ]);
        }, 3);
        return response()->json(['message' => 'مالک پرونده تغییر کرد.', 'customer' => $customer->fresh()->load('creator')]);
    }

    private function scopeData(User $user): array
    {
        $ownerIds = DB::table('user_customer_owner_access')->where('user_id', $user->id)->pluck('owner_user_id')->all();
        $customerIds = DB::table('user_customer_access')->where('user_id', $user->id)->pluck('customer_id')->all();
        return [
            'all' => (bool) $user->customer_access_all,
            'owner_user_ids' => $ownerIds,
            'customer_ids' => $customerIds,
            'selected_customers' => Customer::whereIn('id', $customerIds)->get(['id', 'first_name', 'last_name', 'company_name']),
        ];
    }
}
