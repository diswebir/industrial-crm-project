import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { SearchableSelect } from '../ui/SearchableSelect'
import { inventoryApi } from '../../services/api'
import { cx, num, toEnDigits } from '../../utils/format'
import type { Part } from '../../types'

const schema = z.object({
  part_id: z.string().min(1, 'انتخاب دستگاه الزامی است'),
  type: z.enum(['in', 'out', 'adjust']),
  quantity: z.string().min(1, 'تعداد یا موجودی جدید را وارد کنید'),
  note: z.string().trim().max(1000, 'توضیحات حداکثر ۱۰۰۰ کاراکتر است').optional(),
})

type FormValues = z.infer<typeof schema>

interface StockMovementModalProps {
  open: boolean
  onClose: () => void
  parts: Part[]
  defaultPartId?: number | string | null
  defaultType?: 'in' | 'out' | 'adjust'
  onSuccess: () => void
}

export function StockMovementModal({
  open,
  onClose,
  parts,
  defaultPartId,
  defaultType = 'in',
  onSuccess,
}: StockMovementModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { part_id: '', type: defaultType, quantity: '', note: '' },
  })

  const partId = watch('part_id')
  const type = watch('type')
  const quantityRaw = watch('quantity')

  const selectedPart = useMemo(() => parts.find((p) => String(p.id) === partId), [parts, partId])

  // با هر بار باز شدن مودال یک‌بار مقدار‌دهی می‌کنیم؛ refetch کاتالوگ نباید فرم را پاک کند.
  const wasOpenRef = useRef(false)

  const partOptions = useMemo(
    () =>
      parts.map((p) => ({
        value: String(p.id),
        label: `${p.name} (کد: ${p.code})`,
        hint: `موجودی فعلی: ${num(p.stock_quantity)} عدد`,
      })),
    [parts],
  )

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }

    if (wasOpenRef.current) return
    wasOpenRef.current = true

    const preferred = defaultPartId ? parts.find((p) => String(p.id) === String(defaultPartId)) : undefined
    const fallback = preferred ?? parts[0]

    reset({
      part_id: fallback ? String(fallback.id) : '',
      type: defaultType,
      quantity: '',
      note: '',
    })
  }, [open, parts, defaultPartId, defaultType, reset])

  // اگر فهرست دستگاه‌ها بعد از باز شدن مودال برسد، فقط انتخاب دستگاه را کامل می‌کنیم.
  useEffect(() => {
    if (!open || partId || !parts.length) return
    const preferred = defaultPartId ? parts.find((p) => String(p.id) === String(defaultPartId)) : undefined
    const fallback = preferred ?? parts[0]
    if (fallback) {
      setValue('part_id', String(fallback.id), { shouldValidate: true })
    }
  }, [open, partId, parts, defaultPartId, setValue])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const quantity = Number(toEnDigits(values.quantity).replace(/\D/g, ''))
      return inventoryApi.createMovement({
        part_id: values.part_id,
        type: values.type,
        quantity,
        note: values.note?.trim() || undefined,
      })
    },
    onSuccess: (res) => {
      toast.success(res.message)
      onSuccess()
      onClose()
    },
    onError: (err: any) => {
      const message =
        err.response?.data?.message ||
        err.response?.data?.errors?.quantity?.[0] ||
        'خطا در ثبت تراکنش انبار'
      toast.error(message)
    },
  })

  const currentStock = selectedPart?.stock_quantity ?? 0
  const inputQuantity = Number(toEnDigits(quantityRaw || '').replace(/\D/g, '')) || 0

  const resultingStock = useMemo(() => {
    if (type === 'in') return currentStock + inputQuantity
    if (type === 'out') return currentStock - inputQuantity
    return inputQuantity
  }, [type, currentStock, inputQuantity])

  const invalidOut = type === 'out' && inputQuantity > currentStock
  // برای ورود/خروج دستی، صفر معنا ندارد؛ فقط «اصلاح موجودی» می‌تواند صفر باشد.
  const invalidZero = type !== 'adjust' && inputQuantity < 1

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="ثبت ورود / خروج / اصلاح موجودی انبار"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={mutation.isPending}>
            انصراف
          </button>
          <button
            type="submit"
            form="stock-movement-form"
            className="btn btn-primary"
            disabled={mutation.isPending || invalidOut || invalidZero || !partId}
          >
            {mutation.isPending && <span className="loading loading-spinner loading-xs" />}
            ثبت تراکنش انبار
          </button>
        </>
      }
    >
      <form id="stock-movement-form" onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-4">
        <SearchableSelect
          label="دستگاه"
          required
          error={errors.part_id?.message}
          placeholder="جستجو و انتخاب دستگاه..."
          searchPlaceholder="جستجوی نام یا کد دستگاه..."
          value={partId}
          options={partOptions}
          onChange={(val) => setValue('part_id', val, { shouldValidate: true })}
        />

        <div>
          <label className="text-xs font-bold text-base-content/70 mb-1.5 block">نوع تراکنش</label>
          <div role="tablist" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { value: 'in', label: 'ورود به انبار', icon: ArrowDownToLine, tone: 'emerald' },
                { value: 'out', label: 'خروج از انبار', icon: ArrowUpFromLine, tone: 'rose' },
                { value: 'adjust', label: 'اصلاح موجودی', icon: SlidersHorizontal, tone: 'amber' },
              ] as const
            ).map((item) => {
              const Icon = item.icon
              const active = type === item.value
              return (
                <button
                  type="button"
                  key={item.value}
                  onClick={() => setValue('type', item.value, { shouldValidate: true })}
                  className={cx(
                    'flex items-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all',
                    active
                      ? 'border-primary bg-primary/5 text-primary shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-800',
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              )
            })}
          </div>
          <input type="hidden" {...register('type')} />
          {errors.type?.message && <p className="label text-error">{errors.type.message}</p>}
        </div>

        <Field
          label={type === 'adjust' ? 'موجودی صحیح جدید (عدد)' : 'تعداد'}
          required
          hint={`موجودی فعلی: ${num(currentStock)} عدد`}
          error={errors.quantity?.message}
        >
          <input
            inputMode="numeric"
            dir="ltr"
            className="input input-bordered w-full text-start"
            placeholder={type === 'adjust' ? 'مثال: 25' : 'مثال: 5'}
            {...register('quantity', {
              onChange: (e) => {
                e.target.value = toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 7)
              },
            })}
          />
        </Field>

        {invalidZero && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-200">
            برای ورود یا خروج کالا، تعداد باید حداقل ۱ عدد باشد.
          </div>
        )}

        {invalidOut && (
          <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error">
            موجودی فعلی این دستگاه {num(currentStock)} عدد است و امکان خروج {num(inputQuantity)} عدد وجود ندارد.
          </div>
        )}

        {!invalidOut && (inputQuantity > 0 || type === 'adjust') && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/60">
            موجودی پس از ثبت: <span className="font-black text-primary">{num(Math.max(0, resultingStock))}</span> عدد
          </div>
        )}

        <Field label="توضیح تراکنش (اختیاری)" error={errors.note?.message}>
          <textarea
            rows={2}
            className="textarea textarea-bordered w-full"
            placeholder="مثال: خرید از تأمین‌کننده / ارسال جهت نصب در کارخانه مشتری..."
            {...register('note')}
          />
        </Field>
      </form>
    </Modal>
  )
}
