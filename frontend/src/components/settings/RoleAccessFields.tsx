import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ShieldCheck, UserCheck, UserPlus, Users, X } from 'lucide-react'
import { aclApi } from '../../services/api'
import { cx, num } from '../../utils/format'
import { CUSTOMER_SCOPE_OPTIONS, USER_ROLE_OPTIONS, customerScopeLabel, userRoleLabel } from '../../utils/meta'
import type { AclRole, CustomerScope, UserRole } from '../../types'

export interface RoleAccessValue {
  user_type: UserRole
  customers_scope: CustomerScope
  accessible_staff_ids: number[]
  accessible_customer_ids: number[]
}

interface RoleAccessFieldsProps {
  value: RoleAccessValue
  onChange: (next: RoleAccessValue) => void
  /** آیا کاربر جاری «مدیر ارشد» است (تعیین‌کننده نقش‌های قابل اعطا) */
  isAdministrator: boolean
  /** قفل بودن نقش (مثلاً حساب admin@crm.local) */
  lockRole?: boolean
  /** شناسه کاربر در حال ویرایش — از فهرست کارکنان حذف می‌شود */
  excludeUserId?: number | string
  /** اعمال پیش‌فرض مجوزهای نقش توسط والد */
  onApplyRoleDefaults?: (permissions: string[]) => void
}

const ROLE_ICONS: Record<UserRole, typeof Users> = {
  administrator: ShieldCheck,
  manager: UserCheck,
  salesperson: UserPlus,
  installer: Users,
}

const ROLE_TONES: Record<UserRole, string> = {
  administrator: 'border-amber-500 bg-amber-50/60 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200',
  manager: 'border-primary bg-primary/5 text-primary',
  salesperson: 'border-sky-500 bg-sky-50/60 text-sky-900 dark:bg-sky-950/20 dark:text-sky-200',
  installer: 'border-emerald-500 bg-emerald-50/60 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200',
}

/**
 * انتخاب نقش سازمانی، دامنه دسترسی به مشتریان و استثنائهای اعطاشده (تسک ۱).
 *
 * سه سطح استثنا که مدیر می‌تواند به یک کارمند فروش اعطا کند:
 *  ۱) همه مشتریان سامانه (customers_scope = all)
 *  ۲) مشتریان یک یا چند کارمند مشخص (accessible_staff_ids)
 *  ۳) یک یا چند مشتری تکی (accessible_customer_ids)
 */
