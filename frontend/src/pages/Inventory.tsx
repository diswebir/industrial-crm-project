import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Cpu,
  FileSpreadsheet,
  History,
  PackageCheck,
  RefreshCcw,
  SlidersHorizontal,
} from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { SearchInput } from '../components/ui/SearchInput'
import { DatePicker } from '../components/ui/DatePicker'
import { EmptyState, Field, TableSkeleton } from '../components/ui/Field'
import { Pagination } from '../components/ui/Pagination'
import { Can } from '../components/common/Can'
import { StockMovementModal, type StockMovementType } from '../components/parts/StockMovementModal'
import { inventoryApi, partApi } from '../services/api'
import { cx, dateTimeFa, num } from '../utils/format'
import { INVENTORY_TYPE_OPTIONS, inventoryTypeMeta } from '../utils/meta'
import type { InventoryLog, Part } from '../types'

type Tab = 'logs' | 'stock'

/**
 * صفحه انبار و تاریخچه تراکنش‌ها (تسک ۴)
 *
 * - فهرست کامل ورود/خروج/برگشت/اصلاح موجودی با نوع عملیات، تعداد،
 *   موجودی قبل و بعد، نام کاربر ثبت‌کننده و تاریخ و ساعت دقیق.
 * - نام مشتری در ردیف‌های خروج به‌صورت لینک قابل کلیک به پروفایل مشتری.
 * - ثبت حرکت دستی انبار برای هر دستگاه.
 */
