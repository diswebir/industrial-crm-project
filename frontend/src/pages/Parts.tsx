import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowDownToLine,
  Boxes,
  Cpu,
  History,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { SearchInput } from '../components/ui/SearchInput'
import { Modal, ConfirmDialog } from '../components/ui/Modal'
import { Field, TableSkeleton, EmptyState } from '../components/ui/Field'
import { Can } from '../components/common/Can'
import { StockMovementModal } from '../components/parts/StockMovementModal'
import { partApi } from '../services/api'
import { cx, num, toEnDigits } from '../utils/format'
import type { Part } from '../types'

/** تبدیل امن ورودی متنی به عدد؛ مقدار خالی/نامعتبر به fallback تبدیل می‌شود. */
const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(toEnDigits(String(value ?? '')).trim())
  return Number.isFinite(n) ? n : fallback
}

const schema = z.object({
  name: z.string().trim().min(2, 'نام دستگاه را وارد کنید'),
  code: z
    .string()
    .trim()
    .min(2, 'کد دستگاه (SKU) را وارد کنید')
    .regex(/^[a-zA-Z0-9\-_]+$/, 'کد SKU فقط می‌تواند شامل حروف انگلیسی، اعداد و خط تیره باشد'),
  periodic_service_months: z.number().min(1, 'دوره سرویس باید حداقل ۱ ماه باشد'),
  description: z.string().trim().optional(),
  is_active: z.boolean(),
  min_stock_quantity: z.number().min(0, 'حد هشدار نمی‌تواند منفی باشد'),
  stock_quantity: z.number().min(0, 'موجودی اولیه نمی‌تواند منفی باشد'),
})

type PartFormValues = z.infer<typeof schema>

