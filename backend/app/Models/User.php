<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Filament\Models\Contracts\FilamentUser;
use Filament\Panel;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable implements FilamentUser
{
    use HasApiTokens, HasFactory, Notifiable, HasRoles;

    /**
     * نقش‌های سیستمی مجاز (Pure ACL: نقش فقط برچسب سازمانی است و دسترسی از مجوزهای مستقیم می‌آید).
     */
    public const USER_TYPES = [
        'administrator',
        'manager',
        'salesperson',
        'installer',
    ];

    public const DATA_SCOPES = [
        'all',    // همه مشتریان سامانه
        'own',    // فقط مشتریان ثبت‌شده توسط خود کاربر
        'custom', // مشتریان خودم + استثناهای تعریف‌شده در customer_access_grants
    ];

    public const USER_TYPE_LABELS = [
        'administrator' => 'مدیر ارشد',
        'manager' => 'مدیر',
        'salesperson' => 'کارمند فروش',
        'installer' => 'نصاب',
    ];

    /**
     * مدیر اصلی سامانه = حساب اول نصب (شناسه ۱). ایمیل ممکن است در نصب‌کننده
     * به ایمیل مالک تغییر کند؛ بنابراین شناسه، معیار پایدار است.
     */
    public function isRootAdmin(): bool
    {
        return (int) $this->getKey() === 1;
    }

    public function canAccessPanel(Panel $panel): bool
    {
        return (bool) ($this->is_active && $this->isAdministrator() && ($this->isRootAdmin() || $this->can('users.manage')));
    }

    protected static function booted(): void
    {
        // هر مسیری که کاربر را غیرفعال کند (API یا پنل) باید توکن‌های فعال او را باطل کند.
        // نقش/وضعیت/دامنه مدیر اصلی در هیچ مسیری (API، پنل، پروفایل) قابل تغییر نیست.
        // ایمیل در نصب‌کننده یک‌بار به ایمیل مالک تغییر می‌کند؛ محافظت با شناسه ۱
        // باقی می‌ماند.
        static::updating(function (User $user) {
            if ((int) $user->getOriginal('id') === 1) {
                $user->is_active = true;
                $user->user_type = 'administrator';
                $user->data_scope = 'all';
            }
        });

        static::updated(function (User $user) {
            if ($user->wasChanged('is_active') && ! $user->is_active) {
                $user->tokens()->delete();
            }
        });
    }

    /**
     * Returns true if this user is an administrator.
     */
    public function isAdministrator(): bool
    {
        return $this->user_type === 'administrator';
    }

    public function isSalesperson(): bool
    {
        return $this->user_type === 'salesperson';
    }

    public function isInstaller(): bool
    {
        return $this->user_type === 'installer';
    }

    /**
     * آیا این کاربر به همه مشتریان سامانه دسترسی دارد؟
     * کاربران قبلی سامانه به صورت پیش‌فرض data_scope=all دارند تا دسترسی‌شان تغییر نکند.
     */
    public function hasFullCustomerAccess(): bool
    {
        return $this->isAdministrator() || ($this->data_scope ?? 'all') === 'all';
    }

    public function userTypeLabel(): string
    {
        return self::USER_TYPE_LABELS[$this->user_type] ?? (string) $this->user_type;
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
        'data_scope',
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
            'data_scope' => 'string',
        ];
    }
}
