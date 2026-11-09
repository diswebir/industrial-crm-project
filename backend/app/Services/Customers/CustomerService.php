<?php

namespace App\Services\Customers;

use App\Models\Customer;
use App\Models\CustomerPart;
use App\Models\Part;
use App\Models\PartServiceHistory;
use App\Services\Inventory\InventoryService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  سرویس مشتریان و دستگاه‌های تخصیص‌یافته (v2.0.0)
 *
 *  همه عملیات حساس (تخصیص، ویرایش، حذف، کسر/بازگشت موجودی و ثبت لاگ) داخل
 *  DB::transaction انجام می‌شود تا در صورت بروز خطا هیچ داده ناقصی باقی نماند.
 * ─────────────────────────────────────────────────────────────────────────────
 */
class CustomerService
{
    public function __construct(protected InventoryService $inventory)
    {
    }

    /**
     * تخصیص دستگاه فیزیکی به مشتری همراه با تعداد، مبلغ و شماره فاکتور.
     *
     * - موجودی انبار به اندازه «تعداد» کسر می‌شود (با بررسی عدم منفی شدن).
     * - مشتری بالقوه به‌صورت خودکار به بالفعل تبدیل می‌شود.
     * - لاگ خروج انبار و تاریخچه مشتری ثبت می‌شود.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function assignPart(Customer $customer, Part $part, array $attributes = [], ?int $userId = null): CustomerPart
    {
        $serialNumber = trim((string) ($attributes['serial_number'] ?? ''));

        if ($serialNumber === '') {
            throw ValidationException::withMessages([
                'serial_number' => ['وارد کردن شماره سریال یکتای دستگاه الزامی است.'],
            ]);
        }

        if (CustomerPart::where('serial_number', $serialNumber)->exists()) {
            throw ValidationException::withMessages([
                'serial_number' => ["شماره سریال {$serialNumber} قبلاً برای دستگاه دیگری در سیستم ثبت شده است."],
            ]);
        }

        $quantity = max(1, (int) ($attributes['quantity'] ?? 1));
        $installDate = $this->parseDate($attributes['installation_date'] ?? null) ?? Carbon::now();
        $warrantyMonths = (int) ($part->periodic_service_months ?: 12);
        $warrantyExpire = (clone $installDate)->addMonths($warrantyMonths);

        return DB::transaction(function () use ($customer, $part, $attributes, $userId, $serialNumber, $quantity, $installDate, $warrantyExpire) {
            /** @var CustomerPart $customerPart */
            $customerPart = $customer->customerParts()->create([
                'part_id' => $part->id,
                'serial_number' => $serialNumber,
                'quantity' => $quantity,
                'invoice_number' => $this->cleanNullable($attributes['invoice_number'] ?? null),
                'invoice_amount' => $this->cleanAmount($attributes['invoice_amount'] ?? null),
                'installation_date' => $installDate->toDateString(),
                'warranty_expire_date' => $warrantyExpire->toDateString(),
                'status' => $attributes['status'] ?? 'active',
                'notes' => $this->cleanNullable($attributes['notes'] ?? null),
                'assigned_by_user_id' => $userId,
            ]);

            // کسر خودکار موجودی انبار + ثبت لاگ خروج (همان Transaction)
            $this->inventory->issue(
                part: $part,
                quantity: $quantity,
                userId: $userId,
                customer: $customer,
                customerPart: $customerPart,
                notes: "تخصیص {$quantity} عدد دستگاه به مشتری «{$customer->full_name}» با شماره سریال {$serialNumber}",
                reference: $customerPart->invoice_number ?: $serialNumber,
            );

            // ثبت در تاریخچه اقدامات مشتری
            $customer->histories()->create([
                'user_id' => $userId,
                'action' => 'part_assigned',
                'description' => $this->describeAssignment($part, $customerPart),
                'metadata' => [
                    'part_id' => $part->id,
                    'part_name' => $part->name,
                    'serial_number' => $serialNumber,
                    'quantity' => $quantity,
                    'invoice_number' => $customerPart->invoice_number,
                    'invoice_amount' => $customerPart->invoice_amount,
                    'warranty_expire_date' => $warrantyExpire->toDateString(),
                    'customer_part_id' => $customerPart->id,
                ],
            ]);

            // تبدیل خودکار «بالقوه» به «بالفعل»
            if ($customer->customer_type === 'potential') {
                $customer->update(['customer_type' => 'effective']);

                $customer->histories()->create([
                    'user_id' => $userId,
                    'action' => 'type_converted',
                    'description' => "وضعیت مشتری به دلیل تحویل دستگاه فیزیکی (سریال {$serialNumber}) از «بالقوه» به «بالفعل» تغییر یافت.",
                    'metadata' => [
                        'previous_type' => 'potential',
                        'new_type' => 'effective',
                        'triggered_by_serial' => $serialNumber,
                    ],
                ]);
            }

