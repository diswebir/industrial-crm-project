import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { ArrowDownToLine, ArrowUpFromLine, RefreshCcw, SlidersHorizontal } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { apiErrorMessage, inventoryApi } from '../../services/api'
import { num, toEnDigits } from '../../utils/format'
import type { Part } from '../../types'

export type StockMovementType = 'in' | 'out' | 'adjustment'

const schema = z.object({
  type: z.enum(['in', 'out', 'adjustment']),
  quantity: z
    .string()
    .refine((v) => toEnDigits(v).trim() !== '', 'تعداد الزامی است')
    .refine((v) => /^\d+$/.test(toEnDigits(v).trim()), 'تعداد باید یک عدد صحیح باشد')
    .refine((v) => Number(toEnDigits(v)) >= 1, 'تعداد باید حداقل ۱ باشد')
    .refine((v) => Number(toEnDigits(v)) <= 10000000, 'تعداد بیش از حد مجاز است'),
  reference: z.string().trim().max(100, 'شماره سند حداکثر ۱۰۰ کاراکتر است').optional().or(z.literal('')),
  notes: z.string().trim().max(500, 'توضیحات حداکثر ۵۰۰ کاراکتر است').optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

const TYPE_META: Record<StockMovementType, { label: string; icon: typeof ArrowDownToLine; tone: string }> = {
  in: { label: 'ورود به انبار', icon: ArrowDownToLine, tone: 'text-success' },
  out: { label: 'خروج دستی از انبار', icon: ArrowUpFromLine, tone: 'text-warning' },
  adjustment: { label: 'اصلاح دستی موجودی', icon: SlidersHorizontal, tone: 'text-info' },
}

interface StockMovementModalProps {
  open: boolean
  onClose: () => void
  part: Part | null
  /** نوع عملیات از پیش انتخاب‌شده (از دکمه‌های سریع صفحه دستگاه‌ها) */
  initialType?: StockMovementType
  onSuccess?: (message: string) => void
}

/**
 * ثبت حرکت دستی انبار (تسک ۴): ورود کالا، خروج کالا یا اصلاح موجودی.
 * هر حرکت در جدول `inventory_logs` با نام کاربر، تاریخ دقیق و موجودی قبل/بعد ثبت می‌شود.
 */
export function StockMovementModal({ open, onClose, part, initialType = 'in', onSuccess }: StockMovementModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: initialType, quantity: '', reference: '', notes: '' },
  })

  useEffect(() => {
    if (open) {
      reset({ type: initialType, quantity: '', reference: '', notes: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, part?.id, initialType])

  if (!part) return null

  const type = (watch('type') ?? initialType) as StockMovementType
  const qtyRaw = toEnDigits(watch('quantity') || '')
  const qty = /^\d+$/.test(qtyRaw.trim()) ? Number(qtyRaw) : 0
  const currentStock = Number(part.stock_quantity ?? 0)
  const unit = part.unit_label || 'عدد'
  const meta = TYPE_META[type]
  const MetaIcon = meta.icon

  const projected =
    type === 'in'
      ? currentStock + qty
      : type === 'out'
        ? currentStock - qty
        : qty

  const notEnough = type === 'out' && qty > currentStock

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await inventoryApi.stock({
        part_id: part.id,
        type: values.type,
        quantity: Number(toEnDigits(values.quantity)),
        reference: values.reference?.trim() || null,
        notes: values.notes?.trim() || null,
      })
      toast.success(res.message)
      onSuccess?.(res.message)
      onClose()
    } catch (err: any) {
      const data = err?.response?.data
      const field = data?.errors?.quantity?.[0] || data?.errors?.part_id?.[0] || data?.errors?.type?.[0]
      toast.error(field || apiErrorMessage(err, 'خطا در ثبت حرکت انبار'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`ثبت حرکت انبار — ${part.name}`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
            انصراف
          </button>
          <button
            type="submit"
            form="stock-movement-form"
            className="btn btn-primary"
            disabled={isSubmitting || notEnough}
          >
            {isSubmitting && <span className="loading loading-spinner loading-xs" />}
            ثبت در انبار و تاریخچه
          </button>
        </>
      }
    >
      <form id="stock-movement-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-base-300 bg-base-200/60 px-3.5 py-3 text-xs">
          <div>
            <span className="text-base-content/50">کد فنی دستگاه:</span>{' '}
            <span className="font-mono font-bold" dir="ltr">
              {part.code}
            </span>
          </div>
          <div>
            <span className="text-base-content/50">موجودی فعلی انبار:</span>{' '}
            <span className="font-bold">{num(currentStock)} {unit}</span>
          </div>
          {part.min_stock_quantity > 0 && (
            <div>
              <span className="text-base-content/50">حد هشدار:</span>{' '}
              <span className="font-bold">{num(part.min_stock_quantity)}</span>
            </div>
          )}
        </div>

        <Field label="نوع عملیات انبار" required error={errors.type?.message}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(TYPE_META) as StockMovementType[]).map((key) => {
              const m = TYPE_META[key]
              const Icon = m.icon
              const active = type === key
              return (
                <label
                  key={key}
                  className={
                    active
                      ? 'flex cursor-pointer items-center gap-2 rounded-xl border-2 border-primary bg-primary/10 px-3 py-2.5 text-xs font-bold'
                      : 'flex cursor-pointer items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2.5 text-xs font-semibold hover:border-primary/40'
                  }
                >
                  <input
                    type="radio"
                    className="radio radio-primary radio-xs"
                    value={key}
                    {...register('type')}
                  />
                  <Icon className={`size-4 ${m.tone}`} />
                  <span>{m.label}</span>
                </label>
              )
            })}
          </div>
        </Field>

        {type === 'adjustment' ? (
          <Field
            label="موجودی نهایی انبار پس از اصلاح"
            required
            error={errors.quantity?.message}
            hint="در اصلاح دستی، عدد واردشده «موجودی نهایی» است؛ اختلاف آن با موجودی فعلی در تاریخچه ثبت می‌شود."
          >
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              className={`input input-bordered w-full text-start font-mono ${errors.quantity ? 'input-error' : ''}`}
              placeholder={String(currentStock)}
              {...register('quantity', {
                onChange: (e) => {
                  e.target.value = toEnDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 8)
                },
              })}
            />
          </Field>
        ) : (
          <Field
            label={type === 'in' ? `تعداد ورودی به انبار (${unit})` : `تعداد خروجی از انبار (${unit})`}
            required
            error={errors.quantity?.message || (notEnough ? `موجودی انبار کافی نیست (موجودی: ${num(currentStock)})` : undefined)}
          >
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              className={`input input-bordered w-full text-start font-mono ${errors.quantity || notEnough ? 'input-error' : ''}`}
              placeholder="1"
              {...register('quantity', {
                onChange: (e) => {
                  e.target.value = toEnDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 8)
                },
              })}
            />
          </Field>
        )}

        <Field
          label="شماره سند / فاکتور / بارکد (اختیاری)"
          error={errors.reference?.message}
          hint="برای ردیابی بهتر در تاریخچه انبار."
        >
          <input
            dir="ltr"
            className={`input input-bordered w-full text-start font-mono ${errors.reference ? 'input-error' : ''}`}
            placeholder="مثال: GRN-1404-0031"
            maxLength={100}
            {...register('reference')}
          />
        </Field>

        <Field label="توضیحات حرکت انبار (اختیاری)" error={errors.notes?.message}>
          <textarea
            rows={2}
            className="textarea textarea-bordered w-full"
            placeholder={
              type === 'in'
                ? 'مثال: خرید از تأمین‌کننده و ورود به انبار مرکزی...'
                : type === 'out'
                  ? 'مثال: خروج جهت نصب در پروژه مشتری...'
                  : 'مثال: اصلاح موجودی پس از انبارگردانی...'
            }
            {...register('notes')}
          />
        </Field>

        <div
          className={
            notEnough
              ? 'flex items-start gap-2.5 rounded-xl border border-error/40 bg-error/10 p-3 text-xs text-error'
              : 'flex items-start gap-2.5 rounded-xl border border-base-300 bg-base-200/60 p-3 text-xs text-base-content/75'
          }
        >
          {type === 'in' ? (
            <ArrowDownToLine className="mt-0.5 size-4 shrink-0 text-success" />
          ) : type === 'out' ? (
            <ArrowUpFromLine className="mt-0.5 size-4 shrink-0 text-warning" />
          ) : (
            <RefreshCcw className="mt-0.5 size-4 shrink-0 text-info" />
          )}
          <p className="leading-relaxed">
            {notEnough
              ? `موجودی انبار (${num(currentStock)} ${unit}) کمتر از تعداد درخواستی (${num(qty)}) است؛ خروج ثبت نمی‌شود.`
              : qty > 0
                ? `موجودی پس از ثبت این حرکت: ${num(projected)} ${unit} (موجودی فعلی: ${num(currentStock)}).`
                : 'پس از ثبت، موجودی انبار و رکورد تاریخچه با نام شما و تاریخ دقیق به‌روزرسانی می‌شود.'}
          </p>
        </div>
      </form>
    </Modal>
  )
}
