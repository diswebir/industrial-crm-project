<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Customer extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_type', // potential | effective
        'type',          // individual | company
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
        'created_by',
    ];

    protected $appends = ['full_name', 'display_name'];

    /**
     * ثبت خودکار مالک پرونده هنگام ساخت (برای مسیرهایی مثل پنل مدیریت Filament که
     * created_by را دستی ست نمی‌کنند). در API این مقدار صریحاً همان کاربر است.
     */
    protected static function booted(): void
    {
        static::creating(function (Customer $customer) {
            if (empty($customer->created_by) && auth()->check()) {
                $customer->created_by = auth()->id();
            }
        });
    }

    /**
     * نام نمایشی مشتری:
     *  - شخص حقوقی → نام شرکت (در صورت خالی بودن، نام/نام‌خانوادگی)
     *  - شخص حقیقی → نام و نام خانوادگی (در صورت خالی بودن، نام شرکت)
     * این accessor همه فهرست‌ها، پرونده‌ها، پیامک‌ها و خروجی اکسل را با مدل داده جدید سازگار می‌کند.
     */
    public function getFullNameAttribute(): string
    {
        $person = trim(($this->first_name ?? '') . ' ' . ($this->last_name ?? ''));

        if ($this->type === 'company') {
            return trim((string) ($this->company_name ?: $person)) ?: 'مشتری بدون نام';
        }

        return $person ?: (trim((string) $this->company_name) ?: 'مشتری بدون نام');
    }

    public function getDisplayNameAttribute(): string
    {
        return $this->getFullNameAttribute();
    }

    public function customerParts(): HasMany
    {
        return $this->hasMany(CustomerPart::class);
    }

    public function parts(): BelongsToMany
    {
        return $this->belongsToMany(Part::class, 'customer_parts')
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

    public function histories(): HasMany
    {
        return $this->hasMany(CustomerHistory::class)->latest();
    }

    public function smsLogs(): HasMany
    {
        return $this->hasMany(SmsLog::class)->latest();
    }

    public function inventoryLogs(): HasMany
    {
        return $this->hasMany(InventoryLog::class)->latest();
    }

    /** کارمندی که این مشتری را ثبت کرده است. */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** دسترسی‌های استثنای اعطاشده روی این مشتری. */
    public function accessGrants(): HasMany
    {
        return $this->hasMany(CustomerAccessGrant::class);
    }

    /**
     * محدود کردن کوئری به مشتریان قابل مشاهده برای یک کاربر.
     * (null = بدون محدودیت؛ استفاده از این scope در همه کوئری‌های لیست/خروجی الزامی است)
     */
    public function scopeVisibleTo(Builder $query, ?User $user): Builder
    {
        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        if ($user->hasFullCustomerAccess()) {
            return $query;
        }

        $grantedStaffIds = CustomerAccessGrant::query()
            ->where('user_id', $user->id)
            ->where('scope_type', 'staff')
            ->whereNotNull('target_user_id')
            ->pluck('target_user_id')
            ->all();

        $grantedCustomerIds = CustomerAccessGrant::query()
            ->where('user_id', $user->id)
            ->where('scope_type', 'customer')
            ->whereNotNull('customer_id')
            ->pluck('customer_id')
            ->all();

        return $query->where(function (Builder $q) use ($user, $grantedStaffIds, $grantedCustomerIds) {
            $q->where('created_by', $user->id);

            if (! empty($grantedStaffIds)) {
                $q->orWhereIn('created_by', $grantedStaffIds);
            }

            if (! empty($grantedCustomerIds)) {
                $q->orWhereIn('id', $grantedCustomerIds);
            }
        });
    }
}