            return $customerPart->load(['part', 'assignedBy']);
        });
    }

    /**
     * ویرایش یک تخصیص دستگاه (تعداد، فاکتور، سریال، تاریخ‌ها، وضعیت و توضیحات).
     *
     * تفاوت تعداد با موجودی انبار آشتی داده می‌شود:
     *   افزایش تعداد → کسر مابه‌التفاوت از انبار (خروج)
     *   کاهش تعداد   → بازگشت مابه‌التفاوت به انبار
     *
     * @param  array<string, mixed>  $attributes
     */
    public function updateAssignment(CustomerPart $customerPart, array $attributes = [], ?int $userId = null): CustomerPart
    {
        $customerPart->loadMissing(['part', 'customer']);
        $part = $customerPart->part;

        if (!$part) {
            throw ValidationException::withMessages([
                'part_id' => ['دستگاه مرتبط با این تخصیص در کاتالوگ یافت نشد.'],
            ]);
        }

        $oldQuantity = $customerPart->safeQuantity();
        $newQuantity = array_key_exists('quantity', $attributes) && $attributes['quantity'] !== null
            ? max(1, (int) $attributes['quantity'])
            : $oldQuantity;

        $newSerial = array_key_exists('serial_number', $attributes) && trim((string) $attributes['serial_number']) !== ''
            ? trim((string) $attributes['serial_number'])
            : $customerPart->serial_number;

        if ($newSerial !== $customerPart->serial_number) {
            $exists = CustomerPart::where('serial_number', $newSerial)
                ->whereKeyNot($customerPart->getKey())
                ->exists();

            if ($exists) {
                throw ValidationException::withMessages([
                    'serial_number' => ["شماره سریال {$newSerial} قبلاً برای دستگاه دیگری در سیستم ثبت شده است."],
                ]);
            }
        }

        $changes = [];
        foreach (['quantity', 'invoice_number', 'invoice_amount', 'serial_number', 'installation_date', 'status', 'notes'] as $field) {
            if (array_key_exists($field, $attributes)) {
                $changes[] = $field;
            }
        }

        return DB::transaction(function () use ($customerPart, $part, $attributes, $userId, $oldQuantity, $newQuantity, $newSerial, $changes) {
            $customer = $customerPart->customer;

            $installDate = array_key_exists('installation_date', $attributes)
                ? ($this->parseDate($attributes['installation_date'] ?? null) ?? $customerPart->installation_date)
                : $customerPart->installation_date;

            $warrantyExpire = $installDate
                ? Carbon::parse($installDate)->addMonths((int) ($part->periodic_service_months ?: 12))
                : $customerPart->warranty_expire_date;

            $customerPart->fill([
                'serial_number' => $newSerial,
                'quantity' => $newQuantity,
                'installation_date' => $installDate,
                'warranty_expire_date' => $warrantyExpire,
            ]);

            if (array_key_exists('invoice_number', $attributes)) {
                $customerPart->invoice_number = $this->cleanNullable($attributes['invoice_number']);
            }
            if (array_key_exists('invoice_amount', $attributes)) {
                $customerPart->invoice_amount = $this->cleanAmount($attributes['invoice_amount']);
            }
            if (array_key_exists('status', $attributes) && $attributes['status']) {
                $customerPart->status = $attributes['status'];
            }
            if (array_key_exists('notes', $attributes)) {
                $customerPart->notes = $this->cleanNullable($attributes['notes']);
            }
            if (!empty($attributes['part_id']) && (int) $attributes['part_id'] !== (int) $customerPart->part_id) {
                throw ValidationException::withMessages([
                    'part_id' => ['برای تغییر مدل دستگاه، تخصیص فعلی را حذف و دستگاه جدید را تخصیص دهید تا موجودی انبار درست بماند.'],
                ]);
            }

            $customerPart->save();

            // آشتی دادن موجودی انبار با تعداد جدید
            $delta = $newQuantity - $oldQuantity;
            if ($delta > 0) {
                $this->inventory->issue(
                    part: $part,
                    quantity: $delta,
                    userId: $userId,
                    customer: $customer,
                    customerPart: $customerPart,
                    notes: "افزایش تعداد تخصیص دستگاه از {$oldQuantity} به {$newQuantity} عدد (سریال {$newSerial})",
                    reference: $customerPart->invoice_number ?: $newSerial,
                );
            } elseif ($delta < 0) {
                $this->inventory->returnToStock(
                    part: $part,
                    quantity: abs($delta),
                    userId: $userId,
                    customer: $customer,
                    customerPart: $customerPart,
                    notes: "کاهش تعداد تخصیص دستگاه از {$oldQuantity} به {$newQuantity} عدد و بازگشت به انبار (سریال {$newSerial})",
                    reference: $customerPart->invoice_number ?: $newSerial,
                );
            }

            if ($customer && !empty($changes)) {
                $customer->histories()->create([
                    'user_id' => $userId,
                    'action' => 'device_updated',
                    'description' => "اطلاعات دستگاه تخصیص‌یافته «{$part->name}» (سریال {$newSerial}) ویرایش شد: " . $this->humanChanges($changes) . '.',
                    'metadata' => [
                        'customer_part_id' => $customerPart->id,
                        'changed_fields' => $changes,
                        'quantity' => $newQuantity,
                        'previous_quantity' => $oldQuantity,
                        'invoice_number' => $customerPart->invoice_number,
                        'invoice_amount' => $customerPart->invoice_amount,
                    ],
                ]);
            }

            return $customerPart->load(['part', 'customer', 'assignedBy']);
        });
    }

    /**
     * حذف تخصیص دستگاه از مشتری + بازگشت خودکار تعداد به انبار + ثبت لاگ.
     */
    public function deleteAssignment(CustomerPart $customerPart, ?int $userId = null): void
    {
        $customerPart->loadMissing(['part', 'customer']);
        $part = $customerPart->part;
        $customer = $customerPart->customer;
        $quantity = $customerPart->safeQuantity();
        $serial = $customerPart->serial_number;

        DB::transaction(function () use ($customerPart, $part, $customer, $quantity, $serial, $userId) {
            if ($part && $quantity > 0) {
                $this->inventory->returnToStock(
                    part: $part,
                    quantity: $quantity,
                    userId: $userId,
                    customer: $customer,
                    notes: "حذف تخصیص دستگاه «{$part->name}» با سریال {$serial} و بازگشت {$quantity} عدد به انبار",
                    reference: $customerPart->invoice_number ?: $serial,
                );
            }

            if ($customer) {
                $customer->histories()->create([
                    'user_id' => $userId,
                    'action' => 'device_removed',
                    'description' => $part
                        ? "تخصیص دستگاه «{$part->name}» با سریال {$serial} ({$quantity} عدد) از پرونده مشتری حذف شد و به انبار بازگشت."
                        : "یک رکورد تخصیص دستگاه با سریال {$serial} از پرونده مشتری حذف شد.",
                    'metadata' => [
                        'customer_part_id' => $customerPart->id,
                        'serial_number' => $serial,
                        'quantity' => $quantity,
                        'returned_to_stock' => $quantity,
                    ],
                ]);
            }

            // سوابق سرویس به‌صورت آبشاری حذف می‌شوند (cascadeOnDelete)
            $customerPart->delete();
        });
    }

    /**
     * حذف مشتری همراه با بازگشت همه دستگاه‌های تخصیص‌یافته او به انبار.
     */
    public function deleteCustomer(Customer $customer, ?int $userId = null): void
    {
        DB::transaction(function () use ($customer, $userId) {
            $assignments = $customer->customerParts()->with('part')->get();

            foreach ($assignments as $assignment) {
                if (!$assignment->part) {
                    continue;
                }

                $this->inventory->returnToStock(
                    part: $assignment->part,
                    quantity: $assignment->safeQuantity(),
                    userId: $userId,
                    customer: $customer,
                    notes: "حذف پرونده مشتری «{$customer->full_name}» و بازگشت دستگاه‌های تخصیص‌یافته به انبار",
                    reference: $assignment->invoice_number ?: $assignment->serial_number,
                );
            }

            $customer->delete();
        });
    }

    /**
     * ثبت سابقه سرویس/تعمیر برای یک دستگاه تخصیص‌یافته.
     *
     * @param  array<string, mixed>  $data
     */
    public function recordServiceHistory(CustomerPart $customerPart, array $data, ?int $userId = null): PartServiceHistory
    {
        return DB::transaction(function () use ($customerPart, $data, $userId) {
            /** @var PartServiceHistory $history */
            $history = $customerPart->serviceHistories()->create([
                'performed_by_user_id' => $userId,
                'service_date' => ($this->parseDate($data['service_date'] ?? null) ?? Carbon::now())->toDateString(),
                'service_type' => $data['service_type'] ?? 'repair',
                'description' => $data['description'],
                'cost' => $this->cleanAmount($data['cost'] ?? null),
            ]);

            $customer = $customerPart->customer ?? $customerPart->loadMissing('customer')->customer;

            if ($customer) {
                $customer->histories()->create([
                    'user_id' => $userId,
                    'action' => 'service_performed',
                    'description' => "اقدام سرویس/تعمیر برای دستگاه سریال {$customerPart->serial_number} ثبت گردید.",
                    'metadata' => [
                        'service_history_id' => $history->id,
                        'service_type' => $history->service_type,
                        'cost' => $history->cost,
                    ],
                ]);
            }

            return $history->load('performedBy');
        });
    }

    /**
     * ویرایش سابقه سرویس/تعمیر ثبت‌شده.
     *
     * @param  array<string, mixed>  $data
     */
    public function updateServiceHistory(PartServiceHistory $history, array $data, ?int $userId = null): PartServiceHistory
    {
        return DB::transaction(function () use ($history, $data, $userId) {
            if (array_key_exists('service_date', $data)) {
                $parsed = $this->parseDate($data['service_date'] ?? null);
                if ($parsed) {
                    $history->service_date = $parsed->toDateString();
                }
            }
            if (!empty($data['service_type'])) {
                $history->service_type = $data['service_type'];
            }
            if (array_key_exists('description', $data)) {
                $history->description = $data['description'];
            }
            if (array_key_exists('cost', $data)) {
                $history->cost = $this->cleanAmount($data['cost']);
            }

            $history->save();

            $customer = $history->customerPart?->customer;

            if ($customer) {
                $customer->histories()->create([
                    'user_id' => $userId,
                    'action' => 'service_updated',
                    'description' => "سابقه سرویس/تعمیر مربوط به دستگاه سریال {$history->customerPart?->serial_number} ویرایش شد.",
                    'metadata' => [
                        'service_history_id' => $history->id,
                        'service_type' => $history->service_type,
                        'cost' => $history->cost,
                    ],
                ]);
            }

            return $history->load('performedBy');
        });
    }

    /**
     * حذف سابقه سرویس/تعمیر.
     */
    public function deleteServiceHistory(PartServiceHistory $history, ?int $userId = null): void
    {
        DB::transaction(function () use ($history, $userId) {
            $customerPart = $history->customerPart;
            $customer = $customerPart?->customer;

            if ($customer) {
                $customer->histories()->create([
                    'user_id' => $userId,
                    'action' => 'service_removed',
                    'description' => "یک سابقه سرویس/تعمیر (نوع: {$history->service_type}) برای دستگاه سریال {$customerPart?->serial_number} حذف شد.",
                    'metadata' => [
                        'service_history_id' => $history->id,
                        'service_type' => $history->service_type,
                    ],
                ]);
            }

            $history->delete();
        });
    }

    /**
     * ثبت یادداشت/رویداد دلخواه در تاریخچه مشتری.
     */
    public function logCustomerEvent(Customer $customer, string $action, string $description, ?array $metadata = null, ?int $userId = null): void
    {
        $customer->histories()->create([
            'user_id' => $userId,
            'action' => $action,
            'description' => $description,
            'metadata' => $metadata,
        ]);
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     *  هلپرهای داخلی
     * ─────────────────────────────────────────────────────────────────────────
     */

    protected function describeAssignment(Part $part, CustomerPart $customerPart): string
    {
        $text = "دستگاه «{$part->name}» با شماره سریال {$customerPart->serial_number}";
        $text .= " به تعداد {$customerPart->safeQuantity()} عدد به مشتری تخصیص داده شد.";

        if (!empty($customerPart->invoice_number)) {
            $text .= " (شماره فاکتور: {$customerPart->invoice_number})";
        }

        if ($customerPart->invoice_amount !== null && (float) $customerPart->invoice_amount > 0) {
            $text .= ' مبلغ فاکتور: ' . number_format((float) $customerPart->invoice_amount) . ' تومان';
        }

        return $text;
    }

    /**
     * @param  array<int, string>  $changes
     */
    protected function humanChanges(array $changes): string
    {
        $labels = [
            'quantity' => 'تعداد',
            'invoice_number' => 'شماره فاکتور',
            'invoice_amount' => 'مبلغ فاکتور',
            'serial_number' => 'شماره سریال',
            'installation_date' => 'تاریخ نصب/تحویل',
            'status' => 'وضعیت',
            'notes' => 'توضیحات',
        ];

        $parts = array_map(fn ($field) => $labels[$field] ?? $field, $changes);

        return implode('، ', $parts);
    }

    protected function parseDate(mixed $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof Carbon) {
            return $value;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    protected function cleanNullable(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    protected function cleanAmount(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        // پذیرش ارقام فارسی/عربی و جداکننده هزارگان
        $normalized = str_replace(
            [',', '،', '٬', ' ', '۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'],
            ['', '', '', '', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
            (string) $value
        );

        $normalized = str_replace(
            ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'],
            ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
            $normalized
        );

        if (!is_numeric($normalized)) {
            return null;
        }

        return round((float) $normalized, 2);
    }
}
