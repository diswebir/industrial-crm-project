<?php

namespace App\Services\Customers;

use App\Models\Customer;
use App\Models\CustomerPart;
use App\Models\InventoryLog;
use App\Models\Part;
use App\Models\PartServiceHistory;
use App\Services\Inventory\InventoryService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CustomerService
{
    public function __construct(protected InventoryService $inventory)
    {
    }

    /**
     * تخصیص دستگاه به مشتری به همراه تعداد، شماره/مبلغ فاکتور.
     * موجودی انبار به صورت اتمیک کسر و در لاگ انبار ثبت می‌شود؛ در صورت خطا هیچ رکوردی ثبت نمی‌شود.
     */
    public function assignDevice(Customer $customer, Part $part, array $data, ?int $userId = null): CustomerPart
    {
        $quantity = max(1, (int) ($data['quantity'] ?? 1));
        $serialNumber = $this->normalizeSerial($data['serial_number'] ?? null);

        if ($serialNumber !== null && CustomerPart::where('serial_number', $serialNumber)->exists()) {
            throw ValidationException::withMessages([
                'serial_number' => ["شماره سریال {$serialNumber} قبلاً برای دستگاه دیگری در سیستم ثبت شده است."],
            ]);
        }

        $installDate = ! empty($data['installation_date'])
            ? Carbon::parse($data['installation_date'])
            : Carbon::now();

        $warrantyMonths = (int) ($part->periodic_service_months ?: 12);
        // تاریخ پایان گارانتیِ واردشده در فرم باید بر مقدار محاسبه‌شده اولویت داشته باشد.
        $warrantyExpire = ! empty($data['warranty_expire_date'])
            ? Carbon::parse($data['warranty_expire_date'])
            : (clone $installDate)->addMonths($warrantyMonths);

        return DB::transaction(function () use ($customer, $part, $data, $userId, $quantity, $serialNumber, $installDate, $warrantyExpire) {
            $customerPart = $customer->customerParts()->create([
                'part_id' => $part->id,
                'quantity' => $quantity,
                'invoice_number' => $this->normalizeInvoiceNumber($data['invoice_number'] ?? null),
                'invoice_amount' => $this->normalizeAmount($data['invoice_amount'] ?? null),
                'serial_number' => $serialNumber,
                'installation_date' => $installDate->toDateString(),
                'warranty_expire_date' => $warrantyExpire->toDateString(),
                'status' => $data['status'] ?? 'active',
                'notes' => $data['notes'] ?? null,
                'assigned_by_user_id' => $userId,
            ]);

            // کسر اتمیک موجودی + ثبت لاگ خروج (اگر موجودی کافی نباشد Transaction کل عملیات را برمی‌گرداند)
            $this->inventory->record(
                $part,
                InventoryLog::TYPE_OUT,
                $quantity,
                $userId,
                $customer,
                $customerPart,
                "خروج جهت تخصیص به مشتری «{$customer->full_name}»"
            );

            // Audit Trail: Device Assignment
            $customer->histories()->create([
                'user_id' => $userId,
                'action' => 'part_assigned',
                'description' => "دستگاه «{$part->name}» به تعداد {$quantity} عدد به مشتری تخصیص داده شد.",
                'metadata' => [
                    'part_id' => $part->id,
                    'part_name' => $part->name,
                    'quantity' => $quantity,
                    'serial_number' => $serialNumber,
                    'invoice_number' => $customerPart->invoice_number,
                    'invoice_amount' => $customerPart->invoice_amount,
                    'warranty_expire_date' => $warrantyExpire->toDateString(),
                ],
            ]);

            // تبدیل خودکار مشتری بالقوه به بالفعل
            if ($customer->customer_type === 'potential') {
                $customer->update(['customer_type' => 'effective']);

                $customer->histories()->create([
                    'user_id' => $userId,
                    'action' => 'type_converted',
                    'description' => "وضعیت مشتری به دلیل تحویل دستگاه «{$part->name}» از «بالقوه» به «بالفعل» تغییر یافت.",
                    'metadata' => [
                        'previous_type' => 'potential',
                        'new_type' => 'effective',
                        'triggered_by_part_id' => $part->id,
                    ],
                ]);
            }

            return $customerPart->load(['part', 'assignedBy']);
        });
    }

    /**
     * ویرایش یک رکورد تخصیص: تعداد، فاکتور، تاریخ‌ها، وضعیت و حتی مدل دستگاه.
     * در صورت تغییر تعداد/مدل، موجودی انبار به صورت خودکار اصلاح و لاگ می‌شود.
     */
    public function updateDevice(CustomerPart $customerPart, array $data, ?int $userId = null): CustomerPart
    {
        $oldPartId = (int) $customerPart->part_id;
        $oldQuantity = max(1, (int) $customerPart->quantity);

        $newPartId = (int) ($data['part_id'] ?? $oldPartId);
        $newQuantity = max(1, (int) ($data['quantity'] ?? $oldQuantity));

        /** @var Part $oldPart */
        $oldPart = Part::findOrFail($oldPartId);
        /** @var Part $newPart */
        $newPart = $newPartId === $oldPartId ? $oldPart : Part::findOrFail($newPartId);

        $serialNumber = array_key_exists('serial_number', $data)
            ? $this->normalizeSerial($data['serial_number'])
            : $customerPart->serial_number;

        if (
            $serialNumber !== null
            && CustomerPart::where('serial_number', $serialNumber)
                ->whereKeyNot($customerPart->getKey())
                ->exists()
        ) {
            throw ValidationException::withMessages([
                'serial_number' => ["شماره سریال {$serialNumber} قبلاً برای دستگاه دیگری ثبت شده است."],
            ]);
        }

        $installDate = ! empty($data['installation_date'])
            ? Carbon::parse($data['installation_date'])
            : ($customerPart->installation_date ?: Carbon::now());

        $warrantyMonths = (int) ($newPart->periodic_service_months ?: 12);
        $warrantyExpire = ! empty($data['warranty_expire_date'])
            ? Carbon::parse($data['warranty_expire_date'])
            : (clone $installDate)->addMonths($warrantyMonths);

        return DB::transaction(function () use (
            $customerPart,
            $data,
            $userId,
            $oldPart,
            $newPart,
            $oldPartId,
            $newPartId,
            $oldQuantity,
            $newQuantity,
            $serialNumber,
            $installDate,
            $warrantyExpire
        ) {
            $customer = $customerPart->customer;

            // ── همگام‌سازی انبار ──
            if ($newPartId !== $oldPartId) {
                $this->inventory->record(
                    $oldPart,
                    InventoryLog::TYPE_RETURN,
                    $oldQuantity,
                    $userId,
                    $customer,
                    $customerPart,
                    "برگشت موجودی به دلیل تغییر مدل دستگاه در پرونده مشتری «{$customer?->full_name}»"
                );

                $this->inventory->record(
                    $newPart,
                    InventoryLog::TYPE_OUT,
                    $newQuantity,
                    $userId,
                    $customer,
                    $customerPart,
                    "خروج جهت تخصیص مدل جدید به مشتری «{$customer?->full_name}»"
                );
            } elseif ($newQuantity > $oldQuantity) {
                $this->inventory->record(
                    $newPart,
                    InventoryLog::TYPE_OUT,
                    $newQuantity - $oldQuantity,
                    $userId,
                    $customer,
                    $customerPart,
                    "افزایش تعداد دستگاه تخصیص‌یافته به مشتری «{$customer?->full_name}»"
                );
            } elseif ($newQuantity < $oldQuantity) {
                $this->inventory->record(
                    $newPart,
                    InventoryLog::TYPE_RETURN,
                    $oldQuantity - $newQuantity,
                    $userId,
                    $customer,
                    $customerPart,
                    "کاهش تعداد دستگاه و برگشت به انبار از پرونده مشتری «{$customer?->full_name}»"
                );
            }

            $updateData = [
                'part_id' => $newPart->id,
                'quantity' => $newQuantity,
                'installation_date' => $installDate->toDateString(),
                'warranty_expire_date' => $warrantyExpire->toDateString(),
            ];

            if (array_key_exists('invoice_number', $data)) {
                $updateData['invoice_number'] = $this->normalizeInvoiceNumber($data['invoice_number']);
            }
            if (array_key_exists('invoice_amount', $data)) {
                $updateData['invoice_amount'] = $this->normalizeAmount($data['invoice_amount']);
            }
            if (array_key_exists('serial_number', $data)) {
                $updateData['serial_number'] = $serialNumber;
            }
            if (array_key_exists('status', $data) && in_array($data['status'], ['active', 'under_repair', 'replaced', 'retired'], true)) {
                $updateData['status'] = $data['status'];
            }
            if (array_key_exists('notes', $data)) {
                $updateData['notes'] = $data['notes'];
            }

            $customerPart->update($updateData);

            $customer?->histories()->create([
                'user_id' => $userId,
                'action' => 'part_updated',
                'description' => "رکورد دستگاه «{$newPart->name}» (تعداد {$newQuantity}) در پرونده مشتری ویرایش شد.",
                'metadata' => [
                    'customer_part_id' => $customerPart->id,
                    'part_id' => $newPart->id,
                    'quantity' => $newQuantity,
                    'invoice_number' => $customerPart->invoice_number,
                    'invoice_amount' => $customerPart->invoice_amount,
                ],
            ]);

            return $customerPart->load(['part', 'assignedBy']);
        });
    }

    /**
     * حذف یک رکورد تخصیص و برگشت موجودی به انبار + ثبت لاگ.
     */
    public function deleteDevice(CustomerPart $customerPart, ?int $userId = null): void
    {
        if ($customerPart->serviceHistories()->exists()) {
            throw ValidationException::withMessages([
                'assignment' => ['این دستگاه سابقه سرویس/تعمیر دارد و حذف تخصیص آن مجاز نیست.'],
            ]);
        }

        DB::transaction(function () use ($customerPart, $userId) {
            $customer = $customerPart->customer;
            $part = $customerPart->part;
            $quantity = max(1, (int) $customerPart->quantity);

            if ($part) {
                $this->inventory->record(
                    $part,
                    InventoryLog::TYPE_RETURN,
                    $quantity,
                    $userId,
                    $customer,
                    $customerPart,
                    "برگشت به انبار به دلیل حذف تخصیص از پرونده مشتری «{$customer?->full_name}»"
                );
            }

            $partName = $part?->name ?? 'نامشخص';

            if ($customer) {
                $customer->histories()->create([
                    'user_id' => $userId,
                    'action' => 'part_removed',
                    'description' => "تخصیص دستگاه «{$partName}» به تعداد {$quantity} عدد از پرونده مشتری حذف و به انبار برگشت داده شد.",
                    'metadata' => [
                        'customer_part_id' => $customerPart->id,
                        'part_id' => $customerPart->part_id,
                        'quantity' => $quantity,
                    ],
                ]);
            }

            $customerPart->delete();
        });
    }

    /**
     * حذف کامل مشتری با برگشت موجودی همه دستگاه‌های تخصیص‌یافته (جلوگیری از گم شدن موجودی انبار).
     */
    public function deleteCustomer(Customer $customer, ?int $userId = null): void
    {
        if ($customer->customerParts()->whereHas('serviceHistories')->exists()) {
            throw ValidationException::withMessages([
                'customer' => ['این مشتری سابقه سرویس/تعمیر دارد و حذف پرونده مجاز نیست.'],
            ]);
        }

        DB::transaction(function () use ($customer, $userId) {
            $assignments = $customer->customerParts()->with('part')->get();

            foreach ($assignments as $assignment) {
                if ($assignment->part) {
                    $this->inventory->record(
                        $assignment->part,
                        InventoryLog::TYPE_RETURN,
                        max(1, (int) $assignment->quantity),
                        $userId,
                        $customer,
                        $assignment,
                        "برگشت به انبار به دلیل حذف پرونده مشتری «{$customer->full_name}»"
                    );
                }
            }

            $customer->delete();
        });
    }

    /**
     * ثبت سابقه سرویس/تعمیر برای یک دستگاه تخصیص‌یافته.
     */
    public function recordServiceHistory(CustomerPart $customerPart, array $data, ?int $userId = null): PartServiceHistory
    {
        return DB::transaction(function () use ($customerPart, $data, $userId) {
            $history = $customerPart->serviceHistories()->create([
                'performed_by_user_id' => $userId,
                'service_date' => $data['service_date'] ?? Carbon::now()->toDateString(),
                'service_type' => $data['service_type'] ?? 'repair',
                'description' => $data['description'],
                'cost' => $data['cost'] ?? null,
            ]);

            $customer = $customerPart->customer;
            if ($customer) {
                $serial = $customerPart->serial_number ? " (سریال {$customerPart->serial_number})" : '';
                $customer->histories()->create([
                    'user_id' => $userId,
                    'action' => 'service_performed',
                    'description' => "اقدام سرویس/تعمیر برای دستگاه «{$customerPart->part?->name}»{$serial} ثبت گردید.",
                    'metadata' => [
                        'service_history_id' => $history->id,
                        'service_type' => $history->service_type,
                        'cost' => $history->cost,
                    ],
                ]);
            }

            return $history;
        });
    }

    /**
     * سازگاری با نسخه قبلی (assignPart) — همان تخصیص دستگاه با پارامترهای قدیمی.
     */
    public function assignPart(Customer $customer, Part $part, string $serialNumber, array $attributes = [], ?int $userId = null): CustomerPart
    {
        $attributes['serial_number'] = $serialNumber;

        return $this->assignDevice($customer, $part, $attributes, $userId);
    }

    private function normalizeSerial(mixed $serial): ?string
    {
        if ($serial === null) {
            return null;
        }

        $serial = trim((string) $serial);

        return $serial === '' ? null : $serial;
    }

    private function normalizeInvoiceNumber(mixed $invoiceNumber): ?string
    {
        if ($invoiceNumber === null) {
            return null;
        }

        $value = trim((string) $invoiceNumber);

        return $value === '' ? null : $value;
    }

    /**
     * مبلغ فاکتور ممکن است با ارقام فارسی یا جداکننده هزارگان ارسال شود.
     */
    private function normalizeAmount(mixed $amount): ?float
    {
        if ($amount === null || $amount === '') {
            return null;
        }

        $value = str_replace(
            ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', ',', '،', ' '],
            ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '', '', ''],
            (string) $amount
        );

        return is_numeric($value) ? (float) $value : null;
    }
}
