<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Support\Facades\DB;

abstract class Controller
{
    /**
     * Returns the case-insensitive LIKE operator for the active database driver.
     *
     * PostgreSQL uses ILIKE for case-insensitive matching, while MySQL/MariaDB
     * use plain LIKE (which is case-insensitive by default with *_ci collations).
     * This keeps search behavior identical across both drivers (e.g. local
     * PostgreSQL via Docker and MySQL on shared cPanel hosting).
     */
    protected function likeOp(): string
    {
        return DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
    }

    /**
     * کاربر وارد شده فعلی (یا null).
     */
    protected function currentUser(): ?User
    {
        $user = auth()->user();

        return $user instanceof User ? $user : null;
    }

    protected function currentUserId(): ?int
    {
        $id = auth()->id();

        return $id === null ? null : (int) $id;
    }

    /**
     * بررسی مجوز مستقیم (Pure ACL) — در صورت نبود دسترسی، پاسخ 403 فارسی.
     */
    protected function authorizePermission(string $permission): void
    {
        $user = $this->currentUser();

        if (!$user || !$user->hasPermissionTo($permission)) {
            abort(403, "شما دسترسی لازم ({$permission}) برای این عملیات را ندارید.");
        }
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     *  اعمال همزمان «مجوز عملیاتی» و «دامنه دسترسی به مشتری» (تسک ۱ — RBAC)
     *
     *  این متد باید در همه کنترلرهایی که با پرونده یک مشتری کار می‌کنند
     *  فراخوانی شود تا محدودیت دسترسی فقط در UI نباشد و با تغییر URL هم
     *  نتوان به مشتریِ متعلق به کارمند دیگری دسترسی پیدا کرد.
     * ─────────────────────────────────────────────────────────────────────────
     */
    protected function authorizeCustomerAccess(?Customer $customer, ?string $permission = null): Customer
    {
        if ($permission !== null) {
            $this->authorizePermission($permission);
        }

        if (!$customer) {
            abort(404, 'مشتری مورد نظر در سامانه یافت نشد.');
        }

        $user = $this->currentUser();

        if (!$user || !$user->canAccessCustomer($customer)) {
            abort(403, 'شما به پرونده این مشتری دسترسی ندارید. در صورت نیاز از مدیر سامانه درخواست دسترسی کنید.');
        }

        return $customer;
    }

    /**
     * آیا کاربر جاری دامنه دسترسی سراسری به مشتریان دارد؟
     */
    protected function userHasGlobalCustomerAccess(): bool
    {
        return (bool) $this->currentUser()?->hasGlobalCustomerAccess();
    }
}
