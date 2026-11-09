import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Boxes, Sparkles } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { SearchableSelect } from '../ui/SearchableSelect'
import { DatePicker } from '../ui/DatePicker'
import { apiErrorMessage, partApi } from '../../services/api'
import { digits, num, toEnDigits } from '../../utils/format'
import type { Customer, CustomerPart } from '../../types'

/** شماره سریال: حروف انگلیسی، اعداد، خط تیره و اسلش (مطابق قاعده سمت سرور) */
const SERIAL_REGEX = /^[a-zA-Z0-9\-/]+$/
const SERIAL_ALLOWED_CHARS = /[^a-zA-Z0-9\-/]/g

const schema = z.object({
  part_id: z.string().min(1, 'انتخاب دستگاه از کاتالوگ الزامی است'),
  serial_number: z
    .string()
    .trim()
    .min(3, 'شماره سریال یکتای دستگاه را وارد کنید (حداقل ۳ کاراکتر)')
    .max(100, 'شماره سریال حداکثر ۱۰۰ کاراکتر است')
    .regex(SERIAL_REGEX, 'شماره سریال فقط می‌تواند شامل حروف انگلیسی، اعداد، خط تیره و اسلش باشد'),
  quantity: z
    .string()
    .refine((v) => toEnDigits(v).trim() !== '', 'تعداد دستگاه الزامی است')
    .refine((v) => /^\d+$/.test(toEnDigits(v).trim()), 'تعداد باید یک عدد صحیح باشد')
    .refine((v) => Number(toEnDigits(v)) >= 1, 'تعداد باید حداقل ۱ باشد')
    .refine((v) => Number(toEnDigits(v)) <= 100000, 'تعداد نمی‌تواند بیشتر از ۱۰۰٬۰۰۰ باشد'),
  invoice_number: z.string().trim().max(50, 'شماره فاکتور حداکثر ۵۰ کاراکتر است').optional().or(z.literal('')),
  invoice_amount: z
    .string()
    .refine((v) => v.trim() === '' || /^\d+(\.\d{1,2})?$/.test(toEnDigits(v).replace(/,/g, '')), 'مبلغ فاکتور باید عددی باشد')
    .optional()
    .or(z.literal('')),
  installation_date: z.string().min(1, 'تاریخ نصب یا تحویل را انتخاب کنید'),
  status: z.enum(['active', 'under_repair', 'replaced', 'retired']),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface AssignPartModalProps {
  open: boolean
  onClose: () => void
  customer: Customer
  onSuccess: () => void
  /** اگر مقدار داشته باشد، مودال در حالت «ویرایش تخصیص» باز می‌شود (تسک ۳) */
  assignment?: CustomerPart | null
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'فعال و در حال کار' },
  { value: 'under_repair', label: 'تحت تعمیر' },
  { value: 'replaced', label: 'تعویض شده' },
  { value: 'retired', label: 'از رده خارج' },
] as const

export function AssignPartModal({ open, onClose, customer, onSuccess, assignment = null }: AssignPartModalProps) {
  const isEdit = Boolean(assignment?.id)

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
      quantity: '1',
      invoice_number: '',
      invoice_amount: '',
      installation_date: today,
      status: 'active',
      notes: '',
    },
  })

  const partId = watch('part_id')
  const quantityRaw = toEnDigits(watch('quantity') || '')
  const quantity = /^\d+$/.test(quantityRaw.trim()) ? Number(quantityRaw) : 0

  const selectedPart = useMemo(
    () => parts.find((p) => String(p.id) === String(partId)) ?? null,
    [parts, partId],
  )

  const availableStock = selectedPart ? Number(selectedPart.stock_quantity ?? 0) : 0
  /** در حالت ویرایش، تعداد فعلی همان تخصیص جزئی از موجودی آزاد است */
  const alreadyAssigned =
    isEdit && assignment != null && String(assignment.part_id) === String(selectedPart?.id ?? '')
      ? Number(assignment.quantity ?? 1)
      : 0
  const effectiveStock = availableStock + alreadyAssigned
  const notEnoughStock = quantity > effectiveStock

  const partOptions = useMemo(() => {
    return parts.map((p) => {
      const stock = Number(p.stock_quantity ?? 0)
      const out = stock < 1
      return {
        value: String(p.id),
        label: `${p.name} (کد: ${p.code})`,
        hint: `موجودی انبار: ${num(stock)} ${p.unit_label || 'عدد'} — دوره سرویس: ${num(p.periodic_service_months)} ماه`,
        badge: out ? 'ناموجود در انبار' : p.is_low_stock ? 'کمبود موجودی' : undefined,
        disabled: !isEdit && out,
      }
    })
  }, [parts, isEdit])

  useEffect(() => {
    if (!open) return

    if (assignment) {
      reset({
        part_id: String(assignment.part_id ?? ''),
        serial_number: assignment.serial_number ?? '',
        quantity: String(assignment.quantity ?? 1),
        invoice_number: assignment.invoice_number ?? '',
        invoice_amount:
          assignment.invoice_amount === null || assignment.invoice_amount === undefined
            ? ''
            : String(assignment.invoice_amount),
        installation_date: (assignment.installation_date ?? today).slice(0, 10),
        status: (assignment.status ?? 'active') as FormValues['status'],
        notes: assignment.notes ?? '',
      })
      return
    }

    reset({
      part_id: parts.find((p) => Number(p.stock_quantity ?? 0) > 0)?.id
        ? String(parts.find((p) => Number(p.stock_quantity ?? 0) > 0)!.id)
        : parts[0]?.id
          ? String(parts[0].id)
          : '',
      serial_number: '',
      quantity: '1',
      invoice_number: '',
      invoice_amount: '',
      installation_date: today,
      status: 'active',
      notes: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, parts, assignment])

  const onSubmit = async (values: FormValues) => {
    const payload = {
      serial_number: values.serial_number.trim(),
      quantity: Number(toEnDigits(values.quantity)),
      invoice_number: values.invoice_number?.trim() || null,
      invoice_amount: values.invoice_amount?.trim() ? Number(toEnDigits(values.invoice_amount).replace(/,/g, '')) : null,
      installation_date: values.installation_date || null,
      status: values.status,
      notes: values.notes?.trim() || null,
    }

    try {
      const res = isEdit && assignment
        ? await partApi.updateAssignment(assignment.id, payload)
        : await partApi.assignPart(customer.id, { part_id: values.part_id, ...payload })
      toast.success(res.message)
      onSuccess()
      onClose()
    } catch (err: any) {
      const data = err?.response?.data
      const field = data?.errors?.serial_number?.[0]
        || data?.errors?.quantity?.[0]
        || data?.errors?.invoice_amount?.[0]
        || data?.errors?.invoice_number?.[0]
        || data?.errors?.installation_date?.[0]
        || data?.errors?.part_id?.[0]
      toast.error(field || apiErrorMessage(err, isEdit ? 'خطا در ویرایش دستگاه تخصیص‌یافته' : 'خطا در تخصیص دستگاه'))
    }
  }

  const customerLabel = customer.full_name || `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || customer.company_name || '—'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `ویرایش دستگاه تخصیص‌یافته — ${customerLabel}` : `تخصیص دستگاه به ${customerLabel}`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
            انصراف
          </button>
          <button
            type="submit"
            form="assign-part-form"
            className="btn btn-primary"
            disabled={isSubmitting || notEnoughStock}
          >
            {isSubmitting && <span className="loading loading-spinner loading-xs" />}
            {isEdit ? 'ذخیره تغییرات و اصلاح موجودی' : 'تخصیص دستگاه و کسر از انبار'}
          </button>
        </>
      }
    >
      <form id="assign-part-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {!isEdit && customer.customer_type === 'potential' && (
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-200">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-bold">تبدیل خودکار به مشتری بالفعل</p>
              <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
                این مشتری در حال حاضر «بالقوه» است. با ثبت این دستگاه، وضعیت پرونده او به‌طور خودکار به «بالفعل» تغییر می‌کند.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className={isEdit ? 'sm:col-span-2' : ''}>
            <SearchableSelect
              label="انتخاب دستگاه از کاتالوگ"
              required
              error={errors.part_id?.message}
              placeholder="جستجو و انتخاب دستگاه..."
              searchPlaceholder="جستجوی نام یا کد فنی دستگاه..."
              value={partId}
              options={partOptions}
              disabled={isEdit}
              hint={isEdit ? 'برای تغییر دستگاه، این ردیف را حذف و دستگاه جدید را تخصیص دهید تا موجودی انبار درست بماند.' : undefined}
              onChange={(val) => setValue('part_id', val, { shouldValidate: true })}
            />
          </div>

          <Field
            label="تعداد دستگاه"
            required
            error={errors.quantity?.message || (notEnoughStock ? `موجودی انبار کافی نیست (موجودی آزاد: ${num(effectiveStock)})` : undefined)}
            hint={selectedPart ? `موجودی انبار: ${num(availableStock)} ${selectedPart.unit_label || 'عدد'}` : undefined}
          >
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              className={`input input-bordered w-full text-start font-mono ${errors.quantity || notEnoughStock ? 'input-error' : ''}`}
              placeholder="1"
              {...register('quantity', {
                onChange: (e) => {
                  e.target.value = toEnDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 6)
                },
              })}
            />
          </Field>
        </div>

        <Field label="شناسه یکتای سریال دستگاه (Serial Number)" required error={errors.serial_number?.message}>
          <input
            dir="ltr"
            className={`input input-bordered w-full text-start font-mono ${errors.serial_number ? 'input-error' : ''}`}
            placeholder="مثال: SN-2026-HYD-00189"
            {...register('serial_number', {
              onChange: (e) => {
                e.target.value = e.target.value.replace(SERIAL_ALLOWED_CHARS, '')
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
              if (!/^[a-zA-Z0-9\-/]$/.test(e.key)) {
                e.preventDefault()
              }
            }}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="شماره فاکتور"
            error={errors.invoice_number?.message}
            hint="اختیاری — شماره فاکتور فروش را دستی وارد کنید."
          >
            <input
              dir="ltr"
              className={`input input-bordered w-full text-start font-mono ${errors.invoice_number ? 'input-error' : ''}`}
              placeholder="مثال: INV-1404-0091"
              maxLength={50}
              {...register('invoice_number')}
            />
          </Field>

          <Field
            label="مبلغ فاکتور (تومان)"
            error={errors.invoice_amount?.message}
            hint={
              watch('invoice_amount')?.trim()
                ? `${num(Number(toEnDigits(watch('invoice_amount')).replace(/,/g, '')) || 0)} تومان`
                : 'اختیاری — مبلغ دستی وارد می‌شود.'
            }
          >
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              className={`input input-bordered w-full text-start font-mono ${errors.invoice_amount ? 'input-error' : ''}`}
              placeholder="مثال: 486000000"
              {...register('invoice_amount', {
                onChange: (e) => {
                  e.target.value = toEnDigits(e.target.value).replace(/[^\d.]/g, '').slice(0, 16)
                },
              })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="تاریخ تحویل یا نصب" required error={errors.installation_date?.message}>
            <DatePicker
              value={watch('installation_date')}
              onChange={(val) => setValue('installation_date', val || '', { shouldValidate: true })}
              maxDate={today}
            />
          </Field>

          <Field label="وضعیت دستگاه نزد مشتری" error={errors.status?.message}>
            <select className="select select-bordered w-full" {...register('status')}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="توضیحات و شرایط ضمانت"
          hint={
            selectedPart
              ? `سررسید گارانتی به‌صورت خودکار بر اساس دوره ${digits(selectedPart.periodic_service_months)} ماهه محاسبه می‌شود.`
              : undefined
          }
        >
          <textarea
            rows={2}
            className="textarea textarea-bordered w-full"
            placeholder="یادداشت‌های محل نصب، نام تکنسین تحویل‌دهنده یا شرایط خاص دستگاه..."
            {...register('notes')}
          />
        </Field>

        {!isEdit && (
          <div className="flex items-start gap-2.5 rounded-xl border border-base-300 bg-base-200/60 p-3 text-[11px] text-base-content/75">
            <Boxes className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="leading-relaxed">
              با ثبت این تخصیص، {quantity > 0 ? digits(quantity) : '—'} عدد از موجودی انبار کسر می‌شود و یک رکورد
              «خروج جهت تخصیص» با نام شما در تاریخچه انبار ثبت می‌گردد. در صورت حذف یا کاهش تعداد، موجودی به‌طور خودکار
              به انبار بازمی‌گردد.
            </p>
          </div>
        )}
      </form>
    </Modal>
  )
}
