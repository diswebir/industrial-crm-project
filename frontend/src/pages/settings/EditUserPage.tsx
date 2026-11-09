import { CustomerAccessEditor } from '../../components/customers/CustomerAccessEditor'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { ArrowRight, Check, KeyRound, Pencil, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Field, PageSkeleton } from '../../components/ui/Field'
import { FilePondAvatar } from '../../components/ui/FilePondAvatar'
import { ConfirmDialog } from '../../components/ui/Modal'
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
    .optional()
    .superRefine((val, ctx) => {
      if (!val || val.trim() === '') return
      const trimmed = val.trim()
      if (trimmed.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'کلمه عبور جدید باید حداقل ۸ کاراکتر باشد',
        })
      }
      if (!/[a-zA-Z]/.test(trimmed) || !/[0-9]/.test(trimmed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'کلمه عبور باید شامل حروف انگلیسی و اعداد باشد',
        })
      }
    }),
  is_active: z.boolean(),
  user_type: z.enum(['administrator', 'manager', 'salesperson', 'installer']).optional(),
})

type EditUserFormValues = z.infer<typeof schema>

export default function EditUserPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const nav = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const isAdministrator = useAuthStore((s) => s.isAdministrator)()

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const isCurrent = currentUser?.id === String(id)

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['system-user', id],
    queryFn: () => usersApi.get(id!),
    enabled: Boolean(id) && hasPermission('users.manage'),
  })

  const { data: availablePermissions = [] } = useQuery({
    queryKey: ['available-permissions'],
    queryFn: usersApi.getAvailablePermissions,
    enabled: hasPermission('users.manage'),
  })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      password: '',
      is_active: true,
      user_type: 'manager',
    },
  })

  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        password: '',
        is_active: user.is_active ?? true,
        user_type: user.user_type || 'manager',
      })
      setSelectedPerms(user.permissions || [])
    }
  }, [user, reset])

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

  const updateMutation = useMutation({
    mutationFn: (formData: FormData) => usersApi.update(id!, formData),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['system-users'] })
      qc.invalidateQueries({ queryKey: ['system-user', id] })
      if (isCurrent) {
        useAuthStore.getState().refreshMe()
      }
      nav('/settings/users')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'خطا در ذخیره تغییرات کاربر'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => usersApi.delete(id!),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['system-users'] })
      nav('/settings/users')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'خطا در حذف کاربر')
    },
  })

  const onSubmit = (values: EditUserFormValues) => {
    const formData = new FormData()
    formData.append('name', values.name.trim())
    formData.append('email', values.email.trim())
    const cleanedPhone = values.phone ? toEnDigits(values.phone.trim()) : ''
    formData.append('phone', cleanedPhone)
    if (values.password && values.password.trim()) {
      formData.append('password', values.password.trim())
    }
    formData.append('is_active', values.is_active ? '1' : '0')
    if (values.user_type) {
      formData.append('user_type', values.user_type)
    }

    if (avatarFile) {
      formData.append('avatar', avatarFile)
    }
    if (removeAvatar) {
      formData.append('remove_avatar', '1')
    }

    selectedPerms.forEach((p) => {
      formData.append('permissions[]', p)
    })
    formData.append('sync_permissions', '1')

    updateMutation.mutate(formData)
  }

  if (!hasPermission('users.manage')) {
    return <AccessDenied requiredPermission="users.manage" />
  }

  if (userLoading) {
    return <PageSkeleton />
  }

  if (!user) {
    return (
      <div className="card-surface p-8 text-center space-y-3">
        <p className="text-error font-bold">کاربر مورد نظر یافت نشد.</p>
        <Link to="/settings/users" className="btn btn-sm btn-ghost">
          بازگشت به فهرست کاربران
        </Link>
      </div>
    )
  }

  // Managers cannot view, edit or delete administrators
  if (user.user_type === 'administrator' && !isAdministrator) {
    return (
      <AccessDenied
        title="عدم دسترسی به حساب مدیر ارشد"
        message="مدیران عادی اجازه دسترسی، ویرایش یا حذف حساب‌های کاربری مدیران ارشد را ندارند."
      />
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-base-content/60">
        <Link to="/settings/users" className="hover:text-primary transition-colors flex items-center gap-1">
          <ArrowRight className="size-3.5" /> بازگشت به لیست کاربران
        </Link>
        <span>/</span>
        <span className="text-base-content font-bold">ویرایش «{user.name}»</span>
      </div>

      <PageHeader
        title={`ویرایش مشخصات کاربر: ${user.name}`}
        subtitle="ویرایش اطلاعات هویتی، آواتار و تنظیم مستقیم مجوزهای دسترسی (Pure ACL)"
        actions={
          !isCurrent && (isAdministrator || user.user_type !== 'administrator') ? (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="btn btn-sm btn-ghost text-error hover:bg-error/10 gap-1.5"
            >
              <Trash2 className="size-4" /> حذف این کاربر
            </button>
          ) : undefined
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Step 1: User Profile & Photo */}
        <div className="card-surface p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-base-200">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
              <Pencil className="size-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-base-content">مشخصات هویتی و دسترسی به سامانه</h3>
              <p className="text-xs text-base-content/60">اطلاعات فردی و مشخصات کاربری را در صورت نیاز ویرایش نمایید.</p>
            </div>
          </div>

          {/* Avatar Upload with FilePond */}
          <FilePondAvatar
            label="تصویر پروفایل کاربر"
            currentAvatarUrl={removeAvatar ? null : user.avatar_url}
            onFileChange={(file) => {
              setAvatarFile(file)
              if (file) setRemoveAvatar(false)
            }}
            onRemoveCurrentAvatar={() => {
              setRemoveAvatar(true)
              setAvatarFile(null)
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            <Field label="نام و نام خانوادگی" required error={errors.name?.message}>
              <input
                className="input input-bordered w-full text-sm"
                placeholder="نام و نام خانوادگی"
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

            <Field
              label="تغییر کلمه عبور (در صورت خالی بودن، رمز قبلی باقی می‌ماند)"
              error={errors.password?.message}
            >
              <PasswordRulesTooltip
                value={watch('password') || ''}
                onChange={(val) => setValue('password', val, { shouldValidate: true })}
                placeholder="رمز عبور جدید (حداقل ۸ کاراکتر)"
                error={errors.password?.message}
              />
            </Field>
          </div>

          {/* User Type Selection */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div>
              <p className="font-bold text-xs text-base-content">نوع کاربری (نقش سیستمی)</p>
              <p className="text-[11px] text-base-content/60 mt-0.5">
                {user.email === 'admin@crm.local'
                  ? 'این حساب، مدیر ارشد اصلی سامانه است و نوع کاربری آن تغییرناپذیر است.'
                  : isAdministrator
                    ? 'تعیین سطح کاربری: مدیر ارشد یا مدیر عادی سامانه'
                    : 'مشاهده سطح کاربری حساب'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label
                className={cx(
                  'flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all',
                  watch('user_type') === 'manager'
                    ? 'border-primary bg-primary/5 text-primary shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                  (!isAdministrator || user.email === 'admin@crm.local') && 'opacity-70 cursor-not-allowed',
                )}
              >
                <input
                  type="radio"
                  value="manager"
                  disabled={!isAdministrator || user.email === 'admin@crm.local'}
                  className="radio radio-primary radio-sm"
                  {...register('user_type')}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs text-base-content">مدیر (Manager)</p>
                  <p className="text-[11px] text-base-content/60">کاربر عملیاتی با مجوزهای تعیین‌شده</p>
                </div>
              </label>

              {isAdministrator && (['salesperson', 'installer'] as const).map((role) => (
                <label key={role} className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer">
                  <input type="radio" value={role} className="radio radio-primary radio-sm" {...register('user_type')} />
                  <span>{role === 'salesperson' ? 'کارمند فروش' : 'نصاب'}</span>
                </label>
              ))}
              {(isAdministrator || user.user_type === 'administrator') && (
                <label
                  className={cx(
                    'flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all',
                    watch('user_type') === 'administrator'
                      ? 'border-amber-500 bg-amber-50/50 text-amber-900 shadow-xs dark:bg-amber-950/20 dark:text-amber-300'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                    (!isAdministrator || user.email === 'admin@crm.local') && 'opacity-70 cursor-not-allowed',
                  )}
                >
                  <input
                    type="radio"
                    value="administrator"
                    disabled={!isAdministrator || user.email === 'admin@crm.local'}
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

          {/* Active status */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="font-bold text-xs text-base-content">وضعیت فعال بودن حساب کاربری</p>
                <p className="text-[11px] text-base-content/60 mt-0.5">
                  {isCurrent
                    ? 'امکان غیرفعال کردن حساب کاربری خودتان وجود ندارد.'
                    : 'در صورت غیرفعال بودن، ورود کاربر به سیستم مسدود می‌شود.'}
                </p>
              </div>
              <input
                type="checkbox"
                disabled={isCurrent}
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
                <h3 className="text-base font-bold text-base-content">مجوزهای مستقیم کاربر (Pure ACL)</h3>
                <p className="text-xs text-base-content/60">
                  {selectedPerms.length} دسترسی از {availablePermissions.length} مجاز برای این کاربر تعیین شده است
                </p>
                {!isAdministrator && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                    * طبق سطح دسترسی شما، صرفاً مجوزهایی که خودتان دارا هستید در این بخش قابل ویرایش می‌باشند.
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
            disabled={isSubmitting || updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Save className="size-4" />
            )}
            ذخیره تغییرات کاربر
          </button>
        </div>
      </form>

      {isAdministrator && (user.user_type === 'salesperson' || user.user_type === 'installer') && <CustomerAccessEditor userId={String(user.id)} />}

      {/* Delete User Confirm */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="حذف کاربر"
        message={`آیا از حذف حساب «${user.name}» اطمینان دارید؟ این عملیات قابل بازگشت نیست.`}
        confirmText="حذف کاربر"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onClose={() => setDeleteConfirmOpen(false)}
      />
    </div>
  )
}
