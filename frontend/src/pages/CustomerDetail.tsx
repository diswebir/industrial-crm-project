import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Boxes,
  Building2,
  Cpu,
  History,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Receipt,
  RefreshCcw,
  Send,
  SlidersHorizontal,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Wrench,
} from 'lucide-react'
import { EmptyState, PageSkeleton } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import { Pagination } from '../components/ui/Pagination'
import { CustomerFormModal } from '../components/customers/CustomerFormModal'
import { AssignPartModal } from '../components/parts/AssignPartModal'
import { ServiceHistoryModal } from '../components/parts/ServiceHistoryModal'
import { Can } from '../components/common/Can'
import { apiErrorMessage, customerApi, inventoryApi, partApi } from '../services/api'
import { cx, dateFa, dateShort, dateTimeFa, num, relativeFa, toman } from '../utils/format'
import { inventoryTypeMeta } from '../utils/meta'
import type { CustomerPart, InventoryLog, PartServiceHistory } from '../types'

type ActiveTab = 'parts' | 'history' | 'inventory' | 'audit' | 'sms' | 'profile'

const SERVICE_TYPE_LABEL: Record<string, string> = {
  periodic: 'سرویس دوره‌ای',
  repair: 'تعمیر فنی',
  overhaul: 'اورهال',
}

