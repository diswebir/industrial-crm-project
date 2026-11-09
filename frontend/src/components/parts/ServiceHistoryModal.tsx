import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { DatePicker } from '../ui/DatePicker'
import { apiErrorMessage, partApi } from '../../services/api'
import { num, toEnDigits } from '../../utils/format'
import type { CustomerPart, PartServiceHistory, ServiceType } from '../../types'

const schema = z.object({
  service_date: z.string().min(1, 'تاریخ سرویس را انتخاب کنید'),
  service_type: z.enum(['periodic', 'repair', 'overhaul']),
  description: z
    .string()
    .trim()
    .min(5, 'شرح اقدامات سرویس/تعمیر را وارد کنید (حداقل ۵ کاراکتر)')
    .max(2000, 'شرح سرویس حداکثر ۲۰۰۰ کاراکتر است'),
  cost: z
    .string()
    .refine((v) => v.trim() === '' || /^\d+(\.\d{1,2})?$/.test(toEnDigits(v).replace(/,/g, '')), 'هزینه باید عددی باشد')
    .optional()
    .or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface ServiceHistoryModalProps {
  open: boolean
  onClose: () => void
  customerPart: CustomerPart | null
  onSuccess: () => void
  /** اگر مقدار داشته باشد، مودال در حالت «ویرایش سابقه» باز می‌شود (تسک ۳) */
  history?: PartServiceHistory | null
}

const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: 'repair', label: 'تعمیر فنی (Repair)' },
  { value: 'periodic', label: 'سرویس دوره‌ای گارانتی (Periodic)' },
  { value: 'overhaul', label: 'اورهال و بازسازی کامل (Overhaul)' },
]

export function ServiceHistoryModal({ open, onClose, customerPart, onSuccess, history = null }: ServiceHistoryModalProps) {
  const isEdit = Boolean(history?.id)
  const today = new Date().toISOString().slice(0, 10)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      service_date: today,
      service_type: 'repair',
      description: '',
      cost: '',
    },
  })

  useEffect(() => {
    if (!open) return

    if (history) {
      reset({
        service_date: (history.service_date ?? today).slice(0, 10),
        service_type: (history.service_type ?? 'repair') as ServiceType,
        description: history.description ?? '',
        cost:
          history.cost === null || history.cost === undefined || history.cost === ''
            ? ''
            : String(history.cost),
      })
      return
    }

    reset({
      service_date: today,
      service_type: 'repair',
      description: '',
      cost: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, history])

  const onSubmit = async (values: FormValues) => {
    if (!customerPart && !history) return

    const payload = {
      service_date: values.service_date,
      service_type: values.service_type,
      description: values.description.trim(),
      cost: values.cost?.trim() ? Number(toEnDigits(values.cost).replace(/,/g, '')) : null,
    }

    try {
      const res = isEdit && history
        ? await partApi.updateServiceHistory(history.id, payload)
        : await partApi.addServiceHistory(customerPart!.id, payload)
      toast.success(res.message)
      onSuccess()
      onClose()
    } catch (err: any) {
      const data = err?.response?.data
      const field = data?.errors?.service_date?.[0]
        || data?.errors?.description?.[0]
        || data?.errors?.cost?.[0]
        || data?.errors?.service_type?.[0]
      toast.error(field || apiErrorMessage(err, 'خطا در ثبت سابقه سرویس'))
    }
  }

  if (!customerPart && !history) return null

  const deviceLabel = customerPart?.serial_number || history?.customer_part?.serial_number || '—'
  const costPreview = watch('cost')?.trim()
    ? `${num(Number(toEnDigits(watch('cost')).replace(/,/g, '')) || 0)} تومان`
    : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        isEdit
          ? `ویرایش سابقه سرویس — سریال ${deviceLabel}`
          : `ثبت سابقه اقدام/تعمیر برای سریال ${deviceLabel}`
      }
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
            انصراف
          </button>
          <button type="submit" form="service-history-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting && <span className="loading loading-spinner loading-xs" />}
            {isEdit ? 'ذخیره تغییرات' : 'ثبت در سوابق'}
          </button>
        </>
      }
    >
      <form id="service-history-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {customerPart?.part?.name && (
          <div className="rounded-xl border border-base-300 bg-base-200/60 px-3 py-2 text-xs text-base-content/75">
            <span className="font-bold">{customerPart.part.name}</span>
            <span className="mx-1">•</span>
            <span className="font-mono" dir="ltr">{customerPart.serial_number}</span>
            <span className="mx-1">•</span>
            <span>تعداد: {num(customerPart.quantity ?? 1)}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="تاریخ انجام سرویس/تعمیر" required error={errors.service_date?.message}>
            <DatePicker
              value={watch('service_date')}
              onChange={(val) => setValue('service_date', val || '', { shouldValidate: true })}
              maxDate={today}
            />
          </Field>

          <Field label="نوع اقدام" required error={errors.service_type?.message}>
            <select className="select select-bordered w-full" {...register('service_type')}>
              {SERVICE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="شرح خدمات انجام‌شده و دستگاه‌های مصرفی" required error={errors.description?.message}>
          <textarea
            rows={3}
            className={`textarea textarea-bordered w-full ${errors.description ? 'textarea-error' : ''}`}
            placeholder="مثال: تعویض کاسه‌نمدها و سیل آب‌بندی، تست فشار هیدرولیک در ۴۰۰ بار..."
            {...register('description')}
          />
        </Field>

        <Field
          label="هزینه سرویس (تومان — در صورت شمول)"
          error={errors.cost?.message}
          hint={costPreview ?? 'اختیاری است.'}
        >
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            className={`input input-bordered w-full text-start font-mono ${errors.cost ? 'input-error' : ''}`}
            placeholder="مثال: 1200000"
            {...register('cost', {
              onChange: (e) => {
                e.target.value = toEnDigits(e.target.value).replace(/[^\d.]/g, '').slice(0, 16)
              },
            })}
          />
        </Field>
      </form>
    </Modal>
  )
}