export default function Parts() {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const [q, setQ] = useState(params.get('q') || '')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPart, setEditingPart] = useState<Part | null>(null)
  const [deletingPart, setDeletingPart] = useState<Part | null>(null)
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [stockPartId, setStockPartId] = useState<number | string | null>(null)

  useEffect(() => {
    const qParam = params.get('q')
    if (qParam !== null && qParam !== q) {
      setQ(qParam)
    }
  }, [params])

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ['parts-catalog', q],
    queryFn: () => partApi.list({ q: q.trim() || undefined }),
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
      periodic_service_months: 12,
      description: '',
      is_active: true,
      min_stock_quantity: 0,
      stock_quantity: 0,
    },
  })

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['parts-catalog'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    qc.invalidateQueries({ queryKey: ['inventory-logs'] })
    qc.invalidateQueries({ queryKey: ['inventory-summary'] })
    qc.invalidateQueries({ queryKey: ['inventory-parts'] })
  }

  const openCreate = () => {
    setEditingPart(null)
    reset({
      name: '',
      code: '',
      periodic_service_months: 12,
      description: '',
      is_active: true,
      min_stock_quantity: 0,
      stock_quantity: 0,
    })
    setModalOpen(true)
  }

  const openEdit = (p: Part) => {
    setEditingPart(p)
    reset({
      name: p.name,
      code: p.code,
      periodic_service_months: p.periodic_service_months,
      description: p.description ?? '',
      is_active: p.is_active,
      min_stock_quantity: Number(p.min_stock_quantity ?? 0),
      stock_quantity: Number(p.stock_quantity ?? 0),
    })
    setModalOpen(true)
  }

  const deleteMutation = useMutation({
    mutationFn: partApi.delete,
    onSuccess: (res) => {
      toast.success(res.message)
      refreshAll()
      setDeletingPart(null)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'خطا در حذف دستگاه')
    },
  })

  const onSubmit = async (values: PartFormValues) => {
    try {
      const payload: Partial<Part> = {
        name: values.name,
        code: values.code,
        periodic_service_months: values.periodic_service_months,
        description: values.description,
        is_active: values.is_active,
        min_stock_quantity: values.min_stock_quantity,
      }

      if (!editingPart) {
        payload.stock_quantity = values.stock_quantity
      }

      if (editingPart) {
        const res = await partApi.update(editingPart.id, payload)
        toast.success(res.message)
      } else {
        const res = await partApi.create(payload)
        toast.success(res.message)
      }
      refreshAll()
      setModalOpen(false)
    } catch (err: any) {
      const serverErrors = err.response?.data?.errors
      const first = serverErrors ? Object.values(serverErrors)[0] : null
      toast.error(
        (Array.isArray(first) ? first[0] : first) || err.response?.data?.message || 'خطا در ذخیره دستگاه',
      )
    }
  }

  const lowStockCount = parts.filter((p) => p.is_low_stock).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="کاتالوگ و مدیریت دستگاه‌ها"
        subtitle="تعریف مدل دستگاه‌ها، موجودی انبار، دوره پوشش سرویس/گارانتی و آمار تخصیص به مشتریان"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Can permission="inventory.view">
              <Link to="/inventory" className="btn btn-sm gap-1.5">
                <History className="size-4" /> تاریخچه انبار
              </Link>
            </Can>
            <Can permission="inventory.manage">
              <button
                className="btn btn-sm gap-1.5"
                onClick={() => {
                  setStockPartId(null)
                  setStockModalOpen(true)
                }}
              >
                <ArrowDownToLine className="size-4" /> ورود / خروج کالا
              </button>
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
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-950 flex items-start gap-3 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
        <Wrench className="size-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-sm">راهنمای انبار، سرویس دوره‌ای و ضمانت دستگاه‌ها</p>
          <p className="opacity-90 leading-relaxed">
            دوره سرویس هر دستگاه نشان‌دهنده مدت پوشش بازبینی و گارانتی دوره‌ای توسط شرکت است. با تخصیص دستگاه به هر مشتری،
            موجودی انبار به صورت خودکار کسر می‌شود و با حذف یا کاهش تعداد، به انبار برگشت داده می‌شود. همه تراکنش‌ها در
            «تاریخچه انبار» با نام ثبت‌کننده و مشتری مرتبط ثبت می‌گردد.
          </p>
        </div>
      </div>

      {lowStockCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 flex items-center gap-2 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="size-4" />
          {num(lowStockCount)} دستگاه به حد هشدار موجودی رسیده است. پیش از تخصیص بعدی، موجودی را افزایش دهید.
        </div>
      )}

      {/* Search and Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
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
        <p className="text-xs text-base-content/60 self-end sm:self-center">
          {num(parts.length)} مدل دستگاه در کاتالوگ
        </p>
      </div>

      {/* Devices Table */}
      <div className="overflow-hidden rounded-2xl border border-base-200 bg-base-100 shadow-xs">
        {isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : !parts.length ? (
          <EmptyState
            title="دستگاهی یافت نشد"
            subtitle={
              q
                ? `هیچ موردی مطابق با جستجوی «${q}» پیدا نشد.`
                : 'مدل‌های دستگاه‌های تولیدی کارخانه را تعریف کنید تا بتوانید آن‌ها را به مشتریان تخصیص دهید.'
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
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs font-bold text-base-content/75 border-b border-base-200">
                  <th>نام و مشخصات دستگاه</th>
                  <th>کد فنی (SKU)</th>
                  <th>موجودی انبار</th>
                  <th>تخصیص‌یافته به مشتریان</th>
                  <th>دوره پوشش سرویس / گارانتی</th>
                  <th>وضعیت تولید</th>
                  <th className="text-end">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-200/80">
                {parts.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-base-200/50">
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 font-bold">
                          <Cpu className="size-5" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-base-content">{p.name}</p>
                          {p.description && (
                            <p className="text-xs text-base-content/50 truncate max-w-[280px]">{p.description}</p>
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
                      <div className="flex items-center gap-2">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 text-xs font-black',
                            p.is_low_stock ? 'text-error' : 'text-emerald-700 dark:text-emerald-400',
                          )}
                        >
                          <Boxes className="size-3.5" />
                          {num(p.stock_quantity ?? 0)} عدد
                        </span>
                        {p.is_low_stock && (
                          <span className="badge badge-xs badge-error badge-soft font-bold">کمبود</span>
                        )}
                      </div>
                      {Number(p.min_stock_quantity ?? 0) > 0 && (
                        <p className="text-[10px] text-base-content/40 mt-0.5">
                          حد هشدار: {num(Number(p.min_stock_quantity))} عدد
                        </p>
                      )}
                    </td>

                    <td>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600">
                        <Cpu className="size-3.5" />
                        {num(p.allocated_quantity ?? p.customer_parts_sum_quantity ?? 0)} عدد
                      </span>
                    </td>

                    <td>
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {num(p.periodic_service_months)} ماه
                      </span>
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
                      <div className="flex items-center justify-end gap-1">
                        <Can permission="inventory.manage">
                          <button
                            className="btn btn-ghost btn-xs btn-square"
                            title="ورود / خروج این دستگاه"
                            onClick={() => {
                              setStockPartId(p.id)
                              setStockModalOpen(true)
                            }}
                          >
                            <ArrowDownToLine className="size-4" />
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create / Edit Device */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="md"
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
              className="input input-bordered w-full"
              placeholder="مثال: پمپ پیستونی هیدرولیک فشار قوی"
              {...register('name')}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="کد فنی یکتا (SKU)" required error={errors.code?.message}>
              <input
                dir="ltr"
                className="input input-bordered w-full text-start font-mono"
                placeholder="مثال: PUMP-500"
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
                type="number"
                dir="ltr"
                className="input input-bordered w-full text-start"
                placeholder="مثال: 6 یا 12"
                {...register('periodic_service_months', { setValueAs: (v) => toNumber(v, 0) })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label={editingPart ? 'موجودی فعلی انبار' : 'موجودی اولیه انبار'}
              hint={editingPart ? 'برای تغییر موجودی از فرم «ورود/خروج کالا» استفاده کنید.' : 'این مقدار به عنوان ورود اولیه در لاگ انبار ثبت می‌شود.'}
              error={errors.stock_quantity?.message}
            >
              <input
                type="number"
                dir="ltr"
                disabled={Boolean(editingPart)}
                className="input input-bordered w-full text-start disabled:bg-base-200"
                placeholder="مثال: 20"
                {...register('stock_quantity', { setValueAs: (v) => toNumber(v, 0) })}
              />
            </Field>

            <Field label="حد هشدار موجودی (اختیاری)" error={errors.min_stock_quantity?.message}>
              <input
                type="number"
                dir="ltr"
                className="input input-bordered w-full text-start"
                placeholder="مثال: 3"
                {...register('min_stock_quantity', {
                  setValueAs: (v) => toNumber(v, 0),
                  onChange: (e) => {
                    e.target.value = toEnDigits(e.target.value).replace(/[^\d]/g, '')
                  },
                })}
              />
            </Field>
          </div>

          <Field label="توضیحات و مشخصات فنی دستگاه">
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
              <span className="label-text font-bold text-xs">دستگاه فعال و در خط تولید کارخانه است</span>
            </label>
          </div>
        </form>
      </Modal>

      {/* Stock movement modal */}
      <StockMovementModal
        open={stockModalOpen}
        onClose={() => {
          setStockModalOpen(false)
          setStockPartId(null)
        }}
        parts={parts}
        defaultPartId={stockPartId}
        onSuccess={refreshAll}
      />

      {/* Confirm Delete Device Dialog */}
      <ConfirmDialog
        open={Boolean(deletingPart)}
        onClose={() => setDeletingPart(null)}
        onConfirm={() => deletingPart && deleteMutation.mutate(deletingPart.id)}
        title="حذف دستگاه از کاتالوگ"
        message={`آیا از حذف مدل دستگاه «${deletingPart?.name}» اطمینان دارید؟ این عملیات فقط برای دستگاه‌های بدون تخصیص و با موجودی صفر مجاز است.`}
        confirmText="بله، حذف کن"
        tone="error"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