const DEVICE_STATUS_LABEL: Record<string, string> = {
  active: 'فعال در محل مشتری',
  under_repair: 'در دست تعمیر',
  replaced: 'تعویض شده',
  retired: 'از رده خارج',
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<ActiveTab>('parts')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [assignPartOpen, setAssignPartOpen] = useState(false)
  /** ردیف تخصیص در حال ویرایش (تسک ۳) */
  const [editAssignment, setEditAssignment] = useState<CustomerPart | null>(null)
  /** ردیف تخصیص در انتظار حذف (تسک ۳) */
  const [deleteAssignment, setDeleteAssignment] = useState<CustomerPart | null>(null)
  const [servicePart, setServicePart] = useState<CustomerPart | null>(null)
  /** سابقه سرویس در حال ویرایش/حذف (تسک ۳) */
  const [editHistory, setEditHistory] = useState<{ row: PartServiceHistory; part: CustomerPart } | null>(null)
  const [deleteHistory, setDeleteHistory] = useState<{ row: PartServiceHistory; part: CustomerPart } | null>(null)
  const [inventoryPage, setInventoryPage] = useState(1)

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customerApi.get(id!),
    enabled: Boolean(id),
  })

  const { data: inventoryPageData } = useQuery({
    queryKey: ['inventory-logs', 'customer', id, inventoryPage],
    queryFn: () => inventoryApi.logs({ customer_id: id!, page: inventoryPage, per_page: 10 }),
    enabled: Boolean(id) && activeTab === 'inventory',
  })

  const deleteMutation = useMutation({
    mutationFn: () => customerApi.delete(id!),
    onSuccess: (res) => {
      toast.success(res.message || 'مشتری با موفقیت حذف شد')
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      nav('/customers')
    },
    onError: (err: any) => toast.error(apiErrorMessage(err, 'خطا در حذف مشتری')),
  })

  /** حذف تخصیص دستگاه — موجودی به‌طور خودکار به انبار بازمی‌گردد (تسک ۳ و ۴) */
  const deleteAssignmentMutation = useMutation({
    mutationFn: (row: CustomerPart) => partApi.deleteAssignment(row.id),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidateAll()
      setDeleteAssignment(null)
    },
    onError: (err: any) => {
      toast.error(apiErrorMessage(err, 'خطا در حذف دستگاه تخصیص‌یافته'))
      setDeleteAssignment(null)
    },
  })

  /** حذف سابقه سرویس/تعمیر (تسک ۳) */
  const deleteHistoryMutation = useMutation({
    mutationFn: (row: PartServiceHistory) => partApi.deleteServiceHistory(row.id),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidateAll()
      setDeleteHistory(null)
    },
    onError: (err: any) => {
      toast.error(apiErrorMessage(err, 'خطا در حذف سابقه سرویس'))
      setDeleteHistory(null)
    },
  })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['customer', id] })
    qc.invalidateQueries({ queryKey: ['customers'] })
    qc.invalidateQueries({ queryKey: ['parts-catalog'] })
    qc.invalidateQueries({ queryKey: ['inventory-logs'] })
    qc.invalidateQueries({ queryKey: ['inventory-summary'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
  }

  if (isLoading) return <PageSkeleton />
  if (error || !customer) {
    return (
      <EmptyState
        title="مشتری یافت نشد"
        subtitle="ممکن است این مشتری حذف شده باشد، شناسه آن نامعتبر باشد یا دسترسی مشاهده آن را نداشته باشید."
        action={
          <Link to="/customers" className="btn btn-primary btn-sm">
            بازگشت به فهرست مشتریان
          </Link>
        }
      />
    )
  }

  const customerParts = customer.customer_parts ?? []
  const histories = customer.histories ?? []
  const smsLogs = customer.sms_logs ?? []
  const displayName =
    customer.full_name || `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || customer.company_name || '—'
  const totalDevices = customerParts.reduce((sum, cp) => sum + Number(cp.quantity ?? 1), 0)
  const totalInvoice = customerParts.reduce((sum, cp) => sum + Number(cp.invoice_amount ?? 0), 0)
  const serviceRows = customerParts.reduce((sum, cp) => sum + (cp.service_histories?.length ?? 0), 0)
  const inventoryLogs: InventoryLog[] = inventoryPageData?.data ?? []

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          to="/customers"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-base-content/60 transition-colors hover:text-primary"
        >
          <ArrowRight className="size-4" /> بازگشت به فهرست مشتریان
        </Link>
      </div>

      {/* Header Profile Card */}
      <div className="relative overflow-hidden rounded-2xl border border-base-200 bg-base-100 p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className={cx(
                'flex size-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold',
                customer.type === 'company' ? 'bg-blue-600/10 text-blue-700' : 'bg-indigo-600/10 text-indigo-700',
              )}
            >
              {customer.type === 'company' ? <Building2 className="size-8" /> : <User className="size-8" />}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-base-content">{displayName}</h1>
                {customer.customer_type === 'effective' ? (
                  <span className="badge badge-success badge-soft gap-1 text-xs font-bold">
                    <UserCheck className="size-3" /> مشتری بالفعل
                  </span>
                ) : (
                  <span className="badge badge-warning badge-soft gap-1 text-xs font-bold">
                    <UserPlus className="size-3" /> مشتری بالقوه
                  </span>
                )}
                <span className="badge badge-sm border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {customer.type === 'company' ? 'شخصیت حقوقی' : 'شخصیت حقیقی'}
                </span>
              </div>

              {customer.type === 'company' && customer.company_name && (
                <p className="text-xs font-semibold text-base-content/60">{customer.company_name}</p>
              )}

              <div className="flex flex-wrap items-center gap-4 pt-1 font-mono text-xs text-base-content/60">
                {customer.mobile ? (
                  <span className="ltr-text flex items-center gap-1">
                    <Phone className="size-3.5 text-base-content/40" /> {customer.mobile}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-sans text-base-content/40">
                    <Phone className="size-3.5" /> شماره همراه ثبت نشده
                  </span>
                )}
                {customer.city && (
                  <span className="flex items-center gap-1 font-sans">
                    <MapPin className="size-3.5 text-base-content/40" /> {customer.province} - {customer.city}
                  </span>
                )}
              </div>

              {/* خلاصه دستگاه‌ها و فاکتورها (تسک ۳) */}
              <div className="flex flex-wrap items-center gap-2 pt-1.5">
                <span className="badge badge-ghost badge-sm gap-1 font-sans">
                  <Boxes className="size-3.5" /> {num(totalDevices)} دستگاه
                </span>
                <span className="badge badge-ghost badge-sm gap-1 font-sans">
                  <Cpu className="size-3.5" /> {num(customerParts.length)} ردیف تخصیص
                </span>
                <span className="badge badge-ghost badge-sm gap-1 font-sans">
                  <Wrench className="size-3.5" /> {num(serviceRows)} سابقه سرویس
                </span>
                {totalInvoice > 0 && (
                  <span className="badge badge-ghost badge-sm gap-1 font-sans">
                    <Receipt className="size-3.5" /> {toman(totalInvoice)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Can permission="parts.assign">
              <button className="btn btn-sm btn-primary gap-1.5" onClick={() => setAssignPartOpen(true)}>
                <Plus className="size-4" /> تخصیص دستگاه جدید
              </button>
            </Can>

            <Can permission="sms.send">
              <Link
                to={
                  customer.mobile
                    ? `/sms?mobile=${customer.mobile}&customer_id=${customer.id}`
                    : `/sms?customer_id=${customer.id}`
                }
                className={cx('btn btn-sm btn-outline gap-1.5', !customer.mobile && 'btn-disabled')}
                title={customer.mobile ? 'ارسال پیامک' : 'برای ارسال پیامک، شماره همراه مشتری ثبت نشده است'}
              >
                <Send className="size-4" /> ارسال پیامک
              </Link>
            </Can>

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

      {/* Tabs Bar */}
      <div className="overflow-x-auto border-b border-base-200">
        <div role="tablist" className="tabs tabs-border">
          <button
            role="tab"
            className={cx('tab gap-2 text-xs font-bold', activeTab === 'parts' && 'tab-active')}
            onClick={() => setActiveTab('parts')}
          >
            <Cpu className="size-4" />
            دستگاه‌های تخصیص‌یافته ({num(customerParts.length)})
          </button>
          <button
            role="tab"
            className={cx('tab gap-2 text-xs font-bold', activeTab === 'history' && 'tab-active')}
            onClick={() => setActiveTab('history')}
          >
            <Wrench className="size-4" />
            سوابق سرویس و تعمیر ({num(serviceRows)})
          </button>
          <Can permission="inventory.logs">
            <button
              role="tab"
              className={cx('tab gap-2 text-xs font-bold', activeTab === 'inventory' && 'tab-active')}
              onClick={() => setActiveTab('inventory')}
            >
              <Boxes className="size-4" />
              تراکنش‌های انبار
            </button>
          </Can>
          <button
            role="tab"
            className={cx('tab gap-2 text-xs font-bold', activeTab === 'audit' && 'tab-active')}
            onClick={() => setActiveTab('audit')}
          >
            <History className="size-4" />
            تاریخچه اقدامات ({num(histories.length)})
          </button>
          <button
            role="tab"
            className={cx('tab gap-2 text-xs font-bold', activeTab === 'sms' && 'tab-active')}
            onClick={() => setActiveTab('sms')}
          >
            <MessageSquare className="size-4" />
            پیامک‌های ارسالی ({num(smsLogs.length)})
          </button>
          <button
            role="tab"
            className={cx('tab gap-2 text-xs font-bold', activeTab === 'profile' && 'tab-active')}
            onClick={() => setActiveTab('profile')}
          >
            <User className="size-4" />
            مشخصات کامل پرونده
          </button>
        </div>
      </div>

      {/* Tab 1: Assigned devices */}
      {activeTab === 'parts' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-base-content">دستگاه‌های تخصیص‌یافته به مشتری</h2>
            <Can permission="parts.assign">
              <button className="btn btn-xs btn-primary gap-1" onClick={() => setAssignPartOpen(true)}>
                <Plus className="size-3.5" /> تخصیص دستگاه دیگر
              </button>
            </Can>
          </div>

          {!customerParts.length ? (
            <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 p-8 text-center">
              <Cpu className="mx-auto mb-2 size-12 text-base-content/30" />
              <p className="text-sm font-bold">هیچ دستگاهی برای این مشتری ثبت نشده است</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-base-content/60">
                با تخصیص اولین دستگاه به همراه شماره سریال یکتا، تعداد و اطلاعات فاکتور، وضعیت مشتری به‌طور خودکار به
                «بالفعل» تغییر می‌کند و تعداد دستگاه از موجودی انبار کسر می‌شود.
              </p>
              <Can permission="parts.assign">
                <button className="btn btn-sm btn-primary mt-4" onClick={() => setAssignPartOpen(true)}>
                  <Plus className="size-4" /> تخصیص اولین دستگاه
                </button>
              </Can>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">
              {customerParts.map((cp) => (
                <div key={cp.id} className="space-y-4 rounded-2xl border border-base-200 bg-base-100 p-5 shadow-xs">
                  <div className="flex flex-col gap-3 border-b border-base-200/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-blue-500/10 font-bold text-blue-600">
                        <Cpu className="size-6" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-base-content">{cp.part?.name ?? 'دستگاه صنعتی'}</h3>
                          <span className="badge badge-primary font-mono text-xs">{cp.serial_number}</span>
                          <span className="badge badge-ghost font-mono text-xs">تعداد: {num(cp.quantity ?? 1)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-base-content/60">
                          کد کاتالوگ: <span className="font-mono">{cp.part?.code ?? '—'}</span> • دوره گارانتی/سرویس:{' '}
                          {num(cp.part?.periodic_service_months ?? 12)} ماه
                          {cp.assigned_by?.name ? ` • تخصیص‌دهنده: ${cp.assigned_by.name}` : ''}
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
                              : 'border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                        )}
                      >
                        {DEVICE_STATUS_LABEL[cp.status] ?? cp.status}
                      </span>

                      <Can permission="parts.history">
                        <button className="btn btn-xs btn-outline btn-primary gap-1" onClick={() => setServicePart(cp)}>
                          <Wrench className="size-3.5" /> ثبت اقدام / تعمیر
                        </button>
                      </Can>

                      {/* ویرایش و حذف تخصیص — رفع باگ تسک ۳ */}
                      <Can permission="parts.assign">
                        <button
                          className="btn btn-xs btn-outline gap-1"
                          onClick={() => setEditAssignment(cp)}
                          title="ویرایش تعداد، فاکتور، سریال و تاریخ"
                        >
                          <Pencil className="size-3.5" /> ویرایش
                        </button>
                      </Can>
                      <Can permission="parts.assign">
                        <button
                          className="btn btn-xs btn-outline btn-error gap-1"
                          onClick={() => setDeleteAssignment(cp)}
                          title="حذف تخصیص و بازگشت موجودی به انبار"
                        >
                          <Trash2 className="size-3.5" /> حذف
                        </button>
                      </Can>
                    </div>
                  </div>

                  {/* Invoice & dates (تسک ۳) */}
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/60 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <span className="block text-base-content/50">تعداد دستگاه:</span>
                      <span className="font-bold">{num(cp.quantity ?? 1)} {cp.part?.unit_label || 'عدد'}</span>
                    </div>
                    <div>
                      <span className="block text-base-content/50">شماره فاکتور:</span>
                      <span className="font-mono font-bold" dir="ltr">
                        {cp.invoice_number || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-base-content/50">مبلغ فاکتور:</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        {cp.invoice_amount === null || cp.invoice_amount === undefined || cp.invoice_amount === ''
                          ? 'ثبت نشده'
                          : toman(Number(cp.invoice_amount))}
                      </span>
                    </div>
                    <div>
                      <span className="block text-base-content/50">تاریخ تحویل یا نصب:</span>
                      <span className="font-medium">
                        {cp.installation_date ? `${dateFa(cp.installation_date)} (${dateShort(cp.installation_date)})` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-base-content/50">پوشش گارانتی تا:</span>
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {cp.warranty_expire_date
                          ? `${dateFa(cp.warranty_expire_date)} (${dateShort(cp.warranty_expire_date)})`
                          : '—'}
                      </span>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <span className="block text-base-content/50">توضیحات اختصاصی دستگاه:</span>
                      <span className="font-medium">{cp.notes || 'بدون یادداشت'}</span>
                    </div>
                  </div>

                  {/* Service histories of this device */}
                  <div className="space-y-2 pt-2">
                    <h4 className="flex items-center gap-1.5 text-xs font-bold text-base-content/70">
                      <Wrench className="size-3.5" /> سوابق خدمات، بررسی و تعمیرات این دستگاه (
                      {num(cp.service_histories?.length ?? 0)})
                    </h4>

                    {!cp.service_histories?.length ? (
                      <p className="py-2 text-xs italic text-base-content/40">
                        تاکنون سابقه تعمیر یا اقدام سرویسی برای این دستگاه ثبت نشده است.
                      </p>
                    ) : (
                      <div className="divide-y divide-base-200/60 overflow-hidden rounded-xl border border-base-200/60 bg-base-100">
                        {cp.service_histories.map((sh) => (
                          <div
                            key={sh.id}
                            className="flex flex-col gap-2 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
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
                                  {SERVICE_TYPE_LABEL[sh.service_type] ?? sh.service_type}
                                </span>
                                <span className="font-medium">{sh.description}</span>
                              </div>
                              <p className="text-[11px] text-base-content/50">
                                تاریخ اقدام: {sh.service_date ? `${dateFa(sh.service_date)} (${dateShort(sh.service_date)})` : '—'}
                                {sh.performed_by?.name ? ` • توسط: ${sh.performed_by.name}` : ''}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-3">
                              {sh.cost ? (
                                <div className="text-xs font-semibold text-base-content/80">{toman(Number(sh.cost))}</div>
                              ) : null}
                              <Can permission="parts.history">
                                <button
                                  className="btn btn-ghost btn-xs btn-square"
                                  title="ویرایش سابقه سرویس"
                                  onClick={() => setEditHistory({ row: sh, part: cp })}
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                              </Can>
                              <Can permission="parts.history">
                                <button
                                  className="btn btn-ghost btn-xs btn-square text-error"
                                  title="حذف سابقه سرویس"
                                  onClick={() => setDeleteHistory({ row: sh, part: cp })}
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

      {/* Tab 2: All service histories across devices (تسک ۳) */}
      {activeTab === 'history' && (
        <div className="space-y-4 rounded-2xl border border-base-200 bg-base-100 p-5 shadow-xs">
          <h2 className="text-base font-bold text-base-content">سوابق سرویس و تعمیر همه دستگاه‌های این مشتری</h2>

          {serviceRows === 0 ? (
            <p className="py-8 text-center text-xs text-base-content/50">
              سابقه‌ای ثبت نشده است. از تب «دستگاه‌های تخصیص‌یافته» اقدام به ثبت سابقه کنید.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-base-200/60">
              <table className="table table-sm">
                <thead>
                  <tr className="text-[11px]">
                    <th>دستگاه</th>
                    <th>سریال</th>
                    <th>نوع اقدام</th>
                    <th>شرح</th>
                    <th>تاریخ</th>
                    <th>انجام‌دهنده</th>
                    <th>هزینه</th>
                    <th className="text-end">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {customerParts.flatMap((cp) =>
                    (cp.service_histories ?? []).map((sh) => (
                      <tr key={`${cp.id}-${sh.id}`}>
                        <td className="font-semibold">{cp.part?.name ?? '—'}</td>
                        <td className="font-mono text-[11px]" dir="ltr">
                          {cp.serial_number}
                        </td>
                        <td>
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
                            {SERVICE_TYPE_LABEL[sh.service_type] ?? sh.service_type}
                          </span>
                        </td>
                        <td className="max-w-xs">
                          <span className="line-clamp-2 text-[11px]">{sh.description}</span>
                        </td>
                        <td className="whitespace-nowrap text-[11px]">{dateFa(sh.service_date)}</td>
                        <td className="text-[11px]">{sh.performed_by?.name ?? '—'}</td>
                        <td className="whitespace-nowrap text-[11px] font-semibold">
                          {sh.cost ? toman(Number(sh.cost)) : '—'}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <Can permission="parts.history">
                              <button
                                className="btn btn-ghost btn-xs btn-square"
                                title="ویرایش"
                                onClick={() => setEditHistory({ row: sh, part: cp })}
                              >
                                <Pencil className="size-3.5" />
                              </button>
                            </Can>
                            <Can permission="parts.history">
                              <button
                                className="btn btn-ghost btn-xs btn-square text-error"
                                title="حذف"
                                onClick={() => setDeleteHistory({ row: sh, part: cp })}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </Can>
                          </div>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Inventory transactions of this customer (تسک ۴) */}
      {activeTab === 'inventory' && (
        <div className="space-y-4 rounded-2xl border border-base-200 bg-base-100 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-0">
            <h2 className="text-base font-bold text-base-content">تراکنش‌های انبار مربوط به این مشتری</h2>
            <Link to="/inventory" className="btn btn-xs btn-ghost gap-1">
              <SlidersHorizontal className="size-3.5" /> مشاهده کل تاریخچه انبار
            </Link>
          </div>

          {!inventoryLogs.length ? (
            <p className="py-8 text-center text-xs text-base-content/50">
              تراکنش انباری برای این مشتری ثبت نشده است.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto px-2">
                <table className="table table-sm">
                  <thead>
                    <tr className="text-[11px]">
                      <th>نوع عملیات</th>
                      <th>دستگاه</th>
                      <th>تعداد</th>
                      <th>موجودی قبل</th>
                      <th>موجودی بعد</th>
                      <th>ثبت‌کننده</th>
                      <th>تاریخ و ساعت</th>
                      <th>توضیحات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryLogs.map((log) => {
                      const meta = inventoryTypeMeta(log.type)
                      return (
                        <tr key={log.id}>
                          <td>
                            <span className={cx('badge badge-xs gap-1 font-bold', meta.badge)}>
                              {log.type === 'in' && <ArrowDownToLine className="size-3" />}
                              {log.type === 'out' && <ArrowUpFromLine className="size-3" />}
                              {log.type === 'return' && <RefreshCcw className="size-3" />}
                              {meta.label}
                            </span>
                          </td>
                          <td className="font-semibold">{log.part?.name ?? '—'}</td>
                          <td className="font-mono">{num(log.quantity)}</td>
                          <td className="font-mono text-base-content/60">{num(log.stock_before)}</td>
                          <td className="font-mono font-bold">{num(log.stock_after)}</td>
                          <td className="text-[11px]">{log.user?.name ?? 'سیستم'}</td>
                          <td className="whitespace-nowrap text-[11px]">{dateTimeFa(log.logged_at)}</td>
                          <td className="max-w-xs text-[11px] text-base-content/60">
                            <span className="line-clamp-1">{log.notes || '—'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {inventoryPageData && inventoryPageData.total > 0 && (
                <Pagination
                  page={inventoryPageData.current_page}
                  pageSize={inventoryPageData.per_page || 10}
                  total={inventoryPageData.total}
                  onPage={setInventoryPage}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 4: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="space-y-4 rounded-2xl border border-base-200 bg-base-100 p-5 shadow-xs">
          <h2 className="text-base font-bold text-base-content">تاریخچه تغییرات و اقدامات سیستم</h2>
          {!histories.length ? (
            <p className="py-6 text-center text-xs text-base-content/50">تاریخچه‌ای ثبت نشده است.</p>
          ) : (
            <div className="divide-y divide-base-200/60">
              {histories.map((h) => (
                <div key={h.id} className="flex items-start gap-3 py-3 text-xs">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-base-200 text-base-content/70">
                    <History className="size-3.5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-base-content">{h.description}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-base-content/50">
                      <span>اقدام‌کننده: {h.user ? h.user.name : 'سیستم'}</span>
                      <span>•</span>
                      <span title={dateTimeFa(h.created_at)}>{relativeFa(h.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: SMS Logs */}
      {activeTab === 'sms' && (
        <div className="space-y-4 rounded-2xl border border-base-200 bg-base-100 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-base-content">پیامک‌های ارسال‌شده به این مشتری (ملی‌پیامک)</h2>
            <Can permission="sms.send">
              <Link
                to={
                  customer.mobile
                    ? `/sms?mobile=${customer.mobile}&customer_id=${customer.id}`
                    : `/sms?customer_id=${customer.id}`
                }
                className={cx('btn btn-xs btn-primary gap-1', !customer.mobile && 'btn-disabled')}
              >
                <Send className="size-3" /> ارسال پیامک جدید
              </Link>
            </Can>
          </div>

          {!smsLogs.length ? (
            <p className="py-8 text-center text-xs text-base-content/50">پیامکی برای این مشتری ثبت نشده است.</p>
          ) : (
            <div className="divide-y divide-base-200/60">
              {smsLogs.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="badge badge-xs border border-slate-200 bg-slate-100 font-mono text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        الگوی {s.pattern_code}
                      </span>
                      <span className="font-mono text-base-content/70">{s.recipient_mobile}</span>
                    </div>
                    {s.tokens && (
                      <p className="font-mono text-[11px] text-base-content/60">متغیرها: {JSON.stringify(s.tokens)}</p>
                    )}
                  </div>
                  <div className="space-y-1 text-end">
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

      {/* Tab 6: Full Profile Info */}
      {activeTab === 'profile' && (
        <div className="max-w-3xl space-y-5 rounded-2xl border border-base-200 bg-base-100 p-6 shadow-xs">
          <h2 className="text-base font-bold text-base-content">اطلاعات شناسنامه‌ای و پرونده</h2>
          <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-base-content/50">نام و نام خانوادگی:</span>
              <p className="text-sm font-bold">
                {`${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || 'ثبت نشده (شخصیت حقوقی)'}
              </p>
            </div>

            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-base-content/50">شرکت / کارگاه:</span>
              <p className="text-sm font-bold">{customer.company_name || '—'}</p>
            </div>

            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-base-content/50">کد ملی / شناسه ملی:</span>
              <p className="font-mono text-sm font-bold">{customer.national_code || '—'}</p>
            </div>

            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-base-content/50">شماره همراه:</span>
              <p className="ltr-text text-start font-mono text-sm font-bold">{customer.mobile || 'ثبت نشده'}</p>
            </div>

            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-base-content/50">تلفن ثابت:</span>
              <p className="ltr-text text-start font-mono text-sm font-bold">{customer.phone || '—'}</p>
            </div>

            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-base-content/50">ایمیل:</span>
              <p className="ltr-text text-start font-mono text-sm font-bold">{customer.email || '—'}</p>
            </div>

            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60 sm:col-span-2">
              <span className="text-base-content/50">استان و شهر:</span>
              <p className="text-sm font-bold">
                {customer.province || '—'} {customer.city ? `- ${customer.city}` : ''}
              </p>
            </div>

            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60 sm:col-span-2">
              <span className="text-base-content/50">آدرس دقیق پستی:</span>
              <p className="text-sm font-medium leading-relaxed">{customer.address || '—'}</p>
            </div>

            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60 sm:col-span-2">
              <span className="text-base-content/50">یادداشت‌های پرونده:</span>
              <p className="text-sm font-medium leading-relaxed">{customer.notes || '—'}</p>
            </div>

            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60 sm:col-span-2">
              <span className="text-base-content/50">ثبت‌کننده پرونده (مالک مشتری):</span>
              <p className="text-sm font-bold">{customer.created_by?.name ?? '—'}</p>
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
          invalidateAll()
          setEditOpen(false)
        }}
      />

      <AssignPartModal
        open={assignPartOpen}
        onClose={() => setAssignPartOpen(false)}
        customer={customer}
        onSuccess={() => {
          invalidateAll()
          setAssignPartOpen(false)
        }}
      />

      {/* ویرایش تخصیص دستگاه (تسک ۳) */}
      <AssignPartModal
        open={Boolean(editAssignment)}
        onClose={() => setEditAssignment(null)}
        customer={customer}
        assignment={editAssignment}
        onSuccess={() => {
          invalidateAll()
          setEditAssignment(null)
        }}
      />

      <ServiceHistoryModal
        open={Boolean(servicePart)}
        onClose={() => setServicePart(null)}
        customerPart={servicePart}
        onSuccess={() => {
          invalidateAll()
          setServicePart(null)
        }}
      />

      {/* ویرایش سابقه سرویس (تسک ۳) */}
      <ServiceHistoryModal
        open={Boolean(editHistory)}
        onClose={() => setEditHistory(null)}
        customerPart={editHistory?.part ?? null}
        history={editHistory?.row ?? null}
        onSuccess={() => {
          invalidateAll()
          setEditHistory(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteAssignment)}
        onClose={() => setDeleteAssignment(null)}
        onConfirm={() => deleteAssignment && deleteAssignmentMutation.mutate(deleteAssignment)}
        title="حذف دستگاه تخصیص‌یافته"
        message={`آیا از حذف تخصیص دستگاه «${deleteAssignment?.part?.name ?? ''}» با سریال ${
          deleteAssignment?.serial_number ?? ''
        } و تعداد ${num(deleteAssignment?.quantity ?? 1)} عدد اطمینان دارید؟ با این کار ${num(
          deleteAssignment?.quantity ?? 1,
        )} عدد به موجودی انبار بازگردانده می‌شود و رکورد آن در تاریخچه انبار باقی می‌ماند.`}
        confirmText="بله، حذف کن"
        tone="error"
        loading={deleteAssignmentMutation.isPending}
      />

      <ConfirmDialog
        open={Boolean(deleteHistory)}
        onClose={() => setDeleteHistory(null)}
        onConfirm={() => deleteHistory && deleteHistoryMutation.mutate(deleteHistory.row)}
        title="حذف سابقه سرویس/تعمیر"
        message={`آیا از حذف سابقه «${SERVICE_TYPE_LABEL[deleteHistory?.row.service_type ?? ''] ?? ''}» مربوط به ${
          deleteHistory?.row.service_date ? dateFa(deleteHistory.row.service_date) : ''
        } اطمینان دارید؟ این عملیات قابل بازگشت نیست.`}
        confirmText="بله، حذف کن"
        tone="error"
        loading={deleteHistoryMutation.isPending}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="حذف پرونده مشتری"
        message={`آیا از حذف مشتری «${displayName}» و کلیه دستگاه‌های تخصیص‌یافته و سوابق آن اطمینان دارید؟ موجودی دستگاه‌ها به انبار بازمی‌گردد.`}
        confirmText="بله، حذف کن"
        tone="error"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
