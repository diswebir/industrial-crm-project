<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

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
        'created_by_user_id',
    ];

    protected $appends = ['full_name'];

    /**
     * عنوان نمایشی مشتری.
     *
     * برای مشتری حقوقی که «نام و نام خانوادگی» ندارد (از v2.0.0 اختیاری است)،
     * نام شرکت جایگزین می‌شود تا هیچ‌جای سامانه عنوان خالی نمایش داده نشود.
     */
    public function getFullNameAttribute(): string
    {
        $name = trim("{$this->first_name} {$this->last_name}");

        if ($name !== '') {
            return $name;
        }

        if (!empty($this->company_name)) {
            return (string) $this->company_name;
        }

        return 'مشتری #' . $this->id;
    }

    /**
     * نام شرکت یا نام شخص — برای فهرست‌ها و خروجی اکسل.
     */
    public function getDisplayNameAttribute(): string
    {
        return $this->full_name;
    }

    public function createdBy(): BelongsTo
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

    /**
     * کاربرانِ دارای دسترسی اعطاشده به این مشتری (از طرف مدیر سیستم).
     */
    public function grantedUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_customer_access')
            ->withTimestamps();
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     *  دامنه دسترسی (تسک ۱ — RBAC)
     *
     *  این Scope تنها مرجع اعمال محدودیت «کارمند فروش فقط مشتریان خودش را
     *  می‌بیند» در سمت سرور است و در همه کوئری‌ها (فهرست، جزییات، ویرایش،
     *  حذف، خروجی اکسل، تخصیص دستگاه و آمار داشبورد) استفاده می‌شود؛ بنابراین
     *  با تغییر دستی URL هم نمی‌توان مشتری متعلق به دیگری را مشاهده کرد.
     * ─────────────────────────────────────────────────────────────────────────
     */
    public function scopeVisibleTo(Builder $query, ?User $user): Builder
    {
        if (!$user) {
            return $query->whereRaw('1 = 0');
        }

        // مدیران و کاربران با دامنه سراسری → بدون محدودیت
        if ($user->hasGlobalCustomerAccess()) {
            return $query;
        }

        $staffIds = $user->accessibleStaffIds();
        $grantedCustomerIds = $user->accessibleCustomerIds();

        return $query->where(function (Builder $q) use ($user, $staffIds, $grantedCustomerIds) {
            // ۱) مشتریان ثبت‌شده توسط خود کاربر
            $q->where('customers.created_by_user_id', $user->id);

            // ۲) مشتریانِ تکی که مدیر صراحتاً به او داده است
            if (!empty($grantedCustomerIds)) {
                $q->orWhereIn('customers.id', $grantedCustomerIds);
            }

            // ۳) مشتریانِ یک یا چند کارمند خاص دیگر
            if (!empty($staffIds)) {
                $q->orWhereIn('customers.created_by_user_id', $staffIds);
            }

            // ۴) مشتریانی که کاربر روی آن‌ها اقدام فنی انجام داده (تخصیص دستگاه)
            $q->orWhereExists(function ($sub) use ($user) {
                $sub->select(DB::raw(1))
                    ->from('customer_parts')
                    ->whereColumn('customer_parts.customer_id', 'customers.id')
                    ->where('customer_parts.assigned_by_user_id', $user->id);
            });

            // ۵) مشتریانی که کاربر برایشان سابقه سرویس/نصب ثبت کرده (نقش نصاب)
            $q->orWhereExists(function ($sub) use ($user) {
                $sub->select(DB::raw(1))
                    ->from('part_service_histories')
                    ->join('customer_parts', 'customer_parts.id', '=', 'part_service_histories.customer_part_id')
                    ->whereColumn('customer_parts.customer_id', 'customers.id')
                    ->where('part_service_histories.performed_by_user_id', $user->id);
            });
        });
    }
}
