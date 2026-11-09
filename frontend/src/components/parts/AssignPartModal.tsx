import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Sparkles } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { SearchableSelect } from '../ui/SearchableSelect'
import { DatePicker } from '../ui/DatePicker'
import { partApi } from '../../services/api'
import type { Customer, CustomerPart } from '../../types'
import { toEnDigits, num } from '../../utils/format'

const schema = z.object({
  part_id: z.string().min(1, 'انتخاب مدل دستگاه الزامی است'),
  serial_number: z
    .string()
    .trim()
    .min(3, 'شماره سریال یکتا را وارد کنید')
    .regex(/^[a-zA-Z0-9]+$/, 'شماره سریال فقط می‌تواند شامل حروف انگلیسی و اعداد باشد'),
  installation_date: z.string().min(1, 'تاریخ نصب یا تحویل را انتخاب کنید'),
  quantity: z.string().regex(/^[1-9]\d*$/, 'تعداد باید عدد صحیح مثبت باشد'),
  invoice_amount: z.string().regex(/^(?:\d+(?:\.\d{1,2})?)?$/, 'مبلغ معتبر وارد کنید'),
  invoice_number: z.string().max(100),
  notes: z.string().trim().optional(),
})

type FormValues = z.infer<typeof schema>

interface AssignPartModalProps {
  open: boolean
  onClose: () => void
  customer: Customer
  onSuccess: () => void
  assignment?: CustomerPart | null
}

export function AssignPartModal({ open, onClose, customer, onSuccess, assignment }: AssignPartModalProps) {
  const { data: parts = [] } = useQuery({
    queryKey: ['parts-catalog'],
    queryFn: () => partApi.list(),
    enabled: open,
  })

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
      part_id: '',
      serial_number: '',
      installation_date: today,
      notes: '',
      quantity: '1', invoice_amount: '', invoice_number: '',
    },
  })

  const partId = watch('part_id')

  const partOptions = useMemo(() => {
    return parts.map((p) => ({
      value: String(p.id),
      label: `${p.name} (کد: ${p.code})`,
      hint: `موجودی: ${num(p.stock_quantity)} • دوره سرویس: ${num(p.periodic_service_months)} ماه`,
    }))
  }, [parts])

  useEffect(() => {
    if (open) {
      reset({
        part_id: assignment ? String(assignment.part_id) : '',
        serial_number: assignment?.serial_number ?? '',
        installation_date: assignment?.installation_date?.slice(0, 10) ?? today,
        notes: assignment?.notes ?? '',
        quantity: String(assignment?.quantity ?? 1),
        invoice_amount: assignment?.invoice_amount == null ? '' : String(assignment.invoice_amount),
        invoice_number: assignment?.invoice_number ?? '',
      })
    }
  }, [open, assignment, reset, today])

  const onSubmit = async (values: FormValues) => {
    try {
      const fields = {
        serial_number: values.serial_number,
        quantity: Number(toEnDigits(values.quantity)),
        invoice_amount: values.invoice_amount || null,
        invoice_number: values.invoice_number || null,
        installation_date: values.installation_date,
        notes: values.notes,
      }
      const res = assignment
        ? await partApi.updateAssignment(assignment.id, fields)
        : await partApi.assignPart(customer.id, { ...fields, part_id: values.part_id })
      toast.success(res.message)
      onSuccess()
      onClose()
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.errors?.serial_number?.[0] || 'خطا در تخصیص دستگاه'
      toast.error(msg)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={assignment ? 'ویرایش تخصیص دستگاه' : `تخصیص دستگاه به ${customer.full_name || customer.company_name || ''}`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
            انصراف
          </button>
          <button type="submit" form="assign-part-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting && <span className="loading loading-spinner loading-xs" />}
            {assignment ? 'ذخیره تغییرات' : 'تخصیص دستگاه'}
          </button>
        </>
      }
    >
      <form id="assign-part-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {customer.customer_type === 'potential' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950 flex items-start gap-2.5 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-200">
            <Sparkles className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div>
              <p className="font-bold">تبدیل خودکار به مشتری بالفعل</p>
              <p className="mt-0.5 text-[11px] opacity-90 leading-relaxed">
                این مشتری در حال حاضر «بالقوه» است. با ثبت این دستگاه، وضعیت پرونده او به طور خودکار به «بالفعل» تغییر خواهد یافت.
              </p>
            </div>
          </div>
        )}

        {/* Searchable Select for Parts */}
        {!assignment && <SearchableSelect
          label="انتخاب مدل دستگاه از کاتالوگ"
          required
          error={errors.part_id?.message}
          placeholder="جستجو و انتخاب مدل دستگاه..."
          searchPlaceholder="جستجوی نام یا کد دستگاه..."
          value={partId}
          options={partOptions}
          onChange={(val) => setValue('part_id', val, { shouldValidate: true })}
        />}

        <Field label="شناسه یکتای سریال (Serial Number)" required error={errors.serial_number?.message}>
          <input
            dir="ltr"
            className="input input-bordered w-full text-start font-mono"
            placeholder="مثال: SN20268821"
            {...register('serial_number', {
              onChange: (e) => {
                e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
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
              if (!/^[a-zA-Z0-9]$/.test(e.key)) {
                e.preventDefault()
              }
            }}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="تعداد" required error={errors.quantity?.message}>
            <input inputMode="numeric" className="input input-bordered w-full" {...register('quantity', { setValueAs: (value) => toEnDigits(value), onChange: (e) => { e.target.value = toEnDigits(e.target.value) } })} />
          </Field>
          <Field label="مبلغ فاکتور" error={errors.invoice_amount?.message}>
            <input inputMode="decimal" className="input input-bordered w-full" {...register('invoice_amount', { setValueAs: (value) => toEnDigits(value).replace(/[٬,]/g, ''), onChange: (e) => { e.target.value = toEnDigits(e.target.value).replace(/[٬,]/g, '') } })} />
          </Field>
          <Field label="شماره فاکتور" error={errors.invoice_number?.message}>
            <input className="input input-bordered w-full" {...register('invoice_number')} />
          </Field>
        </div>

        <Field label="تاریخ تحویل یا نصب فیزیکی" required error={errors.installation_date?.message}>
          <DatePicker
            value={watch('installation_date')}
            onChange={(val) => setValue('installation_date', val || '', { shouldValidate: true })}
          />
        </Field>

        <Field label="توضیحات و شرایط ضمانت">
          <textarea
            rows={2}
            className="textarea textarea-bordered w-full"
            placeholder="یادداشت‌های محل نصب، نام تکنسین تحویل‌دهنده یا شرایط خاص دستگاه..."
            {...register('notes')}
          />
        </Field>
      </form>
    </Modal>
  )
}
