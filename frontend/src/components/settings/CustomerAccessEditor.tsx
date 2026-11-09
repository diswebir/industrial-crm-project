import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Globe2, Search, ShieldCheck, User as UserIcon, Users, X } from 'lucide-react'
import { customerApi, usersApi } from '../../services/api'
import { useAuthStore } from '../../store/useAuthStore'
import { cx, num } from '../../utils/format'
import type { Customer, DataScope, User } from '../../types'

interface CustomerAccessEditorProps {
  user: User
}

const SCOPE_OPTIONS: { value: DataScope; title: string; description: string; icon: typeof Globe2 }[] = [
  {
    value: 'all',
    title: 'تمام مشتریان سامانه',
    description: 'دسترسی مشاهده و ویرایش همه پرونده‌های مشتریان (مخصوص مدیران ارشد).',
    icon: Globe2,
  },
  {
    value: 'own',
    title: 'فقط مشتریان خودم',
    description: 'کارمند فقط مشتریانی را می‌بیند که خودش ثبت کرده است.',
    icon: UserIcon,
  },
  {
    value: 'custom',
    title: 'مشتریان خودم + استثناها',
    description: 'علاوه بر مشتریان خودش، به مشتریان یک یا چند کارمند دیگر یا مشتریان خاص دسترسی دارد.',
    icon: Users,
  },
]

/**
 * ویرایشگر دامنه دسترسی مشتریان یک کارمند (تسک ۱).
 * - all   : همه مشتریان
 * - own   : فقط مشتریان ثبت‌شده توسط خود کارمند
 * - custom: مشتریان خودش + مشتریان کارمندان انتخابی + مشتریان تکی انتخابی
 */
