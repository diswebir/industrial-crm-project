<?php

namespace App\Services\Customers;

use App\Models\Customer;
use App\Models\CustomerPart;
use App\Models\Part;
use App\Models\PartServiceHistory;
use App\Models\User;
use App\Services\Inventory\InventoryService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CustomerService
{
    public function __construct(private InventoryService $inventory)
    {
    }

    /** Assign stock, customer device, and both histories atomically. */
    public function assignPart(Customer $customer, Part $part, string $serialNumber, array $attributes, User $user): CustomerPart
    {
        return DB::transaction(function () use ($customer, $part, $serialNumber, $attributes, $user): CustomerPart {
            $customer = Customer::visibleTo($user)->whereKey($customer->id)->lockForUpdate()->firstOrFail();
            $part = Part::query()->whereKey($part->id)->lockForUpdate()->firstOrFail();
            if (!$part->is_active) {
                throw ValidationException::withMessages(['part_id' => ['این دستگاه در کاتالوگ غیرفعال است.']]);
            }
            if (CustomerPart::withTrashed()->where('serial_number', trim($serialNumber))->exists()) {
                throw ValidationException::withMessages(['serial_number' => ['این شناسه قبلاً ثبت شده است.']]);
            }

            $installDate = !empty($attributes['installation_date']) ? Carbon::parse($attributes['installation_date']) : Carbon::now();
            $warrantyExpire = $installDate->copy()->addMonths($part->periodic_service_months ?: 12);
            $assignment = $customer->customerParts()->create([
                'part_id' => $part->id,
                'serial_number' => trim($serialNumber),
                'installation_date' => $installDate->toDateString(),
                'warranty_expire_date' => $warrantyExpire->toDateString(),
                'status' => $attributes['status'] ?? 'active',
                'notes' => $attributes['notes'] ?? null,
                'quantity' => $attributes['quantity'],
                'invoice_amount' => $attributes['invoice_amount'] ?? null,
                'invoice_number' => $attributes['invoice_number'] ?? null,
            ]);

            $this->inventory->apply($part, -(int) $assignment->quantity, 'assignment_out', $user, $customer, $assignment);
            $customer->histories()->create([
                'user_id' => $user->id,
                'action' => 'part_assigned',
                'description' => "دستگاه «{$part->name}» با شناسه {$assignment->serial_number} به مشتری تخصیص داده شد.",
                'metadata' => [
                    'part_id' => $part->id,
                    'part_name' => $part->name,
                    'serial_number' => $assignment->serial_number,
                    'quantity' => $assignment->quantity,
                    'warranty_expire_date' => $warrantyExpire->toDateString(),
                ],
            ]);

            if ($customer->customer_type === 'potential') {
                $customer->update(['customer_type' => 'effective']);
                $customer->histories()->create([
                    'user_id' => $user->id,
                    'action' => 'type_converted',
                    'description' => "وضعیت مشتری به دلیل تحویل دستگاه با شناسه {$assignment->serial_number} از «بالقوه» به «بالفعل» تغییر یافت.",
                    'metadata' => [
                        'previous_type' => 'potential',
                        'new_type' => 'effective',
                        'triggered_by_serial' => $assignment->serial_number,
                    ],
                ]);
            }

            return $assignment->load('part');
        }, 3);
    }

    /** Change quantity by its difference; keep service history on the same device. */
    public function updateAssignment(CustomerPart $assignment, array $attributes, User $user): CustomerPart
    {
        return DB::transaction(function () use ($assignment, $attributes, $user): CustomerPart {
            $customer = Customer::visibleTo($user)->whereKey($assignment->customer_id)->lockForUpdate()->firstOrFail();
            $assignment = CustomerPart::query()->whereKey($assignment->id)->where('customer_id', $customer->id)->lockForUpdate()->firstOrFail();
            $part = Part::query()->whereKey($assignment->part_id)->lockForUpdate()->firstOrFail();
            $oldQuantity = (int) $assignment->quantity;
            $newQuantity = (int) $attributes['quantity'];
            $difference = $newQuantity - $oldQuantity;

            if ($difference < 0 && empty($attributes['return_confirmed'])) {
                throw ValidationException::withMessages(['quantity' => ['برای کاهش تعداد، بازگشت فیزیکی دستگاه به انبار را تأیید کنید.']]);
            }
            unset($attributes['return_confirmed']);
            if ($difference !== 0) {
                $this->inventory->apply($part, -$difference, $difference > 0 ? 'assignment_out' : 'assignment_return', $user, $customer, $assignment);
            }
            if (array_key_exists('installation_date', $attributes)) {
                $date = !empty($attributes['installation_date']) ? Carbon::parse($attributes['installation_date']) : null;
                $attributes['warranty_expire_date'] = $date?->copy()->addMonths($part->periodic_service_months ?: 12)->toDateString();
            }
            $assignment->update($attributes);
            $customer->histories()->create([
                'user_id' => $user->id,
                'action' => 'part_updated',
                'description' => "تخصیص دستگاه «{$part->name}» ویرایش شد.",
                'metadata' => ['customer_part_id' => $assignment->id, 'old_quantity' => $oldQuantity, 'new_quantity' => $newQuantity],
            ]);

            return $assignment->fresh()->load('part');
        }, 3);
    }

    public function deleteAssignment(CustomerPart $assignment, User $user): void
    {
        DB::transaction(function () use ($assignment, $user): void {
            $customer = Customer::visibleTo($user)->whereKey($assignment->customer_id)->lockForUpdate()->firstOrFail();
            $assignment = CustomerPart::query()->whereKey($assignment->id)->where('customer_id', $customer->id)->lockForUpdate()->firstOrFail();
            $this->returnAndArchive($assignment, $customer, $user);
        }, 3);
    }

    /** Archive the customer and assignments without assuming physical return. */
    public function deleteCustomer(Customer $customer, User $user): void
    {
        DB::transaction(function () use ($customer, $user): void {
            $customer = Customer::visibleTo($user)->whereKey($customer->id)->lockForUpdate()->firstOrFail();
            $assignments = $customer->customerParts()->orderBy('part_id')->orderBy('id')->lockForUpdate()->get();
            foreach ($assignments as $assignment) {
                $this->returnAndArchive($assignment, $customer, $user);
            }
            $customer->histories()->create([
                'user_id' => $user->id,
                'action' => 'customer_archived',
                'description' => 'پرونده مشتری و تخصیص‌ها بدون تغییر موجودی بایگانی شد.',
            ]);
            $customer->delete();
        }, 3);
    }

    private function returnAndArchive(CustomerPart $assignment, Customer $customer, User $user): void
    {
        $part = Part::query()->whereKey($assignment->part_id)->firstOrFail();
        $customer->histories()->create([
            'user_id' => $user->id,
            'action' => 'part_removed',
            'description' => "تخصیص دستگاه «{$part->name}» بایگانی شد؛ موجودی تغییر نکرد.",
            'metadata' => ['customer_part_id' => $assignment->id, 'quantity' => $assignment->quantity],
        ]);
        $assignment->delete();
    }

    public function recordServiceHistory(CustomerPart $assignment, array $data, User $user): PartServiceHistory
    {
        return DB::transaction(function () use ($assignment, $data, $user): PartServiceHistory {
            $customer = Customer::visibleTo($user)->whereKey($assignment->customer_id)->lockForUpdate()->firstOrFail();
            $assignment = CustomerPart::query()->whereKey($assignment->id)->where('customer_id', $customer->id)->lockForUpdate()->firstOrFail();
            $history = $assignment->serviceHistories()->create([
                'performed_by_user_id' => $user->id,
                'service_date' => $data['service_date'] ?? Carbon::now()->toDateString(),
                'service_type' => $data['service_type'] ?? 'repair',
                'description' => $data['description'],
                'cost' => $data['cost'] ?? null,
            ]);
            $customer->histories()->create([
                'user_id' => $user->id,
                'action' => 'service_performed',
                'description' => "اقدام سرویس/تعمیر برای دستگاه با شناسه {$assignment->serial_number} ثبت گردید.",
                'metadata' => ['service_history_id' => $history->id, 'service_type' => $history->service_type, 'cost' => $history->cost],
            ]);
            return $history;
        }, 3);
    }
}
