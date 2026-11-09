<?php

namespace App\Models;

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
        'quantity',
        'invoice_number',
        'invoice_amount',
        'serial_number',
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
        return $this->hasMany(InventoryLog::class);
    }
}
