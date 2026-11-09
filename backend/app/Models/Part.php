<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
        'unit_label',
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

    public function customerParts(): HasMany
    {
        return $this->hasMany(CustomerPart::class);
    }

    public function inventoryLogs(): HasMany
    {
        return $this->hasMany(InventoryLog::class)->latest();
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
                'assigned_by_user_id',
            ])
            ->withTimestamps();
    }

    /**
     * آیا موجودی این دستگاه به حد هشدار کمبود رسیده است؟
     */
    public function isLowStock(): bool
    {
        return $this->min_stock_quantity > 0 && $this->stock_quantity <= $this->min_stock_quantity;
    }

    public function getIsLowStockAttribute(): bool
    {
        return $this->isLowStock();
    }
}
