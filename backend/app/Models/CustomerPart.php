<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerPart extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_id',
        'part_id',
        'serial_number',
        'quantity',
        'invoice_number',
        'invoice_amount',
        'installation_date',
        'warranty_expire_date',
        'status', // active | under_repair | replaced | retired
        'notes',
        'assigned_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'installation_date' => 'date',
            'warranty_expire_date' => 'date',
            'quantity' => 'integer',
            'invoice_amount' => 'decimal:2',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function part(): BelongsTo
    {
        return $this->belongsTo(Part::class);
    }

    /**
     * کارمندی که این دستگاه را به مشتری تخصیص داده است.
     */
    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by_user_id');
    }

    public function serviceHistories(): HasMany
    {
        return $this->hasMany(PartServiceHistory::class)->latest('service_date');
    }

    public function inventoryLogs(): HasMany
    {
        return $this->hasMany(InventoryLog::class)->latest();
    }

    /**
     * تعداد امن (همیشه حداقل ۱) برای محاسبات انبار.
     */
    public function safeQuantity(): int
    {
        return max(1, (int) $this->quantity);
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     *  محدود کردن تخصیص‌ها به مشتریانِ قابل مشاهده توسط کاربر (تسک ۱ — RBAC)
     *
     *  در صفحه کاتالوگ دستگاه‌ها و لاگ انبار استفاده می‌شود تا کارمند فروش
     *  نتواند از طریق «دستگاه» به اطلاعات مشتریانِ دیگر کارمندان دست پیدا کند.
     * ─────────────────────────────────────────────────────────────────────────
     */
    public function scopeVisibleTo(Builder $query, ?User $user): Builder
    {
        if (!$user) {
            return $query->whereRaw('1 = 0');
        }

        if ($user->hasGlobalCustomerAccess()) {
            return $query;
        }

        return $query->whereIn(
            'customer_parts.customer_id',
            Customer::query()->visibleTo($user)->select('customers.id')
        );
    }
}