export default function Inventory() {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()

  const [tab, setTab] = useState<Tab>('logs')
  const [q, setQ] = useState(params.get('q') || '')
  const [type, setType] = useState<string>(params.get('type') || '')
  const [partId, setPartId] = useState<string>(params.get('part_id') || '')
  const [from, setFrom] = useState<string | null>(params.get('from') || null)
  const [to, setTo] = useState<string | null>(params.get('to') || null)
  const [page, setPage] = useState(1)

  const [stockPart, setStockPart] = useState<Part | null>(null)
  const [stockType, setStockType] = useState<StockMovementType>('in')

  /** همگام‌سازی فیلترها با آدرس صفحه (برای لینک‌های ورودی از صفحه دستگاه‌ها) */
  useEffect(() => {
    setQ(params.get('q') || '')
    setType(params.get('type') || '')
    setPartId(params.get('part_id') || '')
    setFrom(params.get('from') || null)
    setTo(params.get('to') || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const { data: parts = [] } = useQuery({
    queryKey: ['parts-catalog', 'inventory-filter'],
    queryFn: () => partApi.list(),
  })

  const { data: summary } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => inventoryApi.summary(),
  })

  const { data: logsPage, isLoading } = useQuery({
    queryKey: ['inventory-logs', { q, type, partId, from, to, page }],
    queryFn: () =>
      inventoryApi.logs({
        q: q.trim() || undefined,
        type: type || undefined,
        part_id: partId || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        per_page: 20,
      }),
    placeholderData: (prev) => prev,
  })

  const logs: InventoryLog[] = logsPage?.data ?? []

  const partOptions = useMemo(
    () => parts.map((p) => ({ value: String(p.id), label: `${p.name} (${p.code})`, hint: `موجودی: ${num(p.stock_quantity ?? 0)}` })),
    [parts],
  )

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }

  const clearFilters = () => {
    setParams(new URLSearchParams(), { replace: true })
    setPage(1)
  }

  const hasFilter = Boolean(q || type || partId || from || to)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['inventory-logs'] })
    qc.invalidateQueries({ queryKey: ['inventory-summary'] })
    qc.invalidateQueries({ queryKey: ['parts-catalog'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    qc.invalidateQueries({ queryKey: ['customer'] })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="انبار و تاریخچه تراکنش‌های دستگاه‌ها"
        subtitle="ثبت ورود و خروج دستی، موجودی لحظه‌ای هر دستگاه و گزارش کامل حرکات انبار همراه با نام کاربر و تاریخ دقیق"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/parts" className="btn btn-sm btn-outline gap-1.5">
              <Cpu className="size-4" /> کاتالوگ دستگاه‌ها
            </Link>
            <Can permission="inventory.manage">
              <button
                className="btn btn-sm btn-primary gap-1.5"
                onClick={() => setTab('stock')}
                title="برای ثبت حرکت انبار، از تب «موجودی دستگاه‌ها» اقدام کنید"
              >
                <Boxes className="size-4" /> ثبت حرکت انبار
              </button>
            </Can>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
          <p className="flex items-center gap-1.5 text-[11px] text-base-content/55">
            <PackageCheck className="size-3.5" /> موجودی کل انبار
          </p>
          <p className="mt-1 text-xl font-black text-primary">{num(summary?.total_stock ?? 0)} عدد</p>
          <p className="mt-0.5 text-[10px] text-base-content/45">{num(summary?.total_devices ?? 0)} مدل دستگاه</p>
        </div>
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
          <p className="flex items-center gap-1.5 text-[11px] text-base-content/55">
            <Cpu className="size-3.5" /> تخصیص‌یافته به مشتریان
          </p>
          <p className="mt-1 text-xl font-black text-info">{num(summary?.assigned_quantity ?? 0)} عدد</p>
          <p className="mt-0.5 text-[10px] text-base-content/45">
            در {num(summary?.assignment_rows ?? 0)} ردیف تخصیص
          </p>
        </div>
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
          <p className="flex items-center gap-1.5 text-[11px] text-base-content/55">
            <ArrowDownToLine className="size-3.5 text-success" /> ورود امروز
          </p>
          <p className="mt-1 text-xl font-black text-success">{num(summary?.received_today ?? 0)} عدد</p>
          <p className="mt-0.5 text-[10px] text-base-content/45">
            <ArrowUpFromLine className="me-1 inline size-3 text-warning" />
            خروج امروز: {num(summary?.issued_today ?? 0)} عدد
          </p>
        </div>
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
          <p className="flex items-center gap-1.5 text-[11px] text-base-content/55">
            <AlertTriangle className="size-3.5 text-error" /> دارای کمبود موجودی
          </p>
          <p className={cx('mt-1 text-xl font-black', (summary?.low_stock_count ?? 0) > 0 ? 'text-error' : 'text-success')}>
            {num(summary?.low_stock_count ?? 0)} مدل
          </p>
          {summary?.low_stock_items?.length ? (
            <p className="mt-0.5 truncate text-[10px] text-base-content/45" title={summary.low_stock_items.map((i) => i.name).join('، ')}>
              {summary.low_stock_items.slice(0, 2).map((i) => i.name).join('، ')}
            </p>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto border-b border-base-200">
        <div role="tablist" className="tabs tabs-border">
          <button
            role="tab"
            className={cx('tab gap-2 text-xs font-bold', tab === 'logs' && 'tab-active')}
            onClick={() => setTab('logs')}
          >
            <History className="size-4" />
            تاریخچه تراکنش‌های انبار
          </button>
          <button
            role="tab"
            className={cx('tab gap-2 text-xs font-bold', tab === 'stock' && 'tab-active')}
            onClick={() => setTab('stock')}
          >
            <Boxes className="size-4" />
            موجودی دستگاه‌ها و ثبت حرکت
          </button>
        </div>
      </div>

      {tab === 'logs' && (
        <>
          {/* Filters */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-base-200 bg-base-100 p-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <SearchInput
                value={q}
                onChange={(val) => {
                  setQ(val)
                  updateParam('q', val.trim() || null)
                }}
                placeholder="جستجو در نام دستگاه، کد فنی، کاربر، شماره سند یا توضیحات..."
              />
            </div>

            <Field label="نوع عملیات">
              <select
                className="select select-bordered w-full text-xs"
                value={type}
                onChange={(e) => {
                  setType(e.target.value)
                  updateParam('type', e.target.value || null)
                }}
              >
                <option value="">همه عملیات‌ها</option>
                {INVENTORY_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="از تاریخ">
              <DatePicker value={from} onChange={(val) => { setFrom(val); updateParam('from', val) }} placeholder="تاریخ شروع..." />
            </Field>

            <Field label="تا تاریخ">
              <DatePicker value={to} onChange={(val) => { setTo(val); updateParam('to', val) }} placeholder="تاریخ پایان..." />
            </Field>

            <div className="md:col-span-2 xl:col-span-5 flex flex-wrap items-end justify-between gap-3">
              <div className="w-full md:w-80">
                <Field label="دستگاه">
                  <select
                    className="select select-bordered w-full text-xs"
                    value={partId}
                    onChange={(e) => {
                      setPartId(e.target.value)
                      updateParam('part_id', e.target.value || null)
                    }}
                  >
                    <option value="">همه دستگاه‌ها</option>
                    {partOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="flex items-center gap-2">
                {hasFilter && (
                  <button className="btn btn-ghost btn-xs gap-1" onClick={clearFilters}>
                    <RefreshCcw className="size-3.5" /> پاک کردن فیلترها
                  </button>
                )}
                <p className="text-xs text-base-content/55">
                  {num(logsPage?.total ?? 0)} تراکنش انبار یافت شد
                </p>
              </div>
            </div>
          </div>

          {/* Logs table */}
          <div className="overflow-hidden rounded-2xl border border-base-200 bg-base-100 shadow-xs">
            {isLoading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : !logs.length ? (
              <EmptyState
                title="تراکنش انباری یافت نشد"
                description={
                  hasFilter
                    ? 'هیچ رکوردی مطابق با فیلترهای انتخاب‌شده وجود ندارد.'
                    : 'با ثبت اولین ورود کالا یا تخصیص دستگاه به مشتری، تراکنش‌های انبار اینجا نمایش داده می‌شوند.'
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="table table-hover">
                    <thead>
                      <tr className="border-b border-base-200 bg-slate-50 text-[11px] font-bold text-base-content/75 dark:bg-slate-900/60">
                        <th>نوع عملیات</th>
                        <th>دستگاه</th>
                        <th>تعداد</th>
                        <th>موجودی قبل</th>
                        <th>موجودی بعد</th>
                        <th>مشتری</th>
                        <th>ثبت‌کننده (کارمند)</th>
                        <th>تاریخ و ساعت</th>
                        <th>سند / توضیحات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-base-200/80">
                      {logs.map((log) => {
                        const meta = inventoryTypeMeta(log.type)
                        return (
                          <tr key={log.id} className="text-xs transition-colors hover:bg-base-200/50">
                            <td>
                              <span className={cx('badge badge-xs gap-1 font-bold', meta.badge)}>
                                {log.type === 'in' && <ArrowDownToLine className="size-3" />}
                                {log.type === 'out' && <ArrowUpFromLine className="size-3" />}
                                {log.type === 'return' && <RefreshCcw className="size-3" />}
                                {log.type === 'adjustment' && <SlidersHorizontal className="size-3" />}
                                {meta.label}
                              </span>
                            </td>

                            <td>
                              <p className="font-bold">{log.part?.name ?? '—'}</p>
                              <p className="font-mono text-[10px] text-base-content/50" dir="ltr">
                                {log.part?.code ?? ''}
                              </p>
                            </td>

                            <td className="font-mono font-bold">
                              <span className={cx(log.type === 'out' ? 'text-warning' : log.type === 'in' ? 'text-success' : 'text-info')}>
                                {log.type === 'out' ? '−' : log.type === 'in' || log.type === 'return' ? '+' : '±'}
                                {num(log.quantity)}
                              </span>
                            </td>

                            <td className="font-mono text-base-content/60">{num(log.stock_before)}</td>
                            <td className="font-mono font-black">{num(log.stock_after)}</td>

                            {/* نام مشتری به‌صورت لینک قابل کلیک به پروفایل (تسک ۴) */}
                            <td>
                              {log.customer_id ? (
                                <Link
                                  to={`/customers/${log.customer_id}`}
                                  className="font-semibold text-primary hover:underline"
                                  title="مشاهده پروفایل مشتری"
                                >
                                  {log.customer?.full_name || log.customer?.company_name || 'مشاهده مشتری'}
                                </Link>
                              ) : (
                                <span className="text-base-content/35">—</span>
                              )}
                            </td>

                            <td>
                              <span className="font-semibold">{log.user?.name ?? 'سیستم'}</span>
                              {log.user?.email && (
                                <p className="text-[10px] text-base-content/45" dir="ltr">
                                  {log.user.email}
                                </p>
                              )}
                            </td>

                            <td className="whitespace-nowrap font-mono text-[11px]">{dateTimeFa(log.logged_at)}</td>

                            <td className="max-w-xs">
                              {log.reference && (
                                <p className="font-mono text-[10px] text-base-content/60" dir="ltr">
                                  {log.reference}
                                </p>
                              )}
                              <p className="line-clamp-1 text-[11px] text-base-content/55" title={log.notes ?? ''}>
                                {log.notes || '—'}
                              </p>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {logsPage && logsPage.total > 0 && (
                  <Pagination
                    page={logsPage.current_page}
                    pageSize={logsPage.per_page || 20}
                    total={logsPage.total}
                    onPage={setPage}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}

      {tab === 'stock' && (
        <div className="overflow-hidden rounded-2xl border border-base-200 bg-base-100 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-200/70 px-4 py-3">
            <h2 className="text-sm font-bold">موجودی دستگاه‌ها و ثبت حرکت دستی انبار</h2>
            <p className="text-[11px] text-base-content/55">
              با هر حرکت، رکورد کامل آن با نام شما و تاریخ دقیق در تاریخچه انبار ثبت می‌شود.
            </p>
          </div>

          {!parts.length ? (
            <EmptyState title="دستگاهی در کاتالوگ ثبت نشده است" description="ابتدا از صفحه «کاتالوگ دستگاه‌ها» مدل دستگاه را تعریف کنید." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-hover">
                <thead>
                  <tr className="border-b border-base-200 bg-slate-50 text-[11px] font-bold text-base-content/75 dark:bg-slate-900/60">
                    <th>دستگاه</th>
                    <th>کد فنی</th>
                    <th>موجودی انبار</th>
                    <th>حد هشدار</th>
                    <th>تخصیص‌یافته</th>
                    <th className="text-end">حرکت انبار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-200/80">
                  {parts.map((p) => {
                    const stock = Number(p.stock_quantity ?? 0)
                    const low = Boolean(p.is_low_stock)
                    return (
                      <tr key={p.id} className="text-xs transition-colors hover:bg-base-200/50">
                        <td className="font-bold">{p.name}</td>
                        <td className="font-mono text-[11px]" dir="ltr">
                          {p.code}
                        </td>
                        <td>
                          <span className={cx('font-black', low ? 'text-error' : stock > 0 ? 'text-success' : 'text-base-content/50')}>
                            {num(stock)} {p.unit_label || 'عدد'}
                          </span>
                          {low && (
                            <span className="badge badge-error badge-xs ms-2 gap-1 font-bold">
                              <AlertTriangle className="size-3" /> کمبود
                            </span>
                          )}
                        </td>
                        <td className="text-base-content/60">{num(p.min_stock_quantity ?? 0)}</td>
                        <td className="text-base-content/60">
                          {num(p.assigned_quantity ?? 0)} عدد در {num(p.customer_parts_count ?? 0)} ردیف
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Can permission="inventory.manage">
                              <button
                                className="btn btn-ghost btn-xs gap-1 text-success"
                                onClick={() => { setStockPart(p); setStockType('in') }}
                              >
                                <ArrowDownToLine className="size-3.5" /> ورود
                              </button>
                              <button
                                className="btn btn-ghost btn-xs gap-1 text-warning"
                                onClick={() => { setStockPart(p); setStockType('out') }}
                              >
                                <ArrowUpFromLine className="size-3.5" /> خروج
                              </button>
                              <button
                                className="btn btn-ghost btn-xs btn-square text-info"
                                title="اصلاح دستی موجودی"
                                onClick={() => { setStockPart(p); setStockType('adjustment') }}
                              >
                                <SlidersHorizontal className="size-4" />
                              </button>
                            </Can>
                            <Can permission="inventory.logs">
                              <button
                                className="btn btn-ghost btn-xs gap-1"
                                title="مشاهده تراکنش‌های این دستگاه"
                                onClick={() => { setTab('logs'); updateParam('part_id', String(p.id)) }}
                              >
                                <FileSpreadsheet className="size-3.5" /> تاریخچه
                              </button>
                            </Can>
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
      )}

      <StockMovementModal
        open={Boolean(stockPart)}
        onClose={() => setStockPart(null)}
        part={stockPart}
        initialType={stockType}
        onSuccess={() => {
          invalidate()
          setStockPart(null)
        }}
      />
    </div>
  )
}
