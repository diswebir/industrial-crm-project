<?php

namespace App\Services\Customers;

use App\Models\Customer;
use App\Models\CustomerAccessGrant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * کنترل دسترسی سطح ردیف (Row Level Access) برای مشتریان.
 *
 * قواعد:
 *  1) کاربر با data_scope = all (و همه مدیران) → دسترسی کامل.
 *  2) در غیر این صورت:
 *        customers.created_by = user.id
 *        OR customers.created_by IN (کارمندانی که grant نوع staff دارند)
 *        OR customers.id IN (مشتریانی که grant نوع customer دارند)
 *
 * این سرویس هم در لیست‌ها (scope) و هم در show/update/delete (canView/canEdit) استفاده می‌شود
 * تا دسترسی با تغییر URL قابل دور زدن نباشد.
 */
class CustomerAccessService
{
    /** @var array<int, array{staff: int[], customers: int[]}> */
    private array $grantCache = [];

    public function hasFullAccess(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return $user->hasFullCustomerAccess();
    }

    /**
     * اعمال دامنه دسترسی روی کوئری.
     */
    public function scope(Builder $query, ?User $user): Builder
    {
        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        if ($this->hasFullAccess($user)) {
            return $query;
        }

        return $query->visibleTo($user);
    }

    /**
     * @return array{staff: int[], customers: int[]}
     */
    public function grantsFor(User $user): array
    {
        if (isset($this->grantCache[$user->id])) {
            return $this->grantCache[$user->id];
        }

        $rows = CustomerAccessGrant::query()
            ->where('user_id', $user->id)
            ->get(['scope_type', 'target_user_id', 'customer_id']);

        $staff = $rows
            ->where('scope_type', CustomerAccessGrant::SCOPE_STAFF)
            ->pluck('target_user_id')
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        $customers = $rows
            ->where('scope_type', CustomerAccessGrant::SCOPE_CUSTOMER)
            ->pluck('customer_id')
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        return $this->grantCache[$user->id] = [
            'staff' => $staff,
            'customers' => $customers,
        ];
    }

    public function canView(?User $user, ?Customer $customer): bool
    {
        if (! $user || ! $customer) {
            return false;
        }

        if ($this->hasFullAccess($user)) {
            return true;
        }

        if ((int) $customer->created_by === (int) $user->id) {
            return true;
        }

        $grants = $this->grantsFor($user);

        if (in_array((int) $customer->id, $grants['customers'], true)) {
            return true;
        }

        return $customer->created_by !== null
            && in_array((int) $customer->created_by, $grants['staff'], true);
    }

    /**
     * در این سامانه ویرایش و حذف مشتری همان دامنه مشاهده را دارد.
     */
    public function canEdit(?User $user, ?Customer $customer): bool
    {
        return $this->canView($user, $customer);
    }

    public function authorizeView(?User $user, Customer $customer): void
    {
        if (! $this->canView($user, $customer)) {
            abort(403, 'شما به این مشتری دسترسی ندارید. برای دریافت دسترسی با مدیر سیستم تماس بگیرید.');
        }
    }

    public function authorizeEdit(?User $user, Customer $customer): void
    {
        if (! $this->canEdit($user, $customer)) {
            abort(403, 'شما اجازه ویرایش یا تخصیص برای این مشتری را ندارید.');
        }
    }

    /**
     * شناسه کاربرانی که مشتریانشان برای این کاربر قابل مشاهده است
     * (برای نمایش فیلتر «کارشناس» در UI). null = بدون محدودیت.
     *
     * @return int[]|null
     */
    public function visibleStaffIds(User $user): ?array
    {
        if ($this->hasFullAccess($user)) {
            return null;
        }

        $grants = $this->grantsFor($user);

        return array_values(array_unique(array_merge([(int) $user->id], $grants['staff'])));
    }

    /**
     * مشتریان قابل مشاهده برای یک کارمند (id فقط) — برای خروجی اکسل و گزارش‌ها.
     *
     * @return int[]
     */
    public function visibleCustomerIds(User $user): array
    {
        return $this->scope(Customer::query(), $user)->pluck('id')->map(fn ($id) => (int) $id)->all();
    }
}
