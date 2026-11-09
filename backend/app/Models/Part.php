<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Part extends Model
{
    use HasFactory;

    // Stock can only be changed through InventoryService, never mass assignment.
    protected $fillable = [
        'name',
        'code',
        'periodic_service_months',
        'description',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'periodic_service_months' => 'integer',
            'stock_quantity' => 'integer',
        ];
    }

    public function customerParts(): HasMany
    {
        return $this->hasMany(CustomerPart::class);
    }

    public function inventoryLogs(): HasMany
    {
        return $this->hasMany(InventoryLog::class);
    }

    public function customers(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'customer_parts')
            ->wherePivotNull('deleted_at')
            ->withPivot(['id', 'serial_number', 'installation_date', 'warranty_expire_date', 'status', 'notes', 'quantity', 'invoice_amount', 'invoice_number'])
            ->withTimestamps();
    }
}