export function RoleAccessFields({
  value,
  onChange,
  isAdministrator,
  lockRole = false,
  excludeUserId,
  onApplyRoleDefaults,
}: RoleAccessFieldsProps) {
  const [staffQuery, setStaffQuery] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')

  const { data: acl } = useQuery({
    queryKey: ['acl-roles'],
    queryFn: aclApi.roles,
    staleTime: 60_000,
  })

  const { data: staff = [] } = useQuery({
    queryKey: ['acl-staff'],
    queryFn: aclApi.staff,
    staleTime: 60_000,
  })

  const { data: customerResults = [], isFetching: customerLoading } = useQuery({
    queryKey: ['acl-customers', customerQuery],
    queryFn: () => aclApi.customers(customerQuery.trim() || undefined),
    enabled: value.customers_scope === 'own',
    staleTime: 30_000,
  })

  /** نقش‌های قابل اعطا — از سرور یا فهرست محلی */
  const roles = useMemo<AclRole[]>(() => {
    if (acl?.roles?.length) return acl.roles
    return USER_ROLE_OPTIONS.map((o) => ({
      key: o.value,
      label: o.label,
      description: o.hint,
      default_scope: o.value === 'administrator' || o.value === 'manager' ? 'all' : 'own',
      default_permissions: [],
      assignable: isAdministrator ? true : o.value !== 'administrator',
    }))
  }, [acl, isAdministrator])

  const visibleRoles = roles.filter((r) => r.assignable || r.key === value.user_type)

  const selectableStaff = useMemo(() => {
    const term = staffQuery.trim().toLowerCase()
    return staff
      .filter((s) => String(s.id) !== String(excludeUserId ?? ''))
      .filter((s) => !term || s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term))
  }, [staff, staffQuery, excludeUserId])

  const selectedCustomers = useMemo(() => {
    const byId = new Map<number, string>()
    customerResults.forEach((c) => byId.set(Number(c.id), c.label))
    ;(value.accessible_customer_ids ?? []).forEach((id) => {
      if (!byId.has(Number(id))) byId.set(Number(id), `مشتری شماره ${num(id)}`)
    })
    return [...byId.entries()].map(([id, label]) => ({ id, label }))
  }, [customerResults, value.accessible_customer_ids])

  const setRole = (role: UserRole) => {
    if (lockRole) return
    const preset = roles.find((r) => r.key === role)
    const nextScope: CustomerScope =
      preset?.default_scope === 'all' && !isAdministrator && value.customers_scope === 'own'
        ? 'own'
        : (preset?.default_scope as CustomerScope) ?? value.customers_scope

    onChange({
      ...value,
      user_type: role,
      customers_scope: nextScope,
      accessible_staff_ids: nextScope === 'all' ? [] : value.accessible_staff_ids,
      accessible_customer_ids: nextScope === 'all' ? [] : value.accessible_customer_ids,
    })
  }

  const setScope = (scope: CustomerScope) => {
    if (!isAdministrator && scope === 'all' && value.customers_scope !== 'all') {
      return // ارتقای دامنه به «همه مشتریان» فقط توسط مدیر ارشد
    }
    onChange({
      ...value,
      customers_scope: scope,
      accessible_staff_ids: scope === 'all' ? [] : value.accessible_staff_ids,
      accessible_customer_ids: scope === 'all' ? [] : value.accessible_customer_ids,
    })
  }

  const toggleStaff = (id: number) => {
    const list = value.accessible_staff_ids ?? []
    onChange({
      ...value,
      accessible_staff_ids: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    })
  }

  const addCustomer = (id: number) => {
    const list = value.accessible_customer_ids ?? []
    if (list.includes(id)) return
    onChange({ ...value, accessible_customer_ids: [...list, id] })
  }

  const removeCustomer = (id: number) => {
    onChange({
      ...value,
      accessible_customer_ids: (value.accessible_customer_ids ?? []).filter((x) => x !== id),
    })
  }

  const activeRole = roles.find((r) => r.key === value.user_type)
  const isOwn = value.customers_scope === 'own'

  // پاک کردن جستجوی مشتریان هنگام تغییر دامنه
  useEffect(() => {
    if (!isOwn) setCustomerQuery('')
  }, [isOwn])

  return (
    <div className="space-y-5">
      {/* ── نقش سازمانی */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <div>
          <p className="text-xs font-bold text-base-content">نقش سازمانی کاربر</p>
          <p className="mt-0.5 text-[11px] text-base-content/60">
            {lockRole
              ? 'این حساب، مدیر ارشد اصلی سامانه است و نقش آن تغییرناپذیر است.'
              : isAdministrator
                ? 'نقش کاربر را انتخاب کنید؛ دامنه دسترسی و مجوزهای پیش‌فرض بر اساس نقش پیشنهاد می‌شود.'
                : 'شما فقط می‌توانید نقش‌های غیر از «مدیر ارشد» را اعطا کنید.'}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleRoles.map((role) => {
            const Icon = ROLE_ICONS[role.key] ?? ShieldCheck
            const active = value.user_type === role.key
            return (
              <label
                key={role.key}
                className={cx(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all',
                  active
                    ? cx('shadow-xs', ROLE_TONES[role.key] ?? 'border-primary bg-primary/5 text-primary')
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                  lockRole && 'cursor-not-allowed opacity-70',
                )}
              >
                <input
                  type="radio"
                  name="user_type"
                  value={role.key}
                  disabled={lockRole}
                  checked={active}
                  onChange={() => setRole(role.key)}
                  className="radio radio-primary radio-sm mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                    <Icon className="size-3.5" />
                    {role.label || userRoleLabel[role.key]}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-base-content/60">{role.description}</p>
                  <p className="mt-1 text-[10px] text-base-content/45">
                    دامنه پیش‌فرض: {customerScopeLabel[role.default_scope] ?? role.default_scope}
                  </p>
                </div>
              </label>
            )
          })}
        </div>

        {onApplyRoleDefaults && activeRole && activeRole.default_permissions?.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-xs btn-outline btn-primary"
              onClick={() => onApplyRoleDefaults(activeRole.default_permissions)}
            >
              اعمال مجوزهای پیش‌فرض نقش «{activeRole.label}»
            </button>
            <span className="text-[11px] text-base-content/50">
              {num(activeRole.default_permissions.length)} مجوز پیش‌فرض برای این نقش تعریف شده است.
            </span>
          </div>
        )}
      </div>

      {/* ── دامنه دسترسی به مشتریان */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <div>
          <p className="text-xs font-bold text-base-content">دامنه دسترسی به مشتریان (RBAC)</p>
          <p className="mt-0.5 text-[11px] text-base-content/60">
            این محدودیت هم در رابط کاربری و هم در پرس‌و‌جوهای سمت سرور اعمال می‌شود؛ دسترسی با تغییر آدرس صفحه
            امکان‌پذیر نیست.
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CUSTOMER_SCOPE_OPTIONS.map((opt) => {
            const active = value.customers_scope === opt.value
            const blocked = !isAdministrator && opt.value === 'all' && value.customers_scope !== 'all'
            return (
              <label
                key={opt.value}
                className={cx(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all',
                  active
                    ? 'border-primary bg-primary/5 text-primary shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                  blocked && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="radio"
                  name="customers_scope"
                  value={opt.value}
                  checked={active}
                  disabled={blocked}
                  onChange={() => setScope(opt.value)}
                  className="radio radio-primary radio-sm mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-base-content">{opt.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-base-content/60">{opt.hint}</p>
                  {blocked && (
                    <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                      ارتقای دامنه به «همه مشتریان» فقط توسط مدیر ارشد ممکن است.
                    </p>
                  )}
                </div>
              </label>
            )
          })}
        </div>
      </div>

      {/* ── استثناهای دسترسی (فقط در دامنه «فقط مشتریان خودش») */}
      {isOwn && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* استثنای ۱: کارمندان مشخص */}
          <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
            <div className="flex items-center justify-between gap-2 pb-3">
              <div>
                <p className="text-xs font-bold">دسترسی به مشتریانِ کارمندان مشخص</p>
                <p className="mt-0.5 text-[10px] text-base-content/55">
                  با انتخاب هر کارمند، همه مشتریان ثبت‌شده توسط او (و مشتریان بعدی‌اش) در دسترس این کاربر قرار می‌گیرد.
                </p>
              </div>
              <span className="badge badge-primary badge-sm font-bold">{num(value.accessible_staff_ids?.length ?? 0)}</span>
            </div>

            <div className="relative mb-2">
              <Search className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 text-base-content/40" />
              <input
                type="text"
                value={staffQuery}
                onChange={(e) => setStaffQuery(e.target.value)}
                placeholder="جستجوی کارمند..."
                className="input input-bordered input-sm w-full pe-9 text-xs"
              />
            </div>

            <div className="max-h-56 space-y-1 overflow-y-auto pe-1">
              {!selectableStaff.length ? (
                <p className="py-4 text-center text-[11px] text-base-content/45">کارمندی یافت نشد.</p>
              ) : (
                selectableStaff.map((s) => {
                  const checked = (value.accessible_staff_ids ?? []).includes(Number(s.id))
                  return (
                    <label
                      key={s.id}
                      className={cx(
                        'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-xs transition-colors',
                        checked
                          ? 'border-primary bg-primary/5'
                          : 'border-base-200 bg-base-100 hover:border-primary/40',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-primary checkbox-xs"
                        checked={checked}
                        onChange={() => toggleStaff(Number(s.id))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{s.name}</span>
                        <span className="block truncate text-[10px] text-base-content/50" dir="ltr">
                          {s.email}
                        </span>
                      </span>
                      <span className="badge badge-ghost badge-xs font-normal">{s.role_label}</span>
                    </label>
                  )
                })
              )}
            </div>
          </div>

          {/* استثنای ۲: مشتریان تکی */}
          <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
            <div className="flex items-center justify-between gap-2 pb-3">
              <div>
                <p className="text-xs font-bold">دسترسی به مشتریان تکی (استثنا)</p>
                <p className="mt-0.5 text-[10px] text-base-content/55">
                  فقط مشتریانی که اینجا انتخاب می‌شوند، فارغ از ثبت‌کننده‌شان، در دسترس این کاربر خواهند بود.
                </p>
              </div>
              <span className="badge badge-primary badge-sm font-bold">
                {num(value.accessible_customer_ids?.length ?? 0)}
              </span>
            </div>

            <div className="relative mb-2">
              <Search className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 text-base-content/40" />
              <input
                type="text"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="جستجوی نام، شرکت یا شماره همراه مشتری..."
                className="input input-bordered input-sm w-full pe-9 text-xs"
              />
            </div>

            <div className="mb-2 max-h-32 space-y-1 overflow-y-auto pe-1">
              {customerLoading ? (
                <p className="py-3 text-center text-[11px] text-base-content/45">در حال جستجو...</p>
              ) : !customerResults.length ? (
                <p className="py-3 text-center text-[11px] text-base-content/45">
                  مشتری مطابق این جستجو یافت نشد.
                </p>
              ) : (
                customerResults.map((c) => {
                  const added = (value.accessible_customer_ids ?? []).includes(Number(c.id))
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={added}
                      onClick={() => addCustomer(Number(c.id))}
                      className={cx(
                        'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start text-xs transition-colors',
                        added
                          ? 'cursor-default border-base-200 bg-base-200/50 opacity-60'
                          : 'border-base-200 bg-base-100 hover:border-primary/50 hover:bg-primary/5',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{c.label}</span>
                        {c.mobile && (
                          <span className="block truncate font-mono text-[10px] text-base-content/50" dir="ltr">
                            {c.mobile}
                          </span>
                        )}
                      </span>
                      <span className={cx('badge badge-xs font-bold', added ? 'badge-success' : 'badge-ghost')}>
                        {added ? 'اضافه شد' : 'افزودن'}
                      </span>
                    </button>
                  )
                })
              )}
            </div>

            {selectedCustomers.length > 0 && (
              <div className="border-t border-base-200 pt-2">
                <p className="mb-1.5 text-[10px] font-bold text-base-content/55">
                  مشتریان اعطاشده ({num(selectedCustomers.length)}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCustomers.map((c) => (
                    <span key={c.id} className="badge badge-primary badge-sm gap-1 font-semibold">
                      {c.label}
                      <button
                        type="button"
                        className="cursor-pointer opacity-70 hover:opacity-100"
                        onClick={() => removeCustomer(Number(c.id))}
                        title="حذف این استثنا"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
