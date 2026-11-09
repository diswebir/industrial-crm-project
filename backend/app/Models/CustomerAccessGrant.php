<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * دسترسی استثنا برای یک کارمند:
 *  - scope_type = staff    → دیدن/ویرایش مشتریان کارمند مشخص (target_user_id)
 *  - scope_type = customer → دیدن/ویرایش یک مشتری خاص (customer_id)
 */
class CustomerAccessGrant extends Model
{
    use HasFactory;

    public const SCOPE_STAFF = 'staff';
    public const SCOPE_CUSTOMER = 'customer';

    protected $fillable = [
        'user_id',
        'scope_type',
        'target_user_id',
        'customer_id',
        'created_by',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function targetUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'target_user_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