export function CustomerAccessEditor({ user }: CustomerAccessEditorProps) {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const isAdministrator = currentUser?.user_type === 'administrator'

  const [scope, setScope] = useState<DataScope>(user.data_scope ?? 'all')
  const [staffIds, setStaffIds] = useState<number[]>([])
  const [customerIds, setCustomerIds] = useState<number[]>([])
  const [selectedCustomers, setSelectedCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')

  const { data: access, isLoading: accessLoading } = useQuery({
    queryKey: ['user-customer-access', user.id],
    queryFn: () => usersApi.getCustomerAccess(user.id),
    enabled: Boolean(user.id),
  })

  const { data: staffOptions = [] } = useQuery({
    queryKey: ['staff-options'],
    queryFn: usersApi.staffOptions,
    enabled: isAdministrator,
  })

  const { data: searchResults } = useQuery({
    queryKey: ['customer-access-search', search],
    queryFn: () => customerApi.list({ q: search.trim(), per_page: 8 }),
    enabled: isAdministrator && scope === 'custom' && search.trim().length >= 2,
  })

  const initializedForUserRef = useRef<string | null>(null)

  useEffect(() => {
    if (!access) return

    // فقط یک بار (یا هنگام تغییر کاربر) فرم را از سرور پر کن؛ refetch پس‌زمینه
    // نباید تغییرات ذخیره‌نشده کاربر را پاک کند.
    const userKey = String(user.id)
    if (initializedForUserRef.current === userKey) return
    initializedForUserRef.current = userKey

    setScope(access.scope ?? 'own')
    setStaffIds((access.staff_ids ?? []).map(Number))
    setCustomerIds((access.customer_ids ?? []).map(Number))
  }, [access, user.id])

  // بازیابی اطلاعات نمایشی مشتریان انتخاب‌شده (بعد از رفرش صفحه)
  useEffect(() => {
    if (!customerIds.length) {
      setSelectedCustomers([])
      return
    }

    let cancelled = false

    Promise.all(
      customerIds.map((id) =>
        customerApi
          .get(id)
          .then((c) => c)
          .catch(() => null),
      ),
    ).then((rows) => {
      if (!cancelled) {
        setSelectedCustomers(rows.filter(Boolean) as Customer[])
      }
    })

    return () => {
      cancelled = true
    }
  }, [customerIds])

  const saveMutation = useMutation({
    mutationFn: () =>
      usersApi.updateCustomerAccess(user.id, {
        scope,
        staff_ids: scope === 'custom' ? staffIds : [],
        customer_ids: scope === 'custom' ? customerIds : [],
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['system-users'] })
      qc.invalidateQueries({ queryKey: ['system-user', user.id] })
      qc.invalidateQueries({ queryKey: ['user-customer-access', user.id] })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'خطا در ذخیره دامنه دسترسی')
    },
  })

  const toggleStaff = (id: number) => {
    setStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const addCustomer = (customer: Customer) => {
    setCustomerIds((prev) => (prev.includes(Number(customer.id)) ? prev : [...prev, Number(customer.id)]))
    setSelectedCustomers((prev) => (prev.some((c) => String(c.id) === String(customer.id)) ? prev : [...prev, customer]))
    setSearch('')
  }

  const removeCustomer = (id: number | string) => {
    setCustomerIds((prev) => prev.filter((x) => x !== Number(id)))
    setSelectedCustomers((prev) => prev.filter((c) => String(c.id) !== String(id)))
  }

  const selectableStaff = useMemo(
    () => staffOptions.filter((s) => String(s.id) !== String(user.id)),
    [staffOptions, user.id],
  )

  const isRootAdmin = Number(user.id) === 1

  if (isRootAdmin) {
    return (
      <div className="card-surface p-6 space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h3 className="font-bold text-sm">دامنه دسترسی مشتریان</h3>
            <p className="text-xs text-base-content/60">
              حساب مدیر اصلی سامانه همیشه به تمام مشتریان دسترسی دارد و این تنظیم قابل تغییر نیست.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card-surface p-6 sm:p-8 space-y-5">
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-base-200">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-base-content">دامنه دسترسی مشتریان (Granular Access)</h3>
            <p className="text-xs text-base-content/60">
              تعیین کنید این کارمند کدام مشتریان را می‌بیند و می‌تواند ویرایش کند.
            </p>
          </div>
        </div>
      </div>

      {!isAdministrator && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-200">
          تغییر دامنه دسترسی مشتریان فقط توسط مدیر ارشد سامانه امکان‌پذیر است.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {SCOPE_OPTIONS.map((option) => {
          const Icon = option.icon
          const active = scope === option.value
          const disabled = !isAdministrator || (option.value === 'all' && user.user_type === 'salesperson')
          return (
            <button
              type="button"
              key={option.value}
              disabled={disabled}
              onClick={() => setScope(option.value)}
              className={cx(
                'text-start rounded-2xl border p-4 transition-all',
                active
                  ? 'border-primary bg-primary/5 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-800',
                disabled && 'opacity-60 cursor-not-allowed',
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cx('size-4', active ? 'text-primary' : 'text-base-content/50')} />
                <p className="font-bold text-xs text-base-content">{option.title}</p>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-base-content/60">{option.description}</p>
            </button>
          )
        })}
      </div>

      {scope === 'custom' && (
        <div className="space-y-5 pt-2">
          {/* Staff grants */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <p className="font-bold text-xs">دسترسی به مشتریان کارمندان دیگر</p>
              <span className="badge badge-xs bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                {num(staffIds.length)} کارمند
              </span>
            </div>

            {accessLoading ? (
              <div className="skeleton h-20 w-full" />
            ) : selectableStaff.length === 0 ? (
              <p className="text-xs text-base-content/50">کارمند دیگری برای انتخاب وجود ندارد.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {selectableStaff.map((staff) => {
                  const checked = staffIds.includes(Number(staff.id))
                  return (
                    <label
                      key={staff.id}
                      className={cx(
                        'flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all',
                        checked
                          ? 'border-primary bg-primary/5'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-primary checkbox-sm"
                        checked={checked}
                        disabled={!isAdministrator}
                        onChange={() => toggleStaff(Number(staff.id))}
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-xs truncate">{staff.name}</p>
                        <p className="text-[10px] text-base-content/50">{staff.user_type_label}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Specific customers */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <UserIcon className="size-4 text-primary" />
              <p className="font-bold text-xs">دسترسی به مشتریان خاص (تکی)</p>
              <span className="badge badge-xs bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                {num(customerIds.length)} مشتری
              </span>
            </div>

            <div className="relative">
              <label className="input input-bordered input-sm flex items-center gap-2 w-full">
                <Search className="size-4 text-base-content/40" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={!isAdministrator}
                  placeholder="جستجوی نام، شرکت یا شماره همراه مشتری (حداقل ۲ حرف)..."
                  className="grow text-xs"
                />
              </label>

              {search.trim().length >= 2 && searchResults?.data?.length ? (
                <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-xl">
                  {searchResults.data.map((customer) => (
                    <button
                      type="button"
                      key={customer.id}
                      onClick={() => addCustomer(customer)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-xs hover:bg-base-200"
                    >
                      <span className="font-bold truncate">{customer.full_name}</span>
                      <span className="text-[10px] text-base-content/50 font-mono ltr-text">
                        {customer.mobile || '—'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {selectedCustomers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCustomers.map((customer) => (
                  <span
                    key={customer.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary"
                  >
                    {customer.full_name}
                    <button
                      type="button"
                      onClick={() => removeCustomer(customer.id)}
                      disabled={!isAdministrator}
                      className="hover:text-error"
                      aria-label="حذف دسترسی"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-base-200">
        <p className="text-[11px] text-base-content/50 leading-relaxed">
          این تنظیم هم در فهرست مشتریان و هم در API سمت سرور اعمال می‌شود؛ تغییر آدرس صفحه دسترسی ایجاد نمی‌کند.
        </p>
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={!isAdministrator || saveMutation.isPending}
          className="btn btn-sm btn-primary gap-1.5 shrink-0"
        >
          {saveMutation.isPending && <span className="loading loading-spinner loading-xs" />}
          ذخیره دسترسی مشتریان
        </button>
      </div>
    </div>
  )
}
