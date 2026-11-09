<?php

namespace App\Services\Inventory;

use App\Models\Customer;
use App\Models\CustomerPart;
use App\Models\InventoryLog;
use App\Models\Part;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * موتور کنترل موجودی انبار.
 *
 * همه تراکنش‌ها داخل DB::transaction و با قفل ردیف (lockForUpdate) انجام می‌شوند تا در
 * درخواست‌های هم‌زمان موجودی منفی ثبت نشود. هر جابه‌جایی موجودی یک ردیف در inventory_logs
 * با «موجودی بعد از تراکنش» ثبت می‌کند.
 */
class InventoryService
{
    /**
     * ثبت یک تراکنش انبار.
     *
     * @param  string  $type      یکی از InventoryLog::TYPE_*
     * @param  int     $quantity  برای in/out/return مقدار مثبت جابه‌جایی؛ برای adjust مقدار «موجودی نهایی»
     */
    public function record(
        Part $part,
        string $type,
        int $quantity,
        ?int $userId = null,
        ?Customer $customer = null,
        ?CustomerPart $customerPart = null,
        ?string $note = null
    ): InventoryLog {
        if (! array_key_exists($type, InventoryLog::TYPE_LABELS)) {
            throw ValidationException::withMessages([
                'type' => ['نوع تراکنش انبار نامعتبر است.'],
            ]);
        }

        if ($type !== InventoryLog::TYPE_ADJUST && $quantity < 0) {
            throw ValidationException::withMessages([
                'quantity' => ['تعداد نمی‌تواند عدد منفی باشد.'],
            ]);
        }

        return DB::transaction(function () use ($part, $type, $quantity, $userId, $customer, $customerPart, $note) {
            /** @var Part $locked */
            $locked = Part::query()->whereKey($part->getKey())->lockForUpdate()->firstOrFail();

            $current = (int) $locked->stock_quantity;

            $newStock = match ($type) {
                InventoryLog::TYPE_IN, InventoryLog::TYPE_RETURN => $current + $quantity,
                InventoryLog::TYPE_OUT => $current - $quantity,
                InventoryLog::TYPE_ADJUST => $quantity,
                default => $current,
            };

            if ($newStock < 0) {
                throw ValidationException::withMessages([
                    'quantity' => [
                        "موجودی انبار دستگاه «{$locked->name}» کافی نیست. موجودی فعلی: {$current} عدد و درخواست: {$quantity} عدد.",
                    ],
                ]);
            }

            if ($type === InventoryLog::TYPE_OUT && $current < $quantity) {
                throw ValidationException::withMessages([
                    'quantity' => [
                        "موجودی انبار دستگاه «{$locked->name}» کافی نیست. موجودی فعلی: {$current} عدد و درخواست: {$quantity} عدد.",
                    ],
                ]);
            }

            $movedQuantity = $type === InventoryLog::TYPE_ADJUST
                ? abs($newStock - $current)
                : $quantity;

            if ($newStock !== $current) {
                $locked->stock_quantity = $newStock;
                $locked->save();
            }

            $log = InventoryLog::create([
                'part_id' => $locked->id,
                'user_id' => $userId,
                'customer_id' => $customer?->id,
                'customer_part_id' => $customerPart?->id,
                'type' => $type,
                'quantity' => $movedQuantity,
                'stock_after' => $newStock,
                'note' => $note,
            ]);

            // مدل فراخوان (که ممکن است شیء قدیمی باشد) با موجودی واقعی همگام می‌شود.
            $part->stock_quantity = $newStock;
            $part->syncOriginalAttribute('stock_quantity');

            return $log;
        });
    }

    /**
     * ورود کالا به انبار.
     */
    public function stockIn(Part $part, int $quantity, ?int $userId = null, ?string $note = null): InventoryLog
    {
        if ($quantity < 1) {
            throw ValidationException::withMessages([
                'quantity' => ['تعداد ورود کالا باید حداقل ۱ عدد باشد.'],
            ]);
        }

        return $this->record($part, InventoryLog::TYPE_IN, $quantity, $userId, null, null, $note ?: 'ورود کالا به انبار');
    }

    /**
     * خروج دستی کالا از انبار (بدون تخصیص به مشتری).
     */
    public function stockOut(Part $part, int $quantity, ?int $userId = null, ?string $note = null): InventoryLog
    {
        if ($quantity < 1) {
            throw ValidationException::withMessages([
                'quantity' => ['تعداد خروج کالا باید حداقل ۱ عدد باشد.'],
            ]);
        }

        return $this->record($part, InventoryLog::TYPE_OUT, $quantity, $userId, null, null, $note ?: 'خروج کالا از انبار');
    }

    /**
     * اصلاح موجودی به عدد مشخص (مثلاً پس از انبارگردانی).
     */
    public function adjustTo(Part $part, int $newStock, ?int $userId = null, ?string $note = null): InventoryLog
    {
        if ($newStock < 0) {
            throw ValidationException::withMessages([
                'quantity' => ['موجودی نمی‌تواند منفی باشد.'],
            ]);
        }

        return $this->record($part, InventoryLog::TYPE_ADJUST, $newStock, $userId, null, null, $note ?: 'اصلاح موجودی انبار');
    }
}
