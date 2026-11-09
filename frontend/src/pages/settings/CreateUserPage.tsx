import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { ArrowRight, Check, KeyRound, Save, ShieldCheck, UserPlus } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Field } from '../../components/ui/Field'
import { FilePondAvatar } from '../../components/ui/FilePondAvatar'
import { PasswordRulesTooltip } from '../../components/ui/PasswordRulesTooltip'
import AccessDenied from '../AccessDenied'
import { usersApi } from '../../services/api'
import { useAuthStore } from '../../store/useAuthStore'
import { cx, toEnDigits } from '../../utils/format'

const schema = z.object({
  name: z.string().trim().min(2, 'نام و نام خانوادگی را حداقل در ۲ کاراکتر وارد کنید'),
  email: z.string().trim().email('فرمت آدرس ایمیل معتبر نیست'),
  phone: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val || val.trim() === '') return
      const cleaned = toEnDigits(val.trim())
      if (!/^09\d{9}$/.test(cleaned)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'شماره همراه باید ۱۱ رقم عددی بوده و با 09 شروع شود (مثال: 09121234567)',
        })
      }
    }),
  password: z
    .string()
    .min(8, 'کلمه عبور باید حداقل ۸ کاراکتر باشد')
    .regex(/^(?=.*[a-zA-Z])(?=.*\d)/, 'کلمه عبور باید شامل حروف انگلیسی و اعداد باشد'),
  is_active: z.boolean(),
  user_type: z.enum(['administrator', 'manager', 'salesperson', 'installer']),
  data_scope: z.enum(['all', 'own']),
})

type CreateUserFormValues = z.infer<typeof schema>

