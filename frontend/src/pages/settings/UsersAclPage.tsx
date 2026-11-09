import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  KeyRound,
  Pencil,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { TableSkeleton } from '../../components/ui/Field'
import { Avatar } from '../../components/ui/Avatar'
import AccessDenied from '../AccessDenied'
import { RoleAccessFields, type RoleAccessValue } from '../../components/settings/RoleAccessFields'
import { apiErrorMessage, usersApi } from '../../services/api'
import { useAuthStore } from '../../store/useAuthStore'
import { cx, dateFa, dateShort, num } from '../../utils/format'
import { customerScopeShort, userRoleLabel } from '../../utils/meta'
import type { CustomerScope, User, UserRole } from '../../types'

export default function UsersAclPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const isAdministrator = useAuthStore((s) => s.isAdministrator)()

  const [permModalUser, setPermModalUser] = useState<User | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])
  const [deletingUser, setDeletingUser] = useState<User | null>(null)
  /** کاربر در حال ویرایش دامنه دسترسی به مشتریان (تسک ۱) */
  const [accessUser, setAccessUser] = useState<User | null>(null)
  const [accessValue, setAccessValue] = useState<RoleAccessValue>({
    user_type: 'manager',
    customers_scope: 'all',
    accessible_staff_ids: [],
    accessible_customer_ids: [],
  })
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['system-users'],
    queryFn: usersApi.list,
    enabled: hasPermission('users.manage'),
  })

  // Managers cannot see administrator users in the list
  const visibleUsers = useMemo(() => {
    const base = isAdministrator ? users : users.filter((u) => u.user_type !== 'administrator')
    return roleFilter === 'all' ? base : base.filter((u) => (u.user_type || 'manager') === roleFilter)
  }, [users, isAdministrator, roleFilter])

  const roleCounts = useMemo(() => {
    const base = isAdministrator ? users : users.filter((u) => u.user_type !== 'administrator')
    const map: Record<string, number> = { all: base.length }
    base.forEach((u) => {
      const key = u.user_type || 'manager'
      map[key] = (map[key] ?? 0) + 1
    })
    return map
  }, [users, isAdministrator])

  const { data: availablePermissions = [] } = useQuery({
    queryKey: ['available-permissions'],
    queryFn: usersApi.getAvailablePermissions,
    enabled: hasPermission('users.manage'),
  })

  /** گروه‌بندی مجوزها بر اساس بخش */
  const permissionGroups = useMemo(() => {
    const map = new Map<string, typeof availablePermissions>()
    availablePermissions.forEach((perm) => {
      const key = perm.group || 'سایر'
      map.set(key, [...(map.get(key) ?? []), perm])
    })
    return [...map.entries()]
  }, [availablePermissions])

  const openPermModal = (u: User) => {
    if (!isAdministrator && u.user_type === 'administrator') {
      toast.error('مدیران عادی امکان ویرایش دسترسی‌های مدیر ارشد را ندارند.')
      return
    }
    setPermModalUser(u)
    setSelectedPerms(u.permissions || [])
  }

  const openAccessModal = (u: User) => {
    if (!isAdministrator && u.user_type === 'administrator') {
      toast.error('مدیران عادی امکان تغییر دامنه دسترسی مدیر ارشد را ندارند.')
      return
    }
    setAccessUser(u)
    setAccessValue({
      user_type: (u.user_type || 'manager') as UserRole,
      customers_scope: (u.customers_scope || (u.has_global_customer_access ? 'all' : 'own')) as CustomerScope,
      accessible_staff_ids: (u.accessible_staff_ids ?? []).map(Number),
      accessible_customer_ids: (u.accessible_customer_ids ?? []).map(Number),
    })
  }

  const togglePerm = (permName: string) => {
    setSelectedPerms((prev) =>
      prev.includes(permName) ? prev.filter((p) => p !== permName) : [...prev, permName],
    )
  }

  const savePermsMutation = useMutation({
    mutationFn: ({ userId, perms }: { userId: number | string; perms: string[] }) =>
      usersApi.updatePermissions(userId, perms),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['system-users'] })
      setPermModalUser(null)
    },
    onError: (err: any) => {
      toast.error(apiErrorMessage(err, 'خطا در ذخیره مجوزها'))
    },
  })

  /** ذخیره نقش + دامنه دسترسی + استثنائهای اعطاشده (تسک ۱) */
  const saveAccessMutation = useMutation({
    mutationFn: ({ userId, body }: { userId: number | string; body: RoleAccessValue }) =>
      usersApi.updateAccessScope(userId, {
        customers_scope: body.customers_scope,
        accessible_staff_ids: body.customers_scope === 'own' ? body.accessible_staff_ids : [],
        accessible_customer_ids: body.customers_scope === 'own' ? body.accessible_customer_ids : [],
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['system-users'] })
      qc.invalidateQueries({ queryKey: ['system-user', res.user?.id] })
      setAccessUser(null)
    },
    onError: (err: any) => {
      toast.error(apiErrorMessage(err, 'خطا در ذخیره دامنه دسترسی'))
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: usersApi.toggleActive,
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['system-users'] })
    },
    onError: (err: any) => {
      toast.error(apiErrorMessage(err, 'خطا در تغییر وضعیت کاربر'))
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: usersApi.delete,
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['system-users'] })
      setDeletingUser(null)
    },
    onError: (err: any) => {
      toast.error(apiErrorMessage(err, 'خطا در حذف کاربر'))
    },
  })

  if (!hasPermission('users.manage')) {
    return <AccessDenied requiredPermission="users.manage" />
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title="مدیریت کاربران، نقش‌ها و دسترسی‌ها (RBAC + Pure ACL)"
        subtitle="تعیین نقش سازمانی (مدیر ارشد، مدیر، کارمند فروش، نصاب)، دامنه دسترسی هر کاربر به مشتریان و اعطای مستقیم مجوزها."
        actions={
          <Link to="/settings/users/create" className="btn btn-sm btn-primary gap-1.5">
            <UserPlus className="size-4" /> تعریف کاربر جدید
          </Link>
        }
      />

      {/* فیلتر بر اساس نقش سازمانی */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'administrator', 'manager', 'salesperson', 'installer'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setRoleFilter(key)}
            className={cx(
              'badge gap-1 border px-3 py-2 text-xs font-bold transition-colors',
              roleFilter === key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-base-300 bg-base-100 text-base-content/60 hover:border-primary/40',
            )}
          >
            {key === 'all' ? 'همه نقش‌ها' : userRoleLabel[key]}
            <span className="font-mono text-[10px] opacity-70">{num(roleCounts[key] ?? 0)}</span>
          </button>
        ))}
      </div>

      <div className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-200 p-5">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <span className="font-bold text-sm">فهرست کاربران سیستم</span>
            <span className="badge badge-sm border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {num(visibleUsers.length)} کاربر
            </span>
          </div>
          <p className="text-[11px] text-base-content/55">
            برای محدودسازی دسترسی یک کارمند فروش به مشتریان خودش، روی «دسترسی مشتریان» کلیک کنید.
          </p>
        </div>

        {isLoading ? (
          <div className="p-5">
            <TableSkeleton rows={4} cols={5} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs font-bold text-base-content/75 border-b border-base-200">
                  <th>کاربر</th>
                  <th>ایمیل و شماره همراه</th>
                  <th>نقش سازمانی</th>
                  <th>دامنه دسترسی به مشتریان</th>
                  <th>دسترسی‌های مستقیم</th>
                  <th>وضعیت</th>
                  <th className="text-end">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-200/80">
                {visibleUsers.map((u) => {
                  const isCurrent = currentUser?.id === String(u.id)
                  const isAdminUser = u.user_type === 'administrator'
                  const canManageThisUser = isAdministrator || !isAdminUser
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-base-200/40 text-xs">
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} src={u.avatar_url} size="md" />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-sm text-base-content">{u.name}</p>
                              {isCurrent && (
                                <span className="badge badge-xs bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300">
                                  شما
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-base-content/50 mt-0.5">
                              عضویت: {u.created_at ? `${dateFa(u.created_at)} (${dateShort(u.created_at)})` : '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="space-y-0.5 font-mono">
                        <p className="ltr-text text-start text-xs">{u.email}</p>
                        {u.phone ? (
                          <p className="ltr-text text-start text-[11px] text-base-content/60">{u.phone}</p>
                        ) : (
                          <span className="font-sans text-[11px] text-base-content/40">بدون شماره تماس</span>
                        )}
                      </td>

                      <td>
                        <span
                          className={cx(
                            'badge badge-xs border font-bold',
                            isAdminUser
                              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                              : u.user_type === 'salesperson'
                                ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300'
                                : u.user_type === 'installer'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
                          )}
                        >
                          {u.role_label || userRoleLabel[(u.user_type || 'manager') as UserRole]}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          onClick={() => canManageThisUser && openAccessModal(u)}
                          disabled={!canManageThisUser}
                          className={cx(
                            'flex flex-col items-start gap-1 rounded-xl border px-2.5 py-1.5 text-start transition-colors',
                            canManageThisUser
                              ? 'cursor-pointer border-base-200 bg-base-100 hover:border-primary/50'
                              : 'cursor-default border-base-200 bg-base-100 opacity-70',
                          )}
                          title={canManageThisUser ? 'ویرایش دامنه دسترسی و استثناها' : 'غیرقابل ویرایش توسط شما'}
                        >
                          <span
                            className={cx(
                              'badge badge-xs font-bold',
                              u.customers_scope === 'own' ? 'badge-info badge-soft' : 'badge-ghost',
                            )}
                          >
                            {customerScopeShort[(u.customers_scope || 'all') as CustomerScope]}
                          </span>
                          {u.customers_scope === 'own' && (
                            <span className="text-[10px] text-base-content/50">
                              {num(u.accessible_staff_ids?.length ?? 0)} کارمند •{' '}
                              {num(u.accessible_customer_ids?.length ?? 0)} مشتری
                            </span>
                          )}
                          {typeof u.created_customers_count === 'number' && (
                            <span className="text-[10px] text-base-content/40">
                              {num(u.created_customers_count)} مشتری ثبت‌شده
                            </span>
                          )}
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => canManageThisUser && openPermModal(u)}
                          disabled={!canManageThisUser}
                          className={cx(
                            'badge badge-primary badge-soft font-bold text-xs gap-1 py-1 px-2.5',
                            canManageThisUser ? 'cursor-pointer hover:opacity-85 transition-opacity' : 'cursor-default opacity-80',
                          )}
                          title={canManageThisUser ? 'مشاهده یا ویرایش مجوزها' : 'غیرقابل ویرایش توسط شما'}
                        >
                          <ShieldCheck className="size-3.5" />
                          {num(u.permissions?.length ?? 0)} دسترسی فعال
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => canManageThisUser && toggleActiveMutation.mutate(u.id)}
                          disabled={isCurrent || !canManageThisUser}
                          className={cx(
                            'badge badge-xs font-bold transition-opacity',
                            isCurrent || !canManageThisUser ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:opacity-80',
                            u.is_active ? 'badge-success badge-soft' : 'badge-error badge-soft',
                          )}
                          title={
                            isCurrent
                              ? 'امکان تغییر وضعیت حساب خودتان وجود ندارد'
                              : !canManageThisUser
                                ? 'مدیران عادی امکان تغییر وضعیت حساب مدیر ارشد را ندارند'
                                : 'کلیک برای تغییر وضعیت'
                          }
                        >
                          {u.is_active ? 'فعال' : 'غیرفعال'}
                        </button>
                      </td>
                      <td className="text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManageThisUser ? (
                            <>
                              <button
                                className="btn btn-xs btn-outline btn-primary gap-1"
                                onClick={() => openPermModal(u)}
                                title="مدیریت مجوزها"
                              >
                                <KeyRound className="size-3.5" />
                                <span className="hidden sm:inline">مجوزها</span>
                              </button>

                              <button
                                className="btn btn-xs btn-ghost gap-1"
                                onClick={() => openAccessModal(u)}
                                title="نقش و دامنه دسترسی به مشتریان"
                              >
                                <UsersRound className="size-3.5" />
                                <span className="hidden sm:inline">دسترسی مشتریان</span>
                              </button>

                              <Link
                                to={`/settings/users/${u.id}/edit`}
                                className="btn btn-xs btn-ghost gap-1"
                                title="ویرایش کاربر"
                              >
                                <Pencil className="size-3.5" />
                                <span className="hidden sm:inline">ویرایش</span>
                              </Link>

                              {!isCurrent && (
                                <button
                                  className="btn btn-xs btn-ghost text-error hover:bg-error/10 gap-1"
                                  onClick={() => setDeletingUser(u)}
                                  title="حذف کاربر"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-base-content/40 text-[11px] italic">عدم دسترسی</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Quick Direct Permissions Management */}
      <Modal
        open={Boolean(permModalUser)}
        onClose={() => setPermModalUser(null)}
        size="lg"
        title={`مدیریت مجوزهای مستقیم برای «${permModalUser?.name}»`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setPermModalUser(null)}>
              انصراف
            </button>
            <button
              className="btn btn-primary"
              disabled={savePermsMutation.isPending}
              onClick={() =>
                permModalUser &&
                savePermsMutation.mutate({
                  userId: permModalUser.id,
                  perms: selectedPerms,
                })
              }
            >
              {savePermsMutation.isPending && <span className="loading loading-spinner loading-xs" />}
              ذخیره مجوزها
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-base-content/70">
            تیک دسترسی‌های مدنظر را فعال یا غیرفعال نمایید. سیستم بدون استفاده از نقش (Role)، مستقیماً این دسترسی‌ها را برای کاربر اعمال می‌کند.
          </p>

          <div className="max-h-96 space-y-4 overflow-y-auto p-1">
            {permissionGroups.map(([group, perms]) => (
              <div key={group} className="space-y-2">
                <p className="text-[11px] font-black text-base-content/60">{group}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {perms.map((perm) => {
                    const checked = selectedPerms.includes(perm.name)
                    return (
                      <label
                        key={perm.name}
                        onClick={() => togglePerm(perm.name)}
                        className={cx(
                          'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all',
                          checked
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-base-200 bg-base-100 hover:border-base-300',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="checkbox checkbox-primary checkbox-sm"
                          checked={checked}
                          onChange={() => {}}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-base-content">{perm.label}</p>
                          <p className="font-mono text-[10px] text-base-content/40">{perm.name}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Modal: نقش سازمانی و دامنه دسترسی به مشتریان (تسک ۱) */}
      <Modal
        open={Boolean(accessUser)}
        onClose={() => setAccessUser(null)}
        size="lg"
        title={`نقش و دامنه دسترسی «${accessUser?.name ?? ''}»`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAccessUser(null)}>
              انصراف
            </button>
            <button
              className="btn btn-primary"
              disabled={saveAccessMutation.isPending}
              onClick={() =>
                accessUser &&
                saveAccessMutation.mutate({ userId: accessUser.id, body: accessValue })
              }
            >
              {saveAccessMutation.isPending && <span className="loading loading-spinner loading-xs" />}
              ذخیره نقش و دسترسی‌ها
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-base-content/70">
            نقش سازمانی را در صفحه ویرایش کاربر تغییر دهید؛ در این بخش دامنه دسترسی به مشتریان و استثنائهای
            اعطاشده (کارمندان مشخص و مشتریان تکی) مدیریت می‌شود. تغییرات بلافاصله در پرس‌و‌جوهای سمت سرور اعمال
            می‌گردد.
          </p>

          <RoleAccessFields
            value={accessValue}
            onChange={setAccessValue}
            isAdministrator={isAdministrator}
            lockRole={accessUser?.email === 'admin@crm.local'}
            excludeUserId={accessUser?.id}
          />
        </div>
      </Modal>

      {/* Confirm User Delete Dialog */}
      <ConfirmDialog
        open={Boolean(deletingUser)}
        title="حذف کاربر"
        message={`آیا از حذف کاربر «${deletingUser?.name}» اطمینان دارید؟ تمام مجوزها و دسترسی‌های این کاربر سلب خواهد شد.`}
        confirmText="حذف کاربر"
        danger
        loading={deleteUserMutation.isPending}
        onConfirm={() => deletingUser && deleteUserMutation.mutate(deletingUser.id)}
        onClose={() => setDeletingUser(null)}
      />
    </div>
  )
}
