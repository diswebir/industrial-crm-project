<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class Customer extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'customer_type',
        'type',
        'first_name',
        'last_name',
        'company_name',
        'national_code',
        'mobile',
        'phone',
        'email',
        'province',
        'city',
        'address',
        'notes',
        'created_by_user_id',
    ];

    protected $appends = ['full_name'];

    public function getFullNameAttribute(): string
    {
        $name = trim(($this->first_name ?? '') . ' ' . ($this->last_name ?? ''));
        return $name !== '' ? $name : ($this->company_name ?? '');
    }

    /** Apply the same customer boundary to lists, exports, and related APIs. */
    public function scopeVisibleTo(Builder $query, ?User $user): Builder
    {
        if (!$user) {
            return $query->whereRaw('1 = 0');
        }

        if (!$user->hasRestrictedCustomers() || $user->customer_access_all) {
            return $query;
        }

        return $query->where(function (Builder $query) use ($user): void {
            $query->where('customers.created_by_user_id', $user->id)
                ->orWhereIn('customers.created_by_user_id', DB::table('user_customer_owner_access')
                    ->where('user_id', $user->id)->select('owner_user_id'))
                ->orWhereIn('customers.id', DB::table('user_customer_access')
                    ->where('user_id', $user->id)->select('customer_id'));
        });
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function customerParts(): HasMany
    {
        return $this->hasMany(CustomerPart::class);
    }

    public function parts(): BelongsToMany
    {
        return $this->belongsToMany(Part::class, 'customer_parts')
            ->wherePivotNull('deleted_at')
            ->withPivot(['id', 'serial_number', 'installation_date', 'warranty_expire_date', 'status', 'notes', 'quantity', 'invoice_amount', 'invoice_number'])
            ->withTimestamps();
    }

    public function histories(): HasMany
    {
        return $this->hasMany(CustomerHistory::class)->latest();
    }

    public function smsLogs(): HasMany
    {
        return $this->hasMany(SmsLog::class)->latest();
    }
}
