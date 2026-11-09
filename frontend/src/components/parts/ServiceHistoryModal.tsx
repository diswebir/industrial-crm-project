import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { DatePicker } from '../ui/DatePicker'
import { num, todayIso } from '../../utils/format'
import { partApi } from '../../services/api'
import type { CustomerPart } from '../../types'

const schema = z.object({
  service_date: z.string().min(1, 'تاریخ سرویس را انتخاب کنید'),
  service_type: z.enum(['periodic', 'repair', 'overhaul']),
  description: z.string().trim().min(5, 'شرح اقدامات سرویس/تعمیر را وارد کنید (حداقل ۵ کاراکتر)'),
  cost: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface ServiceHistoryModalProps {
  open: boolean
  onClose: () => void
  customerPart: CustomerPart | null
  onSuccess: () => void
}

export function ServiceHistoryModal({ open, onClose, customerPart, onSuccess }: ServiceHistoryModalProps) {
  const today = useMemo(() => todayIso(), [])

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
    if (open) {
      reset({
        service_date: today,
        service_type: 'repair',
        description: '',
        cost: '',
      })
    }
  }, [open, reset, today])

  const onSubmit = async (values: FormValues) => {
    if (!customerPart) return
    try {
      const res = await partApi.addServiceHistory(customerPart.id, {
        service_date: values.service_date,
        service_type: values.service_type,
        description: values.description,
        cost: values.cost ? Number(values.cost) : undefined,
      })
      toast.success(res.message)
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'خطا در ثبت سابقه سرویس')
    }
  }

  if (!customerPart) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`ثبت سابقه اقدام/تعمیر برای ${customerPart.serial_number ? `سریال ${customerPart.serial_number}` : `${customerPart.part?.name ?? 'دستگاه'} (${num(customerPart.quantity ?? 1)} عدد)`}`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
            انصراف
          </button>
          <button type="submit" form="service-history-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting && <span className="loading loading-spinner loading-xs" />}
            ثبت در سوابق
          </button>
        </>
      }
    >
      <form id="service-history-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="تاریخ انجام سرویس/تعمیر" required error={errors.service_date?.message}>
            <DatePicker
              value={watch('service_date')}
              onChange={(val) => setValue('service_date', val || '', { shouldValidate: true })}
            />
          </Field>

          <Field label="نوع اقدام" required error={errors.service_type?.message}>
            <select className="select select-bordered w-full" {...register('service_type')}>
              <option value="repair">تعمیر فنی (Repair)</option>
              <option value="periodic">سرویس دوره‌ای گارانتی (Periodic)</option>
              <option value="overhaul">اورهال و بازسازی کامل (Overhaul)</option>
            </select>
          </Field>
        </div>

        <Field label="شرح خدمات انجام‌شده و دستگاه‌های مصرفی" required error={errors.description?.message}>
          <textarea
            rows={3}
            className="textarea textarea-bordered w-full"
            placeholder="مثال: تعویض کاسه نمدها و سیل آب‌بندی، تست فشار هیدرولیک در ۴۰۰ بار..."
            {...register('description')}
          />
        </Field>

        <Field label="هزینه سرویس / دستگاه (تومان - در صورت شمول)">
          <input
            type="number"
            dir="ltr"
            className="input input-bordered w-full text-start font-mono"
            placeholder="مثال: 1200000"
            {...register('cost')}
          />
        </Field>
      </form>
    </Modal>
  )
}