export default function CreateUserPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const isAdministrator = useAuthStore((s) => s.isAdministrator)()

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])

  const { data: availablePermissions = [] } = useQuery({
    queryKey: ['available-permissions'],
    queryFn: usersApi.getAvailablePermissions,
    enabled: hasPermission('users.manage'),
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      password: '',
      is_active: true,
      user_type: 'manager',
      data_scope: 'all',
    },
  })

  const userType = watch('user_type')

  // نقش‌های عملیاتی (کارمند فروش/نصاب) به‌صورت پیش‌فرض فقط مشتریان خودشان را می‌بینند.
  // مدیر ارشد می‌تواند بعد از انتخاب نقش، دامنه را دستی به «همه» تغییر دهد.
  useEffect(() => {
    if (!isAdministrator) return
    if (userType === 'salesperson' || userType === 'installer') {
      setValue('data_scope', 'own')
    }
  }, [userType, isAdministrator, setValue])

  const togglePerm = (permName: string) => {
    setSelectedPerms((prev) =>
      prev.includes(permName) ? prev.filter((p) => p !== permName) : [...prev, permName],
    )
  }

  const selectAllPerms = () => {
    setSelectedPerms(availablePermissions.map((p) => p.name))
  }

  const deselectAllPerms = () => {
    setSelectedPerms([])
  }

  const createMutation = useMutation({
    mutationFn: (formData: FormData) => usersApi.create(formData),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['system-users'] })
      nav('/settings/users')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'خطا در ایجاد کاربر'
      toast.error(msg)
    },
  })

  const onSubmit = (values: CreateUserFormValues) => {
    const formData = new FormData()
    formData.append('name', values.name.trim())
    formData.append('email', values.email.trim())
    if (values.phone && values.phone.trim()) {
      formData.append('phone', toEnDigits(values.phone.trim()))
    }
    formData.append('password', values.password)
    formData.append('is_active', values.is_active ? '1' : '0')
    formData.append('user_type', values.user_type)
    formData.append('data_scope', values.data_scope)

    if (avatarFile) {
      formData.append('avatar', avatarFile)
    }

    selectedPerms.forEach((p) => {
      formData.append('permissions[]', p)
    })

    createMutation.mutate(formData)
  }

  if (!hasPermission('users.manage')) {
    return <AccessDenied requiredPermission="users.manage" />
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-base-content/60">
        <Link to="/settings/users" className="hover:text-primary transition-colors flex items-center gap-1">
          <ArrowRight className="size-3.5" /> بازگشت به لیست کاربران
        </Link>
        <span>/</span>
        <span className="text-base-content font-bold">تعریف کاربر جدید</span>
      </div>

      <PageHeader
        title="تعریف کاربر جدید"
        subtitle="ایجاد حساب کاربری با تعیین مشخصات، آپلود تصویر آواتار و اعطای مستقیم مجوزها (Pure ACL)"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Step 1: User Profile & Photo */}
        <div className="card-surface p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-base-200">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
              <UserPlus className="size-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-base-content">اطلاعات هویتی و حساب</h3>
              <p className="text-xs text-base-content/60">نام، مشخصات تماس و تصویر نمایه کاربر را وارد نمایید.</p>
            </div>
          </div>

          {/* Avatar Upload with FilePond */}
          <FilePondAvatar
            label="تصویر پروفایل کاربر"
            onFileChange={(file) => setAvatarFile(file)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            <Field label="نام و نام خانوادگی" required error={errors.name?.message}>
              <input
                className="input input-bordered w-full text-sm"
                placeholder="مثال: علی احمدی"
                {...register('name')}
              />
            </Field>

            <Field label="پست الکترونیکی (نام کاربری ورود)" required error={errors.email?.message}>
              <input
                type="email"
                dir="ltr"
                className="input input-bordered w-full text-start font-mono text-sm"
                placeholder="user@example.com"
                {...register('email')}
              />
            </Field>

            <Field label="شماره تلفن همراه (۱۱ رقم با 09)" error={errors.phone?.message}>
              <input
                dir="ltr"
                maxLength={11}
                className="input input-bordered w-full text-start font-mono text-sm"
                placeholder="09121234567"
                value={watch('phone') || ''}
                onChange={(e) => {
                  const cleaned = toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 11)
                  setValue('phone', cleaned, { shouldValidate: true })
                }}
                onKeyDown={(e) => {
                  if (
                    e.ctrlKey ||
                    e.metaKey ||
                    ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)
                  ) {
                    return
                  }
                  if (!/^[0-9۰-۹٠-٩]$/.test(e.key)) {
                    e.preventDefault()
                  }
                }}
              />
            </Field>

            <Field label="کلمه عبور ورود به سامانه" required error={errors.password?.message}>
              <PasswordRulesTooltip
                value={watch('password')}
                onChange={(val) => setValue('password', val, { shouldValidate: true })}
                placeholder="حداقل ۸ کاراکتر شامل حروف و اعداد"
                error={errors.password?.message}
                required
              />
            </Field>
          </div>

          {/* User Type Selection */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div>
              <p className="font-bold text-xs text-base-content">نوع کاربری (نقش سیستمی)</p>
              <p className="text-[11px] text-base-content/60 mt-0.5">
                {isAdministrator
                  ? 'تعیین سطح کاربری: مدیر ارشد، مدیر، کارمند فروش یا نصاب. دامنه دید مشتریان در پایین قابل تنظیم است.'
                  : 'کاربران ایجاد شده توسط شما با سطح دسترسی «مدیر» تعریف می‌شوند.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label
                className={cx(
                  'flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all',
                  watch('user_type') === 'manager'
                    ? 'border-primary bg-primary/5 text-primary shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                )}
              >
                <input
                  type="radio"
                  value="manager"
                  className="radio radio-primary radio-sm"
                  {...register('user_type')}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs text-base-content">مدیر (Manager)</p>
                  <p className="text-[11px] text-base-content/60">کاربر عملیاتی با مجوزهای تعیین‌شده</p>
                </div>
              </label>

              {isAdministrator && (
                <label
                  className={cx(
                    'flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all',
                    watch('user_type') === 'salesperson'
                      ? 'border-blue-500 bg-blue-50/50 text-blue-900 shadow-xs dark:bg-blue-950/20 dark:text-blue-300'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                  )}
                >
                  <input
                    type="radio"
                    value="salesperson"
                    className="radio radio-info radio-sm"
                    {...register('user_type')}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-base-content">کارمند فروش (Salesperson)</p>
                    <p className="text-[11px] text-base-content/60">پیش‌فرض: فقط مشتریان ایجادشده توسط خودش</p>
                  </div>
                </label>
              )}

              {isAdministrator && (
                <label
                  className={cx(
                    'flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all',
                    watch('user_type') === 'installer'
                      ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 shadow-xs dark:bg-emerald-950/20 dark:text-emerald-300'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                  )}
                >
                  <input
                    type="radio"
                    value="installer"
                    className="radio radio-success radio-sm"
                    {...register('user_type')}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-base-content">نصاب (Installer)</p>
                    <p className="text-[11px] text-base-content/60">نصب و سرویس دستگاه‌ها، دامنه دید محدود</p>
                  </div>
                </label>
              )}

              {isAdministrator && (
                <label
                  className={cx(
                    'flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all',
                    watch('user_type') === 'administrator'
                      ? 'border-amber-500 bg-amber-50/50 text-amber-900 shadow-xs dark:bg-amber-950/20 dark:text-amber-300'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                  )}
                >
                  <input
                    type="radio"
                    value="administrator"
                    className="radio radio-warning radio-sm"
                    {...register('user_type')}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-base-content">مدیر ارشد (Administrator)</p>
                    <p className="text-[11px] text-base-content/60">دسترسی به تمامی تنظیمات، برندینگ و رنگ</p>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Data scope (RBAC – customer visibility) */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div>
              <p className="font-bold text-xs text-base-content">دامنه دسترسی به مشتریان</p>
              <p className="text-[11px] text-base-content/60 mt-0.5">
                این تنظیم تعیین می‌کند کاربر کدام پرونده‌های مشتری را ببیند و ویرایش کند. اعطای استثنا برای مشتریان
                مشخص یا کارشناسان دیگر، پس از ایجاد کاربر از صفحه «ویرایش کاربر» امکان‌پذیر است.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label
                className={cx(
                  'flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all',
                  watch('data_scope') === 'all'
                    ? 'border-primary bg-primary/5 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                )}
              >
                <input
                  type="radio"
                  value="all"
                  className="radio radio-primary radio-sm mt-0.5"
                  {...register('data_scope')}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs text-base-content">دسترسی به تمام مشتریان</p>
                  <p className="text-[11px] text-base-content/60">کاربر همه پرونده‌های سازمان را می‌بیند.</p>
                </div>
              </label>

              <label
                className={cx(
                  'flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all',
                  watch('data_scope') === 'own'
                    ? 'border-primary bg-primary/5 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                )}
              >
                <input
                  type="radio"
                  value="own"
                  className="radio radio-primary radio-sm mt-0.5"
                  {...register('data_scope')}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs text-base-content">فقط مشتریان خودم</p>
                  <p className="text-[11px] text-base-content/60">مشتریانی که این کاربر ثبت کرده است.</p>
                </div>
              </label>
            </div>
          </div>

          {/* Active status */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="font-bold text-xs text-base-content">فعال بودن حساب کاربری</p>
                <p className="text-[11px] text-base-content/60 mt-0.5">در صورت غیرفعال بودن، کاربر امکان ورود به سامانه را نخواهد داشت.</p>
              </div>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                {...register('is_active')}
              />
            </label>
          </div>
        </div>

        {/* Step 2: Direct ACL Permissions */}
        <div className="card-surface p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-base-200">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800">
                <KeyRound className="size-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-base-content">تخصیص مجوزهای دسترسی (Pure ACL)</h3>
                <p className="text-xs text-base-content/60">
                  {selectedPerms.length} دسترسی از {availablePermissions.length} مجاز انتخاب شده است
                </p>
                {!isAdministrator && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                    * طبق سطح دسترسی شما، صرفاً مجوزهایی که خودتان دارا هستید قابل اعطا به کاربر جدید می‌باشند.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllPerms}
                className="btn btn-xs btn-outline btn-primary"
              >
                انتخاب همه
              </button>
              <button
                type="button"
                onClick={deselectAllPerms}
                className="btn btn-xs btn-ghost text-base-content/60"
              >
                لغو همه
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {availablePermissions.map((perm) => {
              const checked = selectedPerms.includes(perm.name)
              return (
                <label
                  key={perm.name}
                  onClick={() => togglePerm(perm.name)}
                  className={cx(
                    'flex items-start gap-3 rounded-2xl border p-3.5 cursor-pointer transition-all',
                    checked
                      ? 'border-primary bg-primary/5 text-primary shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                  )}
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm mt-0.5"
                    checked={checked}
                    onChange={() => {}}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-base-content">{perm.label}</p>
                    <p className="font-mono text-[10px] text-base-content/50 mt-0.5">{perm.name}</p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          <Link to="/settings/users" className="btn btn-ghost">
            انصراف
          </Link>
          <button
            type="submit"
            className="btn btn-primary gap-2"
            disabled={isSubmitting || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Save className="size-4" />
            )}
            ثبت و ایجاد کاربر
          </button>
        </div>
      </form>
    </div>
  )
}
