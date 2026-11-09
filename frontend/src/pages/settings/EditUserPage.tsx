import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { ArrowRight, KeyRound, Pencil, Save, Trash2 } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Field, PageSkeleton } from '../../components/ui/Field'
import { FilePondAvatar } from '../../components/ui/FilePondAvatar'
import { ConfirmDialog } from '../../components/ui/Modal'
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
  /** نقش سازمانی + دامنه دسترسی به مشتریان + استثنائهای اعطاشده (تسک ۱) */
  const [roleAccess, setRoleAccess] = useState<RoleAccessValue>({
    user_type: 'manager',
    customers_scope: 'all',
    accessible_staff_ids: [],
    accessible_customer_ids: [],
  })

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
      })
      setSelectedPerms(user.permissions || [])
      setRoleAccess({
        user_type: user.user_type || 'manager',
        customers_scope: user.customers_scope || (user.has_global_customer_access ? 'all' : 'own'),
        accessible_staff_ids: (user.accessible_staff_ids ?? []).map(Number),
        accessible_customer_ids: (user.accessible_customer_ids ?? []).map(Number),
      })
    }
  }, [user, reset])

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
      toast.error(apiErrorMessage(err, 'خطا در ذخیره تغییرات کاربر'))
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
      toast.error(apiErrorMessage(err, 'خطا در حذف کاربر'))
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
        subtitle="ویرایش اطلاعات هویتی، آواتار، نقش سازمانی، دامنه دسترسی به مشتریان و مجوزهای مستقیم (Pure ACL)"
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

          {/* نقش سازمانی + دامنه دسترسی به مشتریان + استثنائهای اعطاشده (تسک ۱) */}
          <RoleAccessFields
            value={roleAccess}
            onChange={setRoleAccess}
            isAdministrator={isAdministrator}
            lockRole={user.email === 'admin@crm.local' || (!isAdministrator && user.user_type === 'administrator')}
            excludeUserId={id}
            onApplyRoleDefaults={(perms) => {
              const allowed = new Set(availablePermissions.map((p) => p.name))
              const applicable = perms.filter((perm) => allowed.has(perm))
              setSelectedPerms((prev) => [...new Set([...prev, ...applicable])])
              toast.success(
                applicable.length
                  ? `${num(applicable.length)} مجوز پیش‌فرض نقش به فهرست مجوزها اضافه شد.`
                  : 'هیچ مجوز پیش‌فرض جدیدی برای این نقش در دسترس شما نیست.',
              )
            }}
          />

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
                  {num(selectedPerms.length)} دسترسی از {num(availablePermissions.length)} مجاز برای این کاربر تعیین شده است
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
