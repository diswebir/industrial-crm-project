import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Cpu,
  History,
  RotateCcw,
  Search,
  SlidersHorizontal,
  User as UserIcon,
  Warehouse,
} from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { TableSkeleton, EmptyState } from '../components/ui/Field'
import { StockMovementModal } from '../components/parts/StockMovementModal'
import { Can } from '../components/common/Can'
import { inventoryApi } from '../services/api'
import { useDebouncedValue } from '../utils/useDebouncedValue'
import { cx, dateTimeFa, num, relativeFa } from '../utils/format'
import type { InventoryMovementType } from '../types'

const PAGE_SIZE = 20

const TYPE_META: Record<InventoryMovementType, { label: string; className: string; icon: typeof Boxes }> = {
  in: { label: 'ورود به انبار', className: 'badge-success badge-soft', icon: ArrowDownToLine },
  out: { label: 'خروج جهت تخصیص', className: 'badge-warning badge-soft', icon: ArrowUpFromLine },
  return: { label: 'برگشت به انبار', className: 'badge-info badge-soft', icon: RotateCcw },
  adjust: { label: 'اصلاح موجودی', className: 'badge-neutral badge-soft', icon: SlidersHorizontal },
}

export default function Inventory() {
  const qc = useQueryClient()

  const [q, setQ] = useState('')
  const [type, setType] = useState<InventoryMovementType | ''>('')
  const [partId, setPartId] = useState<string>('')
  const [page, setPage] = useState(1)
  const [movementOpen, setMovementOpen] = useState(false)

  const { data: summary } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: inventoryApi.summary,
  })

  const { data: parts = [] } = useQuery({
    queryKey: ['inventory-parts'],
    queryFn: inventoryApi.parts,
  })

  const debouncedQ = useDebouncedValue(q, 300)

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-logs', { q: debouncedQ, type, partId, page }],
    queryFn: () =>
      inventoryApi.logs({
        q: debouncedQ.trim() || undefined,
        type: type || undefined,
        part_id: partId || undefined,
        page,
        per_page: PAGE_SIZE,
      }),
  })

  const logs = data?.data ?? []
  const pageCount = data?.last_page ?? 1
  const total = data?.total ?? 0

  const lowStockParts = useMemo(
    () => parts.filter((p) => Number(p.min_stock_quantity ?? 0) > 0 && Number(p.stock_quantity) <= Number(p.min_stock_quantity)),
    [parts],
  )

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['inventory-logs'] })
    qc.invalidateQueries({ queryKey: ['inventory-summary'] })
    qc.invalidateQueries({ queryKey: ['inventory-parts'] })
    qc.invalidateQueries({ queryKey: ['parts-catalog'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="انبار و تاریخچه ورود/خروج دستگاه‌ها"
        subtitle="کنترل موجودی دستگاه‌ها، ثبت ورود کالا، خروج جهت تخصیص، برگشت به انبار و لاگ کامل با نام ثبت‌کننده و مشتری"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/parts" className="btn btn-sm gap-1.5">
              <Cpu className="size-4" /> کاتالوگ دستگاه‌ها
            </Link>
            <Can permission="inventory.manage">
              <button className="btn btn-sm btn-primary gap-1.5" onClick={() => setMovementOpen(true)}>
                <ArrowDownToLine className="size-4" /> ثبت ورود / خروج کالا
              </button>
            </Can>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <Warehouse className="size-5" />
          </span>
          <div>
            <p className="text-[11px] text-base-content/50">موجودی کل انبار</p>
            <p className="text-xl font-black">{num(summary?.total_stock ?? 0)} عدد</p>
            <p className="text-[10px] text-base-content/40">{num(summary?.total_parts ?? 0)} مدل دستگاه</p>
          </div>
        </div>

        <div className="rounded-2xl border border-base-200 bg-base-100 p-4 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            <Cpu className="size-5" />
          </span>
          <div>
            <p className="text-[11px] text-base-content/50">مجموع تخصیص‌یافته به مشتریان</p>
            <p className="text-xl font-black">{num(summary?.total_allocated ?? 0)} عدد</p>
          </div>
        </div>

        <div className="rounded-2xl border border-base-200 bg-base-100 p-4 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="size-5" />
          </span>
          <div>
            <p className="text-[11px] text-base-content/50">دستگاه‌های دارای کمبود</p>
            <p className="text-xl font-black">{num(summary?.low_stock_parts ?? 0)} مدل</p>
            <p className="text-[10px] text-base-content/40">موجودی ≤ حد هشدار</p>
          </div>
        </div>

        <div className="rounded-2xl border border-base-200 bg-base-100 p-4 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <History className="size-5" />
          </span>
          <div>
            <p className="text-[11px] text-base-content/50">تراکنش‌های امروز</p>
            <p className="text-xl font-black">{num(summary?.today_movements ?? 0)} مورد</p>
          </div>
        </div>
      </div>

      {lowStockParts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="size-4" /> هشدار موجودی
          </p>
          <p className="leading-relaxed">
            {lowStockParts
              .slice(0, 5)
              .map((p) => `${p.name} (${num(p.stock_quantity)} عدد)`)
              .join(' • ')}
            {lowStockParts.length > 5 ? ` و ${num(lowStockParts.length - 5)} مدل دیگر` : ''}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-base-100 p-4 rounded-2xl border border-base-200">
        <label className="input input-bordered input-sm flex items-center gap-2">
          <Search className="size-4 text-base-content/40" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            placeholder="جستجوی دستگاه، مشتری یا توضیح..."
            className="grow text-xs"
          />
        </label>

        <select
          className="select select-bordered select-sm text-xs"
          value={type}
          onChange={(e) => {
            setType(e.target.value as InventoryMovementType | '')
            setPage(1)
          }}
        >
          <option value="">همه انواع تراکنش</option>
          <option value="in">ورود به انبار</option>
          <option value="out">خروج جهت تخصیص</option>
          <option value="return">برگشت به انبار</option>
          <option value="adjust">اصلاح موجودی</option>
        </select>

        <select
          className="select select-bordered select-sm text-xs"
          value={partId}
          onChange={(e) => {
            setPartId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">همه دستگاه‌ها</option>
          {parts.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name} ({p.code})
            </option>
          ))}
        </select>

        <div className="flex items-center justify-end text-xs text-base-content/60">
          {num(total)} تراکنش ثبت‌شده
        </div>
      </div>

      {/* Logs Table */}
      <div className="overflow-hidden rounded-2xl border border-base-200 bg-base-100 shadow-xs">
        {isLoading ? (
          <div className="p-4">
            <table className="table">
              <tbody>
                <TableSkeleton rows={8} cols={8} />
              </tbody>
            </table>
          </div>
        ) : !logs.length ? (
          <EmptyState
            title="تراکنشی ثبت نشده است"
            subtitle="با ثبت ورود کالا یا تخصیص دستگاه به مشتری، تراکنش‌ها در این بخش با نام ثبت‌کننده و مشتری نمایش داده می‌شوند."
            action={
              <Can permission="inventory.manage">
                <button className="btn btn-sm btn-primary" onClick={() => setMovementOpen(true)}>
                  <ArrowDownToLine className="size-4" /> ثبت اولین ورود کالا
                </button>
              </Can>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs font-bold text-base-content/75 border-b border-base-200">
                  <th>تاریخ و ساعت</th>
                  <th>دستگاه</th>
                  <th>نوع تراکنش</th>
                  <th>تعداد</th>
                  <th>موجودی بعد از تراکنش</th>
                  <th>ثبت‌کننده</th>
                  <th>مشتری</th>
                  <th>توضیح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-200/80">
                {logs.map((log) => {
                  const meta = TYPE_META[log.type] ?? TYPE_META.adjust
                  const Icon = meta.icon
                  return (
                    <tr key={log.id} className="text-xs hover:bg-base-200/40 transition-colors">
                      <td>
                        <p className="font-semibold">{dateTimeFa(log.created_at)}</p>
                        <p className="text-[10px] text-base-content/40">{relativeFa(log.created_at)}</p>
                      </td>

                      <td>
                        <p className="font-bold text-base-content">{log.part?.name ?? '—'}</p>
                        <p className="text-[10px] text-base-content/50 font-mono">{log.part?.code ?? ''}</p>
                      </td>

                      <td>
                        <span className={cx('badge badge-xs font-bold gap-1', meta.className)}>
                          <Icon className="size-3" />
                          {meta.label}
                        </span>
                      </td>

                      <td>
                        <span
                          className={cx(
                            'font-black',
                            log.type === 'out' ? 'text-error' : log.type === 'in' || log.type === 'return' ? 'text-emerald-600' : 'text-base-content',
                          )}
                        >
                          {log.type === 'out' ? '−' : log.type === 'in' || log.type === 'return' ? '+' : ''}
                          {num(log.quantity)}
                        </span>
                      </td>

                      <td className="font-bold">{num(log.stock_after)} عدد</td>

                      <td>
                        <span className="flex items-center gap-1.5">
                          <UserIcon className="size-3.5 text-base-content/40" />
                          {log.user?.name ?? 'سیستم'}
                        </span>
                      </td>

                      <td>
                        {log.customer ? (
                          <Link
                            to={`/customers/${log.customer.id}`}
                            className="font-bold text-primary hover:underline"
                            title="باز کردن پروفایل مشتری"
                          >
                            {log.customer.full_name ||
                              `${log.customer.first_name ?? ''} ${log.customer.last_name ?? ''}`.trim() ||
                              'مشاهده پرونده'}
                          </Link>
                        ) : (
                          <span className="text-base-content/40">—</span>
                        )}
                      </td>

                      <td className="max-w-[220px] truncate text-base-content/60" title={log.note ?? ''}>
                        {log.note || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <div className="border-t border-base-200 p-4">
            <Pagination current={page} total={pageCount} onChange={setPage} />
          </div>
        )}
      </div>

      {movementOpen && (
        <StockMovementModal
          open={movementOpen}
          onClose={() => setMovementOpen(false)}
          parts={parts}
          onSuccess={refresh}
        />
      )}
    </div>
  )
}
