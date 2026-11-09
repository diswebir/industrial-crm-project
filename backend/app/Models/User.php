<?php

namespace App\Models;

use Filament\Models\Contracts\FilamentUser;
use Filament\Panel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable implements FilamentUser
{
    use HasApiTokens, HasFactory, Notifiable, HasRoles;

    /** نقش‌های سازمانی سامانه (v2.0.0) */
    public const ROLE_ADMINISTRATOR = 'administrator';
    public const ROLE_MANAGER = 'manager';
    public const ROLE_SALESPERSON = 'salesperson';
    public const ROLE_INSTALLER = 'installer';

    /** دامنه دسترسی به مشتریان */
    public const SCOPE_ALL = 'all';
    public const SCOPE_OWN = 'own';

    /**
     * کش درون‌درخواستی برای پرهیز از کوئری تکراری در حلقه‌ها.
     */
    protected ?array $resolvedStaffIds = null;
    protected ?array $resolvedCustomerIds = null;

    public function canAccessPanel(Panel $panel): bool
    {
        return (bool) ($this->is_active && $this->isAdministrator() && ($this->email === 'admin@crm.local' || $this->can('users.manage')));
    }

    /**
     * Returns true if this user is an administrator.
     */
    public function isAdministrator(): bool
    {
        return $this->user_type === self::ROLE_ADMINISTRATOR;
    }

    public function isManager(): bool
    {
        return $this->user_type === self::ROLE_MANAGER;
    }

    /**
     * کارمند فروش — به‌صورت پیش‌فرض فقط مشتریان خودش را می‌بیند.
     */
    public function isSalesperson(): bool
    {
        return $this->user_type === self::ROLE_SALESPERSON;
    }

    /**
     * نصاب — مشتریانِ در دست اقدام خودش را می‌بیند.
     */
    public function isInstaller(): bool
    {
        return $this->user_type === self::ROLE_INSTALLER;
    }

    public function roleKey(): string
    {
        return (string) ($this->user_type ?: self::ROLE_MANAGER);
    }

    public function getRoleLabelAttribute(): string
    {
        return (string) (config("acl.roles.{$this->roleKey()}.label") ?: $this->roleKey());
    }

    /**
     * آیا کاربر به همه مشتریان سامانه دسترسی دارد؟
     */
    public function hasGlobalCustomerAccess(): bool
    {
        if ($this->isAdministrator()) {
            return true;
        }

        // مقدار پیش‌فرض/خالی = all (سازگاری با کاربران قدیمی پروداکشن)
        $scope = $this->customers_scope;

        return $scope === null || $scope === '' || $scope === self::SCOPE_ALL;
    }

    /**
     * شناسه کارمندانی که مدیر، دسترسی به مشتریانِ آن‌ها را به این کاربر داده است.
     *
     * @return array<int, int>
     */
    public function accessibleStaffIds(): array
    {
        if ($this->resolvedStaffIds !== null) {
            return $this->resolvedStaffIds;
        }

        if (!$this->exists) {
            return $this->resolvedStaffIds = [];
        }

        return $this->resolvedStaffIds = $this->accessibleStaff()->pluck('users.id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * شناسه مشتریانی که به‌صورت تکی به این کاربر اعطا شده‌اند.
     *
     * @return array<int, int>
     */
    public function accessibleCustomerIds(): array
    {
        if ($this->resolvedCustomerIds !== null) {
            return $this->resolvedCustomerIds;
        }

        if (!$this->exists) {
            return $this->resolvedCustomerIds = [];
        }

        return $this->resolvedCustomerIds = $this->accessibleCustomers()->pluck('customers.id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * کنترل دسترسی به یک مشتری خاص — تنها مرجع سمت سرور (جلوگیری از دسترسی با تغییر URL).
     */
    public function canAccessCustomer(Customer|int|string|null $customer): bool
    {
        if (!$customer) {
            return false;
        }

        if ($this->hasGlobalCustomerAccess()) {
            return true;
        }

        $id = $customer instanceof Customer ? $customer->getKey() : $customer;

        return Customer::query()->visibleTo($this)->whereKey($id)->exists();
    }

    /**
     * پاک کردن کش داخلی دامنه دسترسی (بعد از تغییر اعطاها).
     */
    public function flushAccessCache(): void
    {
        $this->resolvedStaffIds = null;
        $this->resolvedCustomerIds = null;
    }

    public function accessibleStaff(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'user_staff_access', 'user_id', 'staff_id')
            ->withTimestamps();
    }

    public function accessibleCustomers(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'user_customer_access', 'user_id', 'customer_id')
            ->withTimestamps();
    }

    /**
     * مشتریانی که این کاربر در سامانه ثبت کرده است.
     */
    public function createdCustomers(): HasMany
    {
        return $this->hasMany(Customer::class, 'created_by_user_id');
    }

    public function assignedCustomerParts(): HasMany
    {
        return $this->hasMany(CustomerPart::class, 'assigned_by_user_id');
    }

    public function inventoryLogs(): HasMany
    {
        return $this->hasMany(InventoryLog::class);
    }

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'phone',
        'avatar',
        'password',
        'is_active',
        'user_type',
        'customers_scope',
    ];

    protected $appends = [
        'avatar_url',
    ];

    public function getAvatarUrlAttribute(): ?string
    {
        if (!$this->avatar) {
            return null;
        }

        if (str_starts_with($this->avatar, 'http://') || str_starts_with($this->avatar, 'https://')) {
            return $this->avatar;
        }

        return '/storage/' . ltrim($this->avatar, '/');
    }

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'user_type' => 'string',
            'customers_scope' => 'string',
        ];
    }
}
