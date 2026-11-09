import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Building2,
  Cpu,
  History,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Send,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Wrench,
  Boxes,
  Receipt,
} from 'lucide-react'
import { PageSkeleton, EmptyState } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import { CustomerFormModal } from '../components/customers/CustomerFormModal'
import { AssignDeviceModal } from '../components/parts/AssignDeviceModal'
import { ServiceHistoryModal } from '../components/parts/ServiceHistoryModal'
import { Can } from '../components/common/Can'
import { customerApi, partApi } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'
import { cx, dateFa, dateShort, num, relativeFa, toman } from '../utils/format'
import type { CustomerPart, PartServiceHistory } from '../types'

type ActiveTab = 'devices' | 'audit' | 'sms' | 'profile'

const STATUS_LABELS: Record<string, string> = {
  active: 'فعال در محل مشتری',
  under_repair: 'در دست تعمیر',
  replaced: 'تعویض‌شده',
  retired: 'از رده خارج',
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const canViewSmsLogs = useAuthStore((s) => Boolean(s.user?.permissions?.includes('sms.logs')))

  const [activeTab, setActiveTab] = useState<ActiveTab>('devices')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<CustomerPart | null>(null)
  const [deletingAssignment, setDeletingAssignment] = useState<CustomerPart | null>(null)
  const [deletingHistory, setDeletingHistory] = useState<
    { customerPart: CustomerPart; history: PartServiceHistory } | null
  >(null)
  const [servicePart, setServicePart] = useState<CustomerPart | null>(null)

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customerApi.get(id!),
    enabled: Boolean(id),
  })

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['customer', id] })
    qc.invalidateQueries({ queryKey: ['customers'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    qc.invalidateQueries({ queryKey: ['parts-catalog'] })
    qc.invalidateQueries({ queryKey: ['inventory-logs'] })
    qc.invalidateQueries({ queryKey: ['inventory-summary'] })
  }

  const deleteMutation = useMutation({
    mutationFn: () => customerApi.delete(id!),
    onSuccess: () => {
      toast.success('مشتری با موفقیت حذف شد')
      qc.invalidateQueries({ queryKey: ['customers'] })
      nav('/customers')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'خطا در حذف مشتری')
    },
  })

  const deleteAssignmentMutation = useMutation({
    mutationFn: (assignmentId: number | string) => partApi.deleteAssignment(assignmentId),
    onSuccess: (res) => {
      toast.success(res.message)
      setDeletingAssignment(null)
      refreshAll()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'خطا در حذف دستگاه تخصیص‌یافته')
    },
  })

  const deleteHistoryMutation = useMutation({
    mutationFn: ({ customerPart, history }: { customerPart: CustomerPart; history: PartServiceHistory }) =>
      partApi.deleteServiceHistory(customerPart.id, history.id),
    onSuccess: (res) => {
      toast.success(res.message)
      setDeletingHistory(null)
      refreshAll()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'خطا در حذف سابقه سرویس')
    },
  })

  const customerParts = customer?.customer_parts ?? []
  const histories = customer?.histories ?? []
  const smsLogs = customer?.sms_logs ?? []

  const totals = useMemo(() => {
    const totalQuantity = customerParts.reduce((sum, cp) => sum + Math.max(1, Number(cp.quantity ?? 1)), 0)
    const totalInvoice = customerParts.reduce((sum, cp) => sum + Number(cp.invoice_amount ?? 0), 0)
    return { totalQuantity, totalInvoice }
  }, [customerParts])

  if (isLoading) return <PageSkeleton />

  if (error || !customer) {
    return (
      <EmptyState
        title="مشتری یافت نشد"
        subtitle="ممکن است این مشتری حذف شده باشد یا دسترسی شما به پرونده او لغو شده باشد."
        action={
          <Link to="/customers" className="btn btn-primary btn-sm">
            بازگشت به فهرست مشتریان
          </Link>
        }
      />
    )
  }

  const displayName = customer.full_name || `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim()

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          to="/customers"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-base-content/60 hover:text-primary transition-colors"
        >
          <span aria-hidden>→</span> بازگشت به فهرست مشتریان
        </Link>
      </div>

      {/* Header Profile Card */}
      <div className="relative overflow-hidden rounded-2xl border border-base-200 bg-base-100 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={cx(
                'flex size-16 shrink-0 items-center justify-center rounded-2xl font-bold text-xl',
                customer.type === 'company' ? 'bg-blue-600/10 text-blue-700' : 'bg-indigo-600/10 text-indigo-700',
              )}
            >
              {customer.type === 'company' ? <Building2 className="size-8" /> : <User className="size-8" />}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-base-content">{displayName}</h1>
                {customer.customer_type === 'effective' ? (
                  <span className="badge badge-success badge-soft font-bold text-xs gap-1">
                    <UserCheck className="size-3" /> مشتری بالفعل
                  </span>
                ) : (
                  <span className="badge badge-warning badge-soft font-bold text-xs gap-1">
                    <UserPlus className="size-3" /> مشتری بالقوه
                  </span>
                )}
                <span className="badge badge-sm bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                  {customer.type === 'company' ? 'شخصیت حقوقی' : 'شخصیت حقیقی'}
                </span>
              </div>

              {customer.type === 'company' && (customer.first_name || customer.last_name) && (
                <p className="text-xs font-semibold text-base-content/60">
                  {customer.first_name} {customer.last_name}
                </p>
              )}
              {customer.type !== 'company' && customer.company_name && (
                <p className="text-xs font-semibold text-base-content/60">{customer.company_name}</p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-base-content/60 pt-1">
                {customer.mobile ? (
                  <span className="flex items-center gap-1 ltr-text">
                    <Phone className="size-3.5 text-base-content/40" /> {customer.mobile}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-base-content/40">
                    <Phone className="size-3.5" /> بدون شماره همراه
                  </span>
                )}
                {customer.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5 text-base-content/40" /> {customer.province} - {customer.city}
                  </span>
                )}
                {customer.creator?.name && (
                  <span className="flex items-center gap-1">
                    <UserCheck className="size-3.5 text-base-content/40" /> کارشناس: {customer.creator.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Can permission="parts.assign">
              <button
                className="btn btn-sm btn-primary gap-1.5"
                onClick={() => {
                  setEditingAssignment(null)
                  setAssignOpen(true)
                }}
              >
                <Plus className="size-4" /> تخصیص دستگاه جدید
              </button>
            </Can>

            {customer.mobile && (
              <Can permission="sms.send">
                <Link
                  to={`/sms?mobile=${customer.mobile}&customer_id=${customer.id}`}
                  className="btn btn-sm btn-outline gap-1.5"
                >
                  <Send className="size-4" /> ارسال پیامک
                </Link>
              </Can>
            )}

            <Can permission="customers.edit">
              <button className="btn btn-sm btn-square btn-ghost" onClick={() => setEditOpen(true)} title="ویرایش پرونده">
                <Pencil className="size-4" />
              </button>
            </Can>

            <Can permission="customers.delete">
              <button
                className="btn btn-sm btn-square btn-ghost text-error"
                onClick={() => setDeleteOpen(true)}
                title="حذف پرونده"
              >
                <Trash2 className="size-4" />
              </button>
            </Can>
          </div>
        </div>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <Boxes className="size-5" />
          </span>
          <div>
            <p className="text-[11px] text-base-content/50">تعداد کل دستگاه‌ها</p>
            <p className="text-lg font-black">{num(totals.totalQuantity)} عدد</p>
          </div>
        </div>
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            <Cpu className="size-5" />
          </span>
          <div>
            <p className="text-[11px] text-base-content/50">تعداد رکورد تخصیص</p>
            <p className="text-lg font-black">{num(customerParts.length)} رکورد</p>
          </div>
        </div>
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Receipt className="size-5" />
          </span>
          <div>
            <p className="text-[11px] text-base-content/50">مجموع مبالغ فاکتورها</p>
            <p className="text-lg font-black">{totals.totalInvoice > 0 ? toman(totals.totalInvoice) : '—'}</p>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="border-b border-base-200">
        <div role="tablist" className="tabs tabs-border">
          <button
            role="tab"
            className={cx('tab gap-2 font-bold text-xs', activeTab === 'devices' && 'tab-active')}
            onClick={() => setActiveTab('devices')}
          >
            <Cpu className="size-4" />
            دستگاه‌ها و سوابق خدمات ({num(customerParts.length)})
          </button>
          <button
            role="tab"
            className={cx('tab gap-2 font-bold text-xs', activeTab === 'audit' && 'tab-active')}
            onClick={() => setActiveTab('audit')}
          >
            <History className="size-4" />
            تاریخچه اقدامات و رویدادها ({num(histories.length)})
          </button>
          <button
            role="tab"
            className={cx('tab gap-2 font-bold text-xs', activeTab === 'sms' && 'tab-active')}
            onClick={() => setActiveTab('sms')}
          >
            <MessageSquare className="size-4" />
            پیامک‌های ارسالی ({num(smsLogs.length)})
          </button>
          <button
            role="tab"
            className={cx('tab gap-2 font-bold text-xs', activeTab === 'profile' && 'tab-active')}
            onClick={() => setActiveTab('profile')}
          >
            <User className="size-4" />
            مشخصات کامل پرونده
          </button>
        </div>
      </div>

      {/* Tab 1: Assigned devices and service history */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-base-content">دستگاه‌های تخصیص‌یافته به مشتری</h2>
            <Can permission="parts.assign">
              <button
                className="btn btn-xs btn-primary gap-1"
                onClick={() => {
                  setEditingAssignment(null)
                  setAssignOpen(true)
                }}
              >
                <Plus className="size-3.5" /> تخصیص دستگاه دیگر
              </button>
            </Can>
          </div>

          {!customerParts.length ? (
            <div className="rounded-2xl border border-dashed border-base-300 p-8 text-center bg-base-100">
              <Cpu className="mx-auto size-12 text-base-content/30 mb-2" />
              <p className="font-bold text-sm">هیچ دستگاهی برای این مشتری ثبت نشده است</p>
              <p className="text-xs text-base-content/60 mt-1 max-w-sm mx-auto">
                با تخصیص اولین دستگاه، وضعیت مشتری به طور خودکار به «بالفعل» تغییر می‌یابد و موجودی انبار کسر می‌شود.
              </p>
              <Can permission="parts.assign">
                <button
                  className="btn btn-sm btn-primary mt-4"
                  onClick={() => {
                    setEditingAssignment(null)
                    setAssignOpen(true)
                  }}
                >
                  <Plus className="size-4" /> تخصیص اولین دستگاه
                </button>
              </Can>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">
              {customerParts.map((cp) => (
                <div key={cp.id} className="rounded-2xl border border-base-200 bg-base-100 p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-3 border-b border-base-200/60">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 font-bold">
                        <Cpu className="size-6" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-sm text-base-content">{cp.part?.name ?? 'دستگاه صنعتی'}</h3>
                          <span className="badge badge-primary badge-soft font-bold text-xs">
                            {num(cp.quantity ?? 1)} عدد
                          </span>
                          {cp.serial_number && (
                            <span className="badge badge-sm font-mono text-xs">{cp.serial_number}</span>
                          )}
                        </div>
                        <p className="text-xs text-base-content/60 mt-0.5">
                          کد کاتالوگ: <span className="font-mono">{cp.part?.code}</span> • دوره گارانتی/سرویس:{' '}
                          {num(cp.part?.periodic_service_months ?? 12)} ماه
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cx(
                          'badge badge-sm font-bold',
                          cp.status === 'active'
                            ? 'badge-success badge-soft'
                            : cp.status === 'under_repair'
                            ? 'badge-warning badge-soft'
                            : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
                        )}
                      >
                        {STATUS_LABELS[cp.status] ?? cp.status}
                      </span>

                      <Can permission="parts.history">
                        <button className="btn btn-xs btn-outline btn-primary gap-1" onClick={() => setServicePart(cp)}>
                          <Wrench className="size-3.5" /> ثبت اقدام / تعمیر
                        </button>
                      </Can>

                      <Can permission="parts.assign.edit">
                        <button
                          className="btn btn-xs btn-ghost gap-1"
                          title="ویرایش این تخصیص"
                          onClick={() => {
                            setEditingAssignment(cp)
                            setAssignOpen(true)
                          }}
                        >
                          <Pencil className="size-3.5" /> ویرایش
                        </button>
                      </Can>

                      <Can permission="parts.assign.delete">
                        <button
                          className="btn btn-xs btn-ghost text-error hover:bg-error/10 gap-1"
                          title="حذف این تخصیص و برگشت به انبار"
                          onClick={() => setDeletingAssignment(cp)}
                        >
                          <Trash2 className="size-3.5" /> حذف
                        </button>
                      </Can>
                    </div>
                  </div>

                  {/* Invoice & Dates */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-50 border border-slate-200 p-3.5 rounded-xl dark:bg-slate-900/60 dark:border-slate-800">
                    <div>
                      <span className="text-base-content/50 block">شماره فاکتور:</span>
                      <span className="font-medium font-mono">{cp.invoice_number || '—'}</span>
                    </div>
                    <div>
                      <span className="text-base-content/50 block">مبلغ فاکتور:</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        {cp.invoice_amount !== null && cp.invoice_amount !== undefined
                          ? toman(Number(cp.invoice_amount))
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-base-content/50 block">تاریخ تحویل یا نصب:</span>
                      <span className="font-medium">
                        {cp.installation_date ? `${dateFa(cp.installation_date)} (${dateShort(cp.installation_date)})` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-base-content/50 block">پوشش گارانتی تا:</span>
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {cp.warranty_expire_date
                          ? `${dateFa(cp.warranty_expire_date)} (${dateShort(cp.warranty_expire_date)})`
                          : '—'}
                      </span>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <span className="text-base-content/50 block">توضیحات اختصاصی دستگاه:</span>
                      <span className="font-medium">{cp.notes || 'بدون یادداشت'}</span>
                    </div>
                  </div>

                  {/* Device Service / Repair Histories */}
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-bold text-base-content/70 flex items-center gap-1.5">
                      <Wrench className="size-3.5" /> سوابق خدمات، بررسی و تعمیرات این دستگاه (
                      {num(cp.service_histories?.length ?? 0)})
                    </h4>

                    {!cp.service_histories?.length ? (
                      <p className="text-xs text-base-content/40 italic py-2">
                        تاکنون سابقه تعمیر یا اقدام سرویسی برای این دستگاه ثبت نشده است.
                      </p>
                    ) : (
                      <div className="divide-y divide-base-200/60 rounded-xl border border-base-200/60 bg-base-100 overflow-hidden">
                        {cp.service_histories.map((sh) => (
                          <div
                            key={sh.id}
                            className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cx(
                                    'badge badge-xs font-semibold',
                                    sh.service_type === 'periodic'
                                      ? 'badge-info badge-soft'
                                      : sh.service_type === 'repair'
                                      ? 'badge-warning badge-soft'
                                      : 'badge-error badge-soft',
                                  )}
                                >
                                  {sh.service_type === 'periodic'
                                    ? 'سرویس دوره‌ای'
                                    : sh.service_type === 'repair'
                                    ? 'تعمیر فنی'
                                    : 'اورهال'}
                                </span>
                                <span className="font-medium">{sh.description}</span>
                              </div>
                              <p className="text-[11px] text-base-content/50">
                                تاریخ اقدام:{' '}
                                {sh.service_date ? `${dateFa(sh.service_date)} (${dateShort(sh.service_date)})` : '—'}
                                {sh.performed_by && ` • توسط: ${sh.performed_by.name}`}
                              </p>
                            </div>

                            <div className="flex items-center gap-3">
                              {sh.cost && (
                                <div className="text-end font-semibold text-xs text-base-content/80">
                                  {toman(Number(sh.cost))}
                                </div>
                              )}

                              <Can permission="parts.assign.edit">
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10"
                                  title="حذف این سابقه سرویس"
                                  onClick={() => setDeletingHistory({ customerPart: cp, history: sh })}
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </Can>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="rounded-2xl border border-base-200 bg-base-100 p-5 shadow-xs space-y-4">
          <h2 className="font-bold text-base text-base-content">تاریخچه تغییرات و اقدامات سیستم</h2>
          {!histories.length ? (
            <p className="text-xs text-base-content/50 py-6 text-center">تاریخچه‌ای ثبت نشده است.</p>
          ) : (
            <div className="divide-y divide-base-200/60">
              {histories.map((h) => (
                <div key={h.id} className="py-3 flex items-start gap-3 text-xs">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-base-200 text-base-content/70">
                    <History className="size-3.5" />
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-base-content">{h.description}</p>
                    <div className="flex items-center gap-2 mt-1 text-base-content/50 text-[11px]">
                      <span>اقدام‌کننده: {h.user ? h.user.name : 'سیستم'}</span>
                      <span>•</span>
                      <span>{relativeFa(h.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: SMS Logs */}
      {activeTab === 'sms' && canViewSmsLogs && (
        <div className="rounded-2xl border border-base-200 bg-base-100 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-base-content">پیامک‌های ارسال شده به این مشتری (ملی‌پیامک)</h2>
            {customer.mobile && (
              <Can permission="sms.send">
                <Link
                  to={`/sms?mobile=${customer.mobile}&customer_id=${customer.id}`}
                  className="btn btn-xs btn-primary gap-1"
                >
                  <Send className="size-3" /> ارسال پیامک جدید
                </Link>
              </Can>
            )}
          </div>

          {!smsLogs.length ? (
            <p className="text-xs text-base-content/50 py-8 text-center">پیامکی برای این مشتری ثبت نشده است.</p>
          ) : (
            <div className="divide-y divide-base-200/60">
              {smsLogs.map((s) => (
                <div key={s.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="badge badge-xs bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 font-mono">
                        الگوی {s.pattern_code}
                      </span>
                      <span className="font-mono text-base-content/70">{s.recipient_mobile}</span>
                    </div>
                    {s.tokens && (
                      <p className="text-base-content/60 font-mono text-[11px]">
                        متغیرها: {JSON.stringify(s.tokens)}
                      </p>
                    )}
                  </div>
                  <div className="text-end space-y-1">
                    <span
                      className={cx(
                        'badge badge-xs font-bold',
                        s.status === 'sent'
                          ? 'badge-success badge-soft'
                          : s.status === 'pending'
                          ? 'badge-warning badge-soft'
                          : 'badge-error badge-soft',
                      )}
                    >
                      {s.status === 'sent' ? 'تحویل شد' : s.status === 'pending' ? 'در صف' : 'ناموفق'}
                    </span>
                    <p className="text-[10px] text-base-content/40">{relativeFa(s.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Full Profile Info */}
      {activeTab === 'profile' && (
        <div className="rounded-2xl border border-base-200 bg-base-100 p-6 shadow-xs space-y-5 max-w-3xl">
          <h2 className="font-bold text-base text-base-content">اطلاعات شناسنامه‌ای و پرونده</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1 p-3.5 bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 rounded-xl">
              <span className="text-base-content/50">نام نمایشی مشتری:</span>
              <p className="font-bold text-sm">{displayName}</p>
            </div>

            <div className="space-y-1 p-3.5 bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 rounded-xl">
              <span className="text-base-content/50">نام شرکت / کارگاه:</span>
              <p className="font-bold text-sm">{customer.company_name || '—'}</p>
            </div>

            <div className="space-y-1 p-3.5 bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 rounded-xl">
              <span className="text-base-content/50">نام و نام خانوادگی:</span>
              <p className="font-bold text-sm">
                {customer.first_name || customer.last_name
                  ? `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim()
                  : '—'}
              </p>
            </div>

            <div className="space-y-1 p-3.5 bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 rounded-xl">
              <span className="text-base-content/50">کد ملی / شناسه ملی:</span>
              <p className="font-bold text-sm font-mono">{customer.national_code || '—'}</p>
            </div>

            <div className="space-y-1 p-3.5 bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 rounded-xl">
              <span className="text-base-content/50">شماره همراه:</span>
              <p className="font-bold text-sm font-mono ltr-text text-start">{customer.mobile || '—'}</p>
            </div>

            <div className="space-y-1 p-3.5 bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 rounded-xl">
              <span className="text-base-content/50">تلفن ثابت:</span>
              <p className="font-bold text-sm font-mono ltr-text text-start">{customer.phone || '—'}</p>
            </div>

            <div className="space-y-1 p-3.5 bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 rounded-xl">
              <span className="text-base-content/50">ایمیل:</span>
              <p className="font-bold text-sm font-mono ltr-text text-start">{customer.email || '—'}</p>
            </div>

            <div className="space-y-1 p-3.5 bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 rounded-xl">
              <span className="text-base-content/50">کارشناس ثبت‌کننده:</span>
              <p className="font-bold text-sm">{customer.creator?.name || 'ثبت‌شده قبل از نسخه ۲'}</p>
            </div>

            <div className="space-y-1 p-3.5 bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 rounded-xl sm:col-span-2">
              <span className="text-base-content/50">استان و شهر:</span>
              <p className="font-bold text-sm">
                {customer.province || ''} {customer.city ? `- ${customer.city}` : ''}
              </p>
            </div>

            <div className="space-y-1 p-3.5 bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 rounded-xl sm:col-span-2">
              <span className="text-base-content/50">آدرس دقیق پستی:</span>
              <p className="font-medium text-sm leading-relaxed">{customer.address || '—'}</p>
            </div>

            <div className="space-y-1 p-3.5 bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 rounded-xl sm:col-span-2">
              <span className="text-base-content/50">یادداشت‌های پرونده:</span>
              <p className="font-medium text-sm leading-relaxed">{customer.notes || '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <CustomerFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customer={customer}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['customer', id] })
          qc.invalidateQueries({ queryKey: ['customers'] })
          setEditOpen(false)
        }}
      />

      <AssignDeviceModal
        open={assignOpen}
        onClose={() => {
          setAssignOpen(false)
          setEditingAssignment(null)
        }}
        customer={customer}
        assignment={editingAssignment}
        onSuccess={refreshAll}
      />

      <ServiceHistoryModal
        open={Boolean(servicePart)}
        onClose={() => setServicePart(null)}
        customerPart={servicePart}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['customer', id] })
          setServicePart(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingHistory)}
        onClose={() => setDeletingHistory(null)}
        onConfirm={() => deletingHistory && deleteHistoryMutation.mutate(deletingHistory)}
        title="حذف سابقه سرویس / تعمیر"
        message={`آیا از حذف سابقه «${deletingHistory?.history.description ?? ''}» اطمینان دارید؟ این عملیات قابل بازگشت نیست و فقط سابقه سرویس حذف می‌شود (تخصیص دستگاه و موجودی انبار تغییری نمی‌کند).`}
        confirmText="بله، حذف کن"
        tone="error"
        loading={deleteHistoryMutation.isPending}
      />

      <ConfirmDialog
        open={Boolean(deletingAssignment)}
        onClose={() => setDeletingAssignment(null)}
        onConfirm={() => deletingAssignment && deleteAssignmentMutation.mutate(deletingAssignment.id)}
        title="حذف دستگاه تخصیص‌یافته"
        message={`آیا از حذف «${deletingAssignment?.part?.name ?? 'این دستگاه'}» به تعداد ${num(
          deletingAssignment?.quantity ?? 1,
        )} عدد از پرونده این مشتری اطمینان دارید؟ موجودی بلافاصله به انبار برگشت داده می‌شود و این عملیات قابل بازگشت نیست. اگر سابقه سرویس/تعمیر ثبت شده باشد، حذف انجام نمی‌شود.`}
        confirmText="بله، حذف و برگشت به انبار"
        tone="error"
        loading={deleteAssignmentMutation.isPending}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="حذف پرونده مشتری"
        message={`آیا از حذف مشتری «${displayName}» و کلیه دستگاه‌ها و سوابق آن اطمینان دارید؟ موجودی دستگاه‌های تخصیص‌یافته به انبار برگشت داده می‌شود.`}
        confirmText="بله، حذف کن"
        tone="error"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
