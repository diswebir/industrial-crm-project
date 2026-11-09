import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Cpu,
  History,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { SearchInput } from '../components/ui/SearchInput'
import { Modal, ConfirmDialog } from '../components/ui/Modal'
import { Field, TableSkeleton, EmptyState } from '../components/ui/Field'
import { Can } from '../components/common/Can'
import { StockMovementModal, type StockMovementType } from '../components/parts/StockMovementModal'
import { apiErrorMessage, partApi } from '../services/api'
import { cx, digits, num, toEnDigits } from '../utils/format'
import type { Part } from '../types'

const schema = z.object({
  name: z.string().trim().min(2, 'نام دستگاه را وارد کنید').max(150, 'نام دستگاه حداکثر ۱۵۰ کاراکتر است'),
  code: z
    .string()
    .trim()
    .min(2, 'کد فنی دستگاه (SKU) را وارد کنید')
    .max(50, 'کد فنی حداکثر ۵۰ کاراکتر است')
    .regex(/^[a-zA-Z0-9\-_]+$/, 'کد دستگاه فقط می‌تواند شامل حروف انگلیسی، اعداد، خط تیره و زیرخط باشد'),
  periodic_service_months: z
    .string()
    .refine((v) => /^\d+$/.test(toEnDigits(v).trim()), 'دوره سرویس باید یک عدد صحیح باشد')
    .refine((v) => Number(toEnDigits(v)) >= 1, 'دوره سرویس باید حداقل ۱ ماه باشد'),
  description: z.string().trim().max(5000).optional().or(z.literal('')),
  is_active: z.boolean(),
  stock_quantity: z
    .string()
    .refine((v) => v.trim() === '' || /^\d+$/.test(toEnDigits(v).trim()), 'موجودی انبار باید یک عدد صحیح باشد')
    .optional()
    .or(z.literal('')),
  min_stock_quantity: z
    .string()
    .refine((v) => v.trim() === '' || /^\d+$/.test(toEnDigits(v).trim()), 'حد هشدار موجودی باید یک عدد صحیح باشد')
    .optional()
    .or(z.literal('')),
  unit_label: z.string().trim().max(30, 'واحد شمارش حداکثر ۳۰ کاراکتر است').optional().or(z.literal('')),
})

type PartFormValues = z.infer<typeof schema>

