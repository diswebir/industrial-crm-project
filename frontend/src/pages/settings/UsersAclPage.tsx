import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Check,
  Edit3,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { TableSkeleton } from '../../components/ui/Field'
import { Avatar } from '../../components/ui/Avatar'
import AccessDenied from '../AccessDenied'
import { usersApi } from '../../services/api'
import { useAuthStore } from '../../store/useAuthStore'
import { cx, dateFa, dateShort, num } from '../../utils/format'
import type { SystemPermission, User } from '../../types'

export default function UsersAclPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const isAdministrator = useAuthStore((s) => s.isAdministrator)()

  const [permModalUser, setPermModalUser] = useState<User | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])
  const [deletingUser, setDeletingUser] = useState<User | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['system-users'],
    queryFn: usersApi.list,
    enabled: hasPermission('users.manage'),
  })

  // Managers cannot see administrator users in the list
  const visibleUsers = isAdministrator
    ? users
    : users.filter((u) => u.user_type !== 'administrator')

  const { data: availablePermissions = [] } = useQuery({
    queryKey: ['available-permissions'],
    queryFn: usersApi.getAvailablePermissions,
    enabled: hasPermission('users.manage'),
  })

  const openPermModal = (u: User) => {
    if (!isAdministrator && u.user_type === 'administrator') {
      toast.error('مدیران عادی امکان ویرایش دسترسی‌های مدیر ارشد را ندارند.')
      return
    }
    setPermModalUser(u)
    setSelectedPerms(u.permissions || [])
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
      qc.invalidateQueries({ queryKey: ['system-user'] })
      qc.invalidateQueries({ queryKey: ['user-customer-access'] })
      setPermModalUser(null)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'خطا در ذخیره مجوزها')
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: usersApi.toggleActive,
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['system-users'] })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'خطا در تغییر وضعیت کاربر')
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
      toast.error(err.response?.data?.message || 'خطا در حذف کاربر')
    },
  })

  if (!hasPermission('users.manage')) {
    return <AccessDenied requiredPermission="users.manage" />
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title="مدیریت کاربران و دسترسی‌ها (Pure ACL)"
        subtitle="در این ساختار، مجوزهای دسترسی به طور مستقیم (بدون واسطه نقش یا Role) به هر کاربر اعطا می‌شود."
        actions={
          <Link to="/settings/users/create" className="btn btn-sm btn-primary gap-1.5">
            <UserPlus className="size-4" /> تعریف کاربر جدید
          </Link>
        }
      />

      <div className="card-surface overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-base-200">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <span className="font-bold text-sm">فهرست کاربران سیستم</span>
            <span className="badge badge-sm bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
              {num(visibleUsers.length)} کاربر
            </span>
          </div>
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
                              {u.user_type === 'administrator' ? (
                                <span className="badge badge-xs bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300">
                                  مدیر ارشد
                                </span>
                              ) : u.user_type === 'salesperson' ? (
                                <span className="badge badge-xs bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300">
                                  کارمند فروش
                                </span>
                              ) : u.user_type === 'installer' ? (
                                <span className="badge badge-xs bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300">
                                  نصاب
                                </span>
                              ) : (
                                <span className="badge badge-xs bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300">
                                  مدیر
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-base-content/50 mt-0.5">
                              عضویت: {u.created_at ? `${dateFa(u.created_at)} (${dateShort(u.created_at)})` : '—'}
                            </p>
                            <p className="text-[10px] mt-0.5">
                              <span
                                className={cx(
                                  'badge badge-xs badge-ghost font-semibold',
                                  u.data_scope === 'all' && 'text-emerald-700 dark:text-emerald-400',
                                  u.data_scope === 'own' && 'text-blue-700 dark:text-blue-400',
                                  u.data_scope === 'custom' && 'text-amber-700 dark:text-amber-400',
                                )}
                              >
                                دامنه دید:{' '}
                                {u.data_scope === 'own'
                                  ? 'فقط مشتریان خودش'
                                  : u.data_scope === 'custom'
                                    ? 'خودش + استثناها'
                                    : 'تمام مشتریان'}
                              </span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="space-y-0.5 font-mono">
                        <p className="ltr-text text-start text-xs">{u.email}</p>
                        {u.phone ? (
                          <p className="text-base-content/60 ltr-text text-start text-[11px]">{u.phone}</p>
                        ) : (
                          <span className="text-base-content/40 font-sans text-[11px]">بدون شماره تماس</span>
                        )}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto p-1">
            {availablePermissions.map((perm) => {
              const checked = selectedPerms.includes(perm.name)
              return (
                <label
                  key={perm.name}
                  onClick={() => togglePerm(perm.name)}
                  className={cx(
                    'flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all',
                    checked
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-base-200 hover:border-base-300 bg-base-100',
                  )}
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm"
                    checked={checked}
                    onChange={() => {}}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-base-content">{perm.label}</p>
                    <p className="font-mono text-[10px] text-base-content/40">{perm.name}</p>
                  </div>
                </label>
              )
            })}
          </div>
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
