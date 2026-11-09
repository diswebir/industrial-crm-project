<?php

namespace App\Services\Inventory;

use App\Models\Customer;
use App\Models\CustomerPart;
use App\Models\InventoryLog;
use App\Models\Part;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;

class InventoryService
{
    public const MAX_STOCK = 2147483647;

    /** Manual stock movements always lock the device and log in one transaction. */
    public function adjust(Part $part, string $type, int $quantity, User $user, ?string $note = null): InventoryLog
    {
        return DB::transaction(function () use ($part, $type, $quantity, $user, $note): InventoryLog {
            $locked = Part::query()->whereKey($part->id)->lockForUpdate()->firstOrFail();
            $delta = $type === 'in' ? $quantity : -$quantity;
            return $this->apply($locked, $delta, $type === 'in' ? 'stock_in' : 'stock_out', $user, null, null, $note);
        }, 3);
    }

    /**
     * The caller must hold a row lock on $part in an active transaction.
     * The before/after values and actor/customer snapshots survive later edits.
     */
    public function apply(
        Part $part,
        int $delta,
        string $type,
        User $user,
        ?Customer $customer = null,
        ?CustomerPart $assignment = null,
        ?string $note = null,
    ): InventoryLog {
        if (DB::transactionLevel() < 1 || $delta === 0) {
            throw new LogicException('Inventory movements require a transaction and a non-zero quantity.');
        }

        $before = (int) $part->stock_quantity;
        $after = $before + $delta;
        if ($after < 0) {
            throw ValidationException::withMessages(['quantity' => ['موجودی دستگاه برای این عملیات کافی نیست.']]);
        }
        if ($after > self::MAX_STOCK) {
            throw ValidationException::withMessages(['quantity' => ['موجودی از حد مجاز بیشتر می‌شود.']]);
        }

        $part->stock_quantity = $after;
        $part->save();

        return InventoryLog::create([
            'part_id' => $part->id,
            'customer_part_id' => $assignment?->id,
            'customer_id' => $customer?->id,
            'user_id' => $user->id,
            'type' => $type,
            'quantity' => abs($delta),
            'balance_before' => $before,
            'balance_after' => $after,
            'user_name' => $user->name,
            'customer_name' => $customer?->full_name,
            'note' => $note,
        ]);
    }
}
