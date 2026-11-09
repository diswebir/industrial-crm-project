import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { ArrowRight, KeyRound, Save, UserPlus } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Field } from '../../components/ui/Field'
import { FilePondAvatar } from '../../components/ui/FilePondAvatar'
import { PasswordRulesTooltip } from '../../components/ui/PasswordRulesTooltip'
import AccessDenied from '../AccessDenied'
import { RoleAccessFields, type RoleAccessValue } from '../../components/settings/RoleAccessFields'
import { apiErrorMessage, usersApi } from '../../services/api'
import { useAuthStore } from '../../store/useAuthStore'
import { cx, num, toEnDigits } from '../../utils/format'

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
})

type CreateUserFormValues = z.infer<typeof schema>

export default function CreateUserPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const isAdministrator = useAuthStore((s) => s.isAdministrator)()

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])
  /** نقش سازمانی + دامنه دسترسی به مشتریان + استثنائهای اعطاشده (تسک ۱) */
  const [roleAccess, setRoleAccess] = useState<RoleAccessValue>({
    user_type: 'manager',
    customers_scope: 'all',
    accessible_staff_ids: [],
    accessible_customer_ids: [],
  })

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
    },
  })

  /** گروه‌بندی مجوزها بر اساس بخش (مشتریان، دستگاه‌ها، انبار، پیامک، سیستم) */
  const permissionGroups = useMemo(() => {
    const map = new Map<string, typeof availablePermissions>()
    availablePermissions.forEach((perm) => {
      const key = perm.group || 'سایر'
      map.set(key, [...(map.get(key) ?? []), perm])
    })
    return [...map.entries()]
  }, [availablePermissions])

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
      toast.error(apiErrorMessage(err, 'خطا در ایجاد کاربر'))
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
    formData.append('user_type', roleAccess.user_type)
    formData.append('customers_scope', roleAccess.customers_scope)

    // استثناهای دسترسی فقط در دامنه «فقط مشتریان خودش» معنا دارد
    if (roleAccess.customers_scope === 'own') {
      roleAccess.accessible_staff_ids.forEach((sid) => formData.append('accessible_staff_ids[]', String(sid)))
      roleAccess.accessible_customer_ids.forEach((cid) => formData.append('accessible_customer_ids[]', String(cid)))
    } else {
      formData.append('accessible_staff_ids', '')
      formData.append('accessible_customer_ids', '')
    }

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
        subtitle="ایجاد حساب کاربری با تعیین نقش سازمانی، دامنه دسترسی به مشتریان، آپلود آواتار و اعطای مستقیم مجوزها (Pure ACL)"
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

          {/* نقش سازمانی + دامنه دسترسی به مشتریان + استثنائهای اعطاشده (تسک ۱) */}
          <RoleAccessFields
            value={roleAccess}
            onChange={setRoleAccess}
            isAdministrator={isAdministrator}
            onApplyRoleDefaults={(perms) => {
              const allowed = new Set(availablePermissions.map((p) => p.name))
              const applicable = perms.filter((perm) => allowed.has(perm))
              setSelectedPerms(applicable)
              toast.success(
                applicable.length
                  ? `${num(applicable.length)} مجوز پیش‌فرض نقش اعمال شد.`
                  : 'هیچ مجوز پیش‌فرضی برای این نقش در دسترس شما نیست.',
              )
            }}
          />

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
                  {num(selectedPerms.length)} دسترسی از {num(availablePermissions.length)} مجاز انتخاب شده است
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

          {permissionGroups.map(([group, perms]) => (
            <div key={group} className="space-y-2">
              <p className="text-[11px] font-black text-base-content/60">{group}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {perms.map((perm) => {
                  const checked = selectedPerms.includes(perm.name)
                  return (
                    <label
                      key={perm.name}
                      onClick={() => togglePerm(perm.name)}
                      className={cx(
                        'flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-all',
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
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-base-content">{perm.label}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-base-content/50">{perm.name}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
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
