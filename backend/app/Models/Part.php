<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Part extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
        'periodic_service_months',
        'description',
        'is_active',
        'stock_quantity',
        'min_stock_quantity',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'periodic_service_months' => 'integer',
            'stock_quantity' => 'integer',
            'min_stock_quantity' => 'integer',
        ];
    }

    protected $appends = ['allocated_quantity', 'available_quantity', 'is_low_stock'];

    public function customerParts(): HasMany
    {
        return $this->hasMany(CustomerPart::class);
    }

    public function customers(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'customer_parts')
            ->withPivot([
                'id',
                'serial_number',
                'quantity',
                'invoice_number',
                'invoice_amount',
                'installation_date',
                'warranty_expire_date',
                'status',
                'notes',
            ])
            ->withTimestamps();
    }

    public function inventoryLogs(): HasMany
    {
        return $this->hasMany(InventoryLog::class)->latest();
    }

    /** مجموع تعداد تخصیص‌یافته به مشتریان. */
    public function getAllocatedQuantityAttribute(): int
    {
        // هم alias مورد استفاده در PartController (customer_parts_sum_quantity) و هم
        // alias مورد استفاده در InventoryController (allocated_quantity) پشتیبانی می‌شود
        // تا در فهرست‌ها کوئری اضافی (N+1) اجرا نشود.
        foreach (['customer_parts_sum_quantity', 'allocated_quantity'] as $sumAttribute) {
            if (array_key_exists($sumAttribute, $this->attributes)) {
                return (int) ($this->attributes[$sumAttribute] ?? 0);
            }
        }

        if ($this->relationLoaded('customerParts')) {
            return (int) $this->customerParts->sum('quantity');
        }

        return (int) $this->customerParts()->sum('quantity');
    }

    /** موجودی قابل تخصیص (همان موجودی فعلی انبار). */
    public function getAvailableQuantityAttribute(): int
    {
        return (int) $this->stock_quantity;
    }

    public function getIsLowStockAttribute(): bool
    {
        $min = (int) ($this->min_stock_quantity ?? 0);

        return $min > 0 && (int) $this->stock_quantity <= $min;
    }
}