export default function Parts() {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const [q, setQ] = useState(params.get('q') || '')
  const [lowStockOnly, setLowStockOnly] = useState(params.get('low_stock') === '1')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPart, setEditingPart] = useState<Part | null>(null)
  const [deletingPart, setDeletingPart] = useState<Part | null>(null)
  /** مودال حرکت انبار (تسک ۴) */
  const [stockPart, setStockPart] = useState<Part | null>(null)
  const [stockType, setStockType] = useState<StockMovementType>('in')

  useEffect(() => {
    const qParam = params.get('q')
    if (qParam !== null && qParam !== q) {
      setQ(qParam)
    }
    setLowStockOnly(params.get('low_stock') === '1')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ['parts-catalog', q, lowStockOnly],
    queryFn: () =>
      partApi.list({
        q: q.trim() || undefined,
        low_stock: lowStockOnly ? 1 : undefined,
      }),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PartFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      code: '',
      periodic_service_months: '12',
      description: '',
      is_active: true,
      stock_quantity: '0',
      min_stock_quantity: '0',
      unit_label: 'عدد',
    },
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['parts-catalog'] })
    qc.invalidateQueries({ queryKey: ['inventory-summary'] })
    qc.invalidateQueries({ queryKey: ['inventory-logs'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
  }

  const openCreate = () => {
    setEditingPart(null)
    reset({
      name: '',
      code: '',
      periodic_service_months: '12',
      description: '',
      is_active: true,
      stock_quantity: '0',
      min_stock_quantity: '0',
      unit_label: 'عدد',
    })
    setModalOpen(true)
  }

  const openEdit = (p: Part) => {
    setEditingPart(p)
    reset({
      name: p.name,
      code: p.code,
      periodic_service_months: String(p.periodic_service_months ?? 12),
      description: p.description ?? '',
      is_active: p.is_active,
      stock_quantity: String(p.stock_quantity ?? 0),
      min_stock_quantity: String(p.min_stock_quantity ?? 0),
      unit_label: p.unit_label || 'عدد',
    })
    setModalOpen(true)
  }

  const openStock = (p: Part, type: StockMovementType) => {
    setStockPart(p)
    setStockType(type)
  }

  const deleteMutation = useMutation({
    mutationFn: partApi.delete,
    onSuccess: (res) => {
      toast.success(res.message)
      invalidate()
      setDeletingPart(null)
    },
    onError: (err: any) => {
      toast.error(apiErrorMessage(err, 'خطا در حذف دستگاه'))
      setDeletingPart(null)
    },
  })

  const onSubmit = async (values: PartFormValues) => {
    const payload = {
      name: values.name.trim(),
      code: values.code.trim(),
      periodic_service_months: Number(toEnDigits(values.periodic_service_months)),
      description: values.description?.trim() || null,
      is_active: values.is_active,
      stock_quantity:
        values.stock_quantity?.trim() === '' ? 0 : Number(toEnDigits(values.stock_quantity || '0')),
      min_stock_quantity:
        values.min_stock_quantity?.trim() === '' ? 0 : Number(toEnDigits(values.min_stock_quantity || '0')),
      unit_label: values.unit_label?.trim() || 'عدد',
    }

    try {
      if (editingPart) {
        const res = await partApi.update(editingPart.id, payload)
        toast.success(res.message)
      } else {
        const res = await partApi.create(payload)
        toast.success(res.message)
      }
      invalidate()
      setModalOpen(false)
    } catch (err: any) {
      const data = err?.response?.data
      const field = data?.errors?.code?.[0] || data?.errors?.name?.[0] || data?.errors?.stock_quantity?.[0]
      toast.error(field || apiErrorMessage(err, 'خطا در ذخیره دستگاه'))
    }
  }

  const totalStock = parts.reduce((sum, p) => sum + Number(p.stock_quantity ?? 0), 0)
  const totalAssigned = parts.reduce((sum, p) => sum + Number(p.assigned_quantity ?? 0), 0)
  const lowStockCount = parts.filter((p) => p.is_low_stock).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="کاتالوگ و مدیریت دستگاه‌ها"
        subtitle="تعریف مدل دستگاه‌ها، موجودی انبار، زمان‌بندی پوشش سرویس دوره‌ای/گارانتی و آمار تخصیص به مشتریان"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Can permission="inventory.logs">
              <Link to="/inventory" className="btn btn-sm btn-outline gap-1.5">
                <History className="size-4" /> تاریخچه انبار
              </Link>
            </Can>
            <Can permission="parts.manage">
              <button className="btn btn-sm btn-primary gap-1.5" onClick={openCreate}>
                <Plus className="size-4" /> تعریف دستگاه جدید
              </button>
            </Can>
          </div>
        }
      />

      {/* Info Alert on Periodic Service */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-950 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
        <Wrench className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="space-y-1">
          <p className="text-sm font-bold">راهنمای سرویس دوره‌ای، گارانتی و موجودی انبار دستگاه‌ها</p>
          <p className="leading-relaxed opacity-90">
            دوره سرویس هر دستگاه نشان‌دهنده مدت زمان پوشش بازبینی و گارانتی دوره‌ای توسط شرکت است. با تخصیص دستگاه به هر
            مشتری و صدور شماره سریال یکتا، تاریخ پایان گارانتی بر مبنای این دوره محاسبه و در پرونده مشتری ثبت می‌گردد.
            موجودی انبار با هر تخصیص به‌طور خودکار کسر و با حذف یا کاهش تعداد تخصیص، به انبار بازمی‌گردد؛ همه این حرکات
            همراه با نام کاربر و تاریخ دقیق در «تاریخچه انبار» ثبت می‌شود.
          </p>
        </div>
      </div>

      {/* Inventory summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
          <p className="text-[11px] text-base-content/55">مدل‌های دستگاه</p>
          <p className="mt-1 text-xl font-black">{num(parts.length)}</p>
        </div>
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
          <p className="text-[11px] text-base-content/55">موجودی کل انبار</p>
          <p className="mt-1 text-xl font-black text-primary">{num(totalStock)} عدد</p>
        </div>
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
          <p className="text-[11px] text-base-content/55">تخصیص‌یافته به مشتریان</p>
          <p className="mt-1 text-xl font-black text-info">{num(totalAssigned)} عدد</p>
        </div>
        <div className="rounded-2xl border border-base-200 bg-base-100 p-4">
          <p className="text-[11px] text-base-content/55">دارای کمبود موجودی</p>
          <p className={cx('mt-1 text-xl font-black', lowStockCount ? 'text-error' : 'text-success')}>
            {num(lowStockCount)} مدل
          </p>
        </div>
      </div>

      {/* Search and Filter Toolbar */}
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="w-full sm:w-80">
          <SearchInput
            value={q}
            onChange={(val) => {
              setQ(val)
              const next = new URLSearchParams(params)
              if (val) next.set('q', val)
              else next.delete('q')
              setParams(next, { replace: true })
            }}
            placeholder="جستجوی نام، کد فنی SKU یا توضیحات..."
          />
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              className="toggle toggle-error toggle-sm"
              checked={lowStockOnly}
              onChange={(e) => {
                setLowStockOnly(e.target.checked)
                const next = new URLSearchParams(params)
                if (e.target.checked) next.set('low_stock', '1')
                else next.delete('low_stock')
                setParams(next, { replace: true })
              }}
            />
            <AlertTriangle className="size-3.5 text-error" />
            فقط دستگاه‌های با کمبود موجودی
          </label>
          <p className="text-xs text-base-content/60">{num(parts.length)} مدل دستگاه در کاتالوگ</p>
        </div>
      </div>

      {/* Devices Table */}
      <div className="overflow-hidden rounded-2xl border border-base-200 bg-base-100 shadow-xs">
        {isLoading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : !parts.length ? (
          <EmptyState
            title="دستگاهی یافت نشد"
            subtitle={
              q || lowStockOnly
                ? `هیچ موردی مطابق با فیلترهای فعلی پیدا نشد.`
                : 'مدل دستگاه‌های تولیدی کارخانه را تعریف کنید تا بتوانید آن‌ها را با شماره سریال یکتا به مشتریان تخصیص دهید.'
            }
            action={
              <Can permission="parts.manage">
                <button className="btn btn-sm btn-primary" onClick={openCreate}>
                  <Plus className="size-4" /> تعریف اولین دستگاه
                </button>
              </Can>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr className="border-b border-base-200 bg-slate-50 text-xs font-bold text-base-content/75 dark:bg-slate-900/60">
                  <th>نام و مشخصات دستگاه</th>
                  <th>کد فنی (SKU)</th>
                  <th>دوره پوشش سرویس / گارانتی</th>
                  <th>موجودی انبار</th>
                  <th>تخصیص‌یافته به مشتریان</th>
                  <th>وضعیت تولید</th>
                  <th className="text-end">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-200/80">
                {parts.map((p) => {
                  const stock = Number(p.stock_quantity ?? 0)
                  const low = Boolean(p.is_low_stock)
                  const assigned = Number(p.assigned_quantity ?? 0)
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-base-200/50">
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 font-bold text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                            <Cpu className="size-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-base-content">{p.name}</p>
                            {p.description && (
                              <p className="max-w-[280px] truncate text-xs text-base-content/50">{p.description}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {p.code}
                        </span>
                      </td>

                      <td>
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          {digits(p.periodic_service_months)} ماه
                        </span>
                      </td>

                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={cx(
                              'inline-flex items-center gap-1.5 text-xs font-black',
                              low ? 'text-error' : stock > 0 ? 'text-success' : 'text-base-content/50',
                            )}
                          >
                            <Boxes className="size-3.5" />
                            {num(stock)} {p.unit_label || 'عدد'}
                          </span>
                          {low && (
                            <span className="badge badge-error badge-xs gap-1 font-bold">
                              <AlertTriangle className="size-3" />
                              کمبود موجودی (حد هشدار {num(p.min_stock_quantity)})
                            </span>
                          )}
                          {p.min_stock_quantity > 0 && !low && (
                            <span className="text-[10px] text-base-content/45">حد هشدار: {num(p.min_stock_quantity)}</span>
                          )}
                        </div>
                      </td>

                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600">
                            <Cpu className="size-3.5" />
                            {num(assigned)} عدد در {num(p.customer_parts_count ?? 0)} ردیف
                          </span>
                          <Can permission="inventory.logs">
                            <Link
                              to={`/inventory?part_id=${p.id}`}
                              className="text-[11px] font-semibold text-primary hover:underline"
                            >
                              مشاهده تراکنش‌های انبار
                            </Link>
                          </Can>
                        </div>
                      </td>

                      <td>
                        <span
                          className={cx(
                            'badge badge-xs font-bold',
                            p.is_active ? 'badge-success badge-soft' : 'badge-error badge-soft',
                          )}
                        >
                          {p.is_active ? 'فعال' : 'توقف تولید'}
                        </span>
                      </td>

                      <td className="text-end">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Can permission="inventory.manage">
                            <button
                              className="btn btn-ghost btn-xs gap-1 text-success"
                              title="ورود کالا به انبار"
                              onClick={() => openStock(p, 'in')}
                            >
                              <ArrowDownToLine className="size-3.5" /> ورود
                            </button>
                            <button
                              className="btn btn-ghost btn-xs gap-1 text-warning"
                              title="خروج دستی از انبار"
                              onClick={() => openStock(p, 'out')}
                            >
                              <ArrowUpFromLine className="size-3.5" /> خروج
                            </button>
                            <button
                              className="btn btn-ghost btn-xs btn-square text-info"
                              title="اصلاح دستی موجودی"
                              onClick={() => openStock(p, 'adjustment')}
                            >
                              <SlidersHorizontal className="size-4" />
                            </button>
                          </Can>
                          <Can permission="parts.manage">
                            <button
                              className="btn btn-ghost btn-xs btn-square"
                              title="ویرایش دستگاه"
                              onClick={() => openEdit(p)}
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10"
                              title="حذف دستگاه"
                              onClick={() => setDeletingPart(p)}
                            >
                              <Trash2 className="size-4" />
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

      {/* Modal: Create / Edit Device */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="lg"
        title={editingPart ? 'ویرایش مدل دستگاه' : 'تعریف مدل جدید در کاتالوگ دستگاه‌ها'}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={isSubmitting}>
              انصراف
            </button>
            <button type="submit" form="part-modal-form" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting && <span className="loading loading-spinner loading-xs" />}
              {editingPart ? 'ذخیره تغییرات' : 'ثبت در کاتالوگ'}
            </button>
          </>
        }
      >
        <form id="part-modal-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Field label="نام مدل دستگاه" required error={errors.name?.message}>
            <input
              className={`input input-bordered w-full ${errors.name ? 'input-error' : ''}`}
              placeholder="مثال: پمپ پیستونی هیدرولیک فشار قوی"
              {...register('name')}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="کد فنی یکتا (SKU)" required error={errors.code?.message}>
              <input
                dir="ltr"
                className={`input input-bordered w-full text-start font-mono ${errors.code ? 'input-error' : ''}`}
                placeholder="مثال: PUMP-HYD-500"
                {...register('code', {
                  onChange: (e) => {
                    e.target.value = e.target.value.replace(/[^a-zA-Z0-9\-_]/g, '')
                  },
                })}
                onKeyDown={(e) => {
                  if (
                    e.ctrlKey ||
                    e.metaKey ||
                    ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)
                  ) {
                    return
                  }
                  if (!/^[a-zA-Z0-9\-_]$/.test(e.key)) {
                    e.preventDefault()
                  }
                }}
              />
            </Field>

            <Field label="دوره پوشش گارانتی / سرویس (ماه)" required error={errors.periodic_service_months?.message}>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                className={`input input-bordered w-full text-start font-mono ${
                  errors.periodic_service_months ? 'input-error' : ''
                }`}
                placeholder="مثال: 6 یا 12"
                {...register('periodic_service_months', {
                  onChange: (e) => {
                    e.target.value = toEnDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 4)
                  },
                })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="موجودی انبار (عدد)"
              error={errors.stock_quantity?.message}
              hint={
                editingPart
                  ? 'تغییر این مقدار، یک رکورد «اصلاح دستی موجودی» در تاریخچه انبار ثبت می‌کند.'
                  : 'موجودی اولیه دستگاه در انبار.'
              }
            >
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                className={`input input-bordered w-full text-start font-mono ${errors.stock_quantity ? 'input-error' : ''}`}
                placeholder="0"
                {...register('stock_quantity', {
                  onChange: (e) => {
                    e.target.value = toEnDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 8)
                  },
                })}
              />
            </Field>

            <Field
              label="حد هشدار کمبود موجودی"
              error={errors.min_stock_quantity?.message}
              hint="وقتی موجودی به این عدد برسد، دستگاه در فهرست «کمبود موجودی» نمایش داده می‌شود."
            >
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                className={`input input-bordered w-full text-start font-mono ${
                  errors.min_stock_quantity ? 'input-error' : ''
                }`}
                placeholder="0"
                {...register('min_stock_quantity', {
                  onChange: (e) => {
                    e.target.value = toEnDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 8)
                  },
                })}
              />
            </Field>

            <Field label="واحد شمارش" error={errors.unit_label?.message} hint="پیش‌فرض: عدد">
              <input
                className={`input input-bordered w-full ${errors.unit_label ? 'input-error' : ''}`}
                placeholder="عدد"
                maxLength={30}
                {...register('unit_label')}
              />
            </Field>
          </div>

          <Field label="توضیحات و مشخصات فنی دستگاه" error={errors.description?.message}>
            <textarea
              rows={3}
              className="textarea textarea-bordered w-full"
              placeholder="مشخصات عملکردی، فشار کاری، ابعاد و ملاحظات فنی..."
              {...register('description')}
            />
          </Field>

          <div className="form-control">
            <label className="label cursor-pointer justify-start gap-3">
              <input type="checkbox" className="toggle toggle-primary toggle-sm" {...register('is_active')} />
              <span className="label-text text-xs font-bold">دستگاه فعال و در خط تولید کارخانه است</span>
            </label>
          </div>
        </form>
      </Modal>

      {/* Modal: Inventory movement (تسک ۴) */}
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

      {/* Confirm Delete Device Dialog */}
      <ConfirmDialog
        open={Boolean(deletingPart)}
        onClose={() => setDeletingPart(null)}
        onConfirm={() => deletingPart && deleteMutation.mutate(deletingPart.id)}
        title="حذف دستگاه از کاتالوگ"
        message={`آیا از حذف مدل دستگاه «${deletingPart?.name ?? ''}» اطمینان دارید؟ اگر این دستگاه به مشتریان تخصیص داده شده یا برای آن تراکنش انبار ثبت شده باشد، سامانه از حذف آن جلوگیری می‌کند و می‌توانید آن را «غیرفعال» کنید.`}
        confirmText="بله، حذف کن"
        tone="error"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
