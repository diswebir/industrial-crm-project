<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class CustomerPart extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'customer_id',
        'part_id',
        'serial_number',
        'installation_date',
        'warranty_expire_date',
        'status',
        'notes',
        'quantity',
        'invoice_amount',
        'invoice_number',
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

    public function serviceHistories(): HasMany
    {
        return $this->hasMany(PartServiceHistory::class)->latest('service_date');
    }
}
