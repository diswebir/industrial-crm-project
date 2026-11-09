import { useEffect, useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { AlertTriangle, Boxes, Sparkles } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { SearchableSelect } from '../ui/SearchableSelect'
import { DatePicker } from '../ui/DatePicker'
import { partApi } from '../../services/api'
import { digits, num, toEnDigits, toman } from '../../utils/format'
import type { Customer, CustomerPart, Part } from '../../types'

const schema = z.object({
  part_id: z.string().min(1, 'انتخاب مدل دستگاه الزامی است'),
  quantity: z
    .string()
    .min(1, 'تعداد دستگاه را وارد کنید')
    .refine((v) => Number(toEnDigits(v).replace(/\D/g, '')) >= 1, 'تعداد باید حداقل ۱ عدد باشد'),
  serial_number: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9\-_/]*$/, 'شماره سریال فقط می‌تواند شامل حروف انگلیسی، اعداد، خط تیره و اسلش باشد')
    .optional(),
  invoice_number: z.string().trim().max(100, 'شماره فاکتور حداکثر ۱۰۰ کاراکتر است').optional(),
  invoice_amount: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d+$/.test(toEnDigits(v).replace(/[,\s،]/g, '')),
      'مبلغ فاکتور باید عددی باشد',
    ),
  installation_date: z.string().min(1, 'تاریخ نصب یا تحویل را انتخاب کنید'),
  warranty_expire_date: z.string().optional(),
  status: z.enum(['active', 'under_repair', 'replaced', 'retired']),
  notes: z.string().trim().optional(),
})

type FormValues = z.infer<typeof schema>

interface AssignDeviceModalProps {
  open: boolean
  onClose: () => void
  customer: Customer
  /** در صورت مقدار داشتن، فرم در حالت «ویرایش تخصیص» باز می‌شود */
  assignment?: CustomerPart | null
  onSuccess: () => void
}

export function AssignDeviceModal({ open, onClose, customer, assignment, onSuccess }: AssignDeviceModalProps) {
  const isEditing = Boolean(assignment)

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
      quantity: '1',
      serial_number: '',
      invoice_number: '',
      invoice_amount: '',
      installation_date: today,
      warranty_expire_date: '',
      status: 'active',
      notes: '',
    },
  })

  const partId = watch('part_id')
  const quantityRaw = watch('quantity')
  const invoiceAmountRaw = watch('invoice_amount')
  const notes = watch('notes')
  const status = watch('status')
  const installationDate = watch('installation_date')
  const warrantyDate = watch('warranty_expire_date')

  const selectedPart = useMemo<Part | undefined>(
    () => parts.find((p) => String(p.id) === partId),
    [parts, partId],
  )

  const quantity = Math.max(1, Number(toEnDigits(quantityRaw).replace(/\D/g, '')) || 1)

  // در حالت ویرایش، تعداد فعلی همان دستگاه از قبل در انبار کسر شده است و جزو موجودی آزاد نیست.
  const stockBase = selectedPart?.stock_quantity ?? 0
  const availableForThis = isEditing && String(assignment?.part_id) === partId
    ? stockBase + Math.max(1, Number(assignment?.quantity ?? 1))
    : stockBase

  const insufficientStock = quantity > availableForThis

  const partOptions = useMemo(() => {
    return parts.map((p) => ({
      value: String(p.id),
      label: `${p.name} (کد: ${p.code})`,
      hint: `موجودی انبار: ${num(p.stock_quantity)} عدد • دوره گارانتی: ${num(p.periodic_service_months)} ماه`,
    }))
  }, [parts])

  useEffect(() => {
    if (!open) return

    if (assignment) {
      reset({
        part_id: String(assignment.part_id),
        quantity: String(assignment.quantity ?? 1),
        serial_number: assignment.serial_number ?? '',
        invoice_number: assignment.invoice_number ?? '',
        invoice_amount:
          assignment.invoice_amount !== null && assignment.invoice_amount !== undefined
            ? String(Math.round(Number(assignment.invoice_amount)))
            : '',
        installation_date: assignment.installation_date || today,
        warranty_expire_date: assignment.warranty_expire_date || '',
        status: assignment.status,
        notes: assignment.notes ?? '',
      })
      return
    }

    const firstAvailable = parts.find((p) => (p.stock_quantity ?? 0) > 0) ?? parts[0]

    reset({
      part_id: firstAvailable?.id ? String(firstAvailable.id) : '',
      quantity: '1',
      serial_number: '',
      invoice_number: '',
      invoice_amount: '',
      installation_date: today,
      warranty_expire_date: '',
      status: 'active',
      notes: '',
    })
  }, [open, assignment, parts, reset, today])

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const normalizedAmount = values.invoice_amount
        ? Number(toEnDigits(values.invoice_amount).replace(/\D/g, ''))
        : null

      const payload = {
        part_id: values.part_id,
        quantity: Math.max(1, Number(toEnDigits(values.quantity).replace(/\D/g, '')) || 1),
        serial_number: values.serial_number?.trim() ? values.serial_number.trim() : null,
        invoice_number: values.invoice_number?.trim() ? values.invoice_number.trim() : null,
        invoice_amount: normalizedAmount,
        installation_date: values.installation_date,
        warranty_expire_date: values.warranty_expire_date || undefined,
        status: values.status,
        notes: values.notes?.trim() || undefined,
      }

      if (assignment) {
        return partApi.updateAssignment(assignment.id, payload)
      }

      return partApi.assignPart(customer.id, payload)
    },
    onSuccess: (res: any) => {
      toast.success(res?.message || (isEditing ? 'تخصیص دستگاه ویرایش شد.' : 'دستگاه با موفقیت تخصیص داده شد.'))
      onSuccess()
      onClose()
    },
    onError: (err: any) => {
      const message =
        err.response?.data?.message ||
        err.response?.data?.errors?.quantity?.[0] ||
        err.response?.data?.errors?.serial_number?.[0] ||
        err.response?.data?.errors?.invoice_amount?.[0] ||
        (isEditing ? 'خطا در ویرایش تخصیص دستگاه' : 'خطا در تخصیص دستگاه')
      toast.error(message)
    },
  })

  const onSubmit = (values: FormValues) => {
    if (insufficientStock) {
      toast.error('موجودی انبار برای این تعداد کافی نیست.')
      return
    }
    saveMutation.mutate(values)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        isEditing
          ? `ویرایش دستگاه تخصیص‌یافته به ${customer.full_name || customer.first_name}`
          : `تخصیص دستگاه به ${customer.full_name || customer.first_name}`
      }
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting || saveMutation.isPending}>
            انصراف
          </button>
          <button
            type="submit"
            form="assign-device-form"
            className="btn btn-primary"
            disabled={isSubmitting || saveMutation.isPending || insufficientStock}
          >
            {(isSubmitting || saveMutation.isPending) && <span className="loading loading-spinner loading-xs" />}
            {isEditing ? 'ذخیره تغییرات تخصیص' : 'تخصیص دستگاه و ثبت فاکتور'}
          </button>
        </>
      }
    >
      <form id="assign-device-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {!isEditing && customer.customer_type === 'potential' && (
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

        {parts.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-200">
            هیچ مدل دستگاهی در کاتالوگ تعریف نشده است. ابتدا از بخش «کاتالوگ دستگاه‌ها» مدل جدید ثبت کنید.
          </div>
        )}

        {/* Searchable Select for Devices */}
        <SearchableSelect
          label="انتخاب مدل دستگاه از کاتالوگ"
          required
          error={errors.part_id?.message}
          placeholder="جستجو و انتخاب مدل دستگاه..."
          searchPlaceholder="جستجوی نام یا کد دستگاه..."
          value={partId}
          options={partOptions}
          onChange={(val) => setValue('part_id', val, { shouldValidate: true })}
        />

        {selectedPart && (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/60">
            <span className="flex items-center gap-1.5 font-bold text-base-content/80">
              <Boxes className="size-4 text-primary" /> موجودی انبار:
              <span className="font-black text-primary">{num(stockBase)} عدد</span>
            </span>
            <span className="text-base-content/60">
              دوره گارانتی: {num(selectedPart.periodic_service_months)} ماه
            </span>
            <span className="text-base-content/60">
              کد فنی: <span className="font-mono">{selectedPart.code}</span>
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="تعداد دستگاه" required error={errors.quantity?.message}>
            <input
              inputMode="numeric"
              dir="ltr"
              className="input input-bordered w-full text-start"
              placeholder="مثال: 2"
              {...register('quantity', {
                onChange: (e) => {
                  e.target.value = toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 6)
                },
              })}
            />
          </Field>

          <Field
            label="شماره سریال (اختیاری)"
            hint={quantity > 1 ? 'برای تخصیص چندعددی، سریال را خالی بگذارید.' : undefined}
            error={errors.serial_number?.message}
          >
            <input
              dir="ltr"
              className="input input-bordered w-full text-start font-mono"
              placeholder="مثال: SN-2026-8821"
              {...register('serial_number', {
                onChange: (e) => {
                  e.target.value = e.target.value.replace(/[^a-zA-Z0-9\-_/]/g, '')
                },
              })}
            />
          </Field>
        </div>

        {insufficientStock && (
          <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error flex items-center gap-2">
            <AlertTriangle className="size-4" />
            موجودی کافی نیست؛ حداکثر {num(availableForThis)} عدد از این دستگاه قابل تخصیص است.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="شماره فاکتور (اختیاری)" error={errors.invoice_number?.message}>
            <input
              dir="ltr"
              className="input input-bordered w-full text-start font-mono"
              placeholder="مثال: INV-1404-0012"
              {...register('invoice_number')}
            />
          </Field>

          <Field
            label="مبلغ فاکتور (تومان - اختیاری)"
            hint={
              invoiceAmountRaw && toEnDigits(invoiceAmountRaw).replace(/\D/g, '')
                ? toman(Number(toEnDigits(invoiceAmountRaw).replace(/\D/g, '')))
                : undefined
            }
            error={errors.invoice_amount?.message}
          >
            <input
              inputMode="numeric"
              dir="ltr"
              className="input input-bordered w-full text-start"
              placeholder="مثال: 15000000"
              {...register('invoice_amount', {
                onChange: (e) => {
                  e.target.value = toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 15)
                },
              })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="تاریخ تحویل یا نصب" required error={errors.installation_date?.message}>
            <DatePicker
              value={installationDate}
              onChange={(val) => setValue('installation_date', val || '', { shouldValidate: true })}
            />
          </Field>

          <Field label="پایان گارانتی (در صورت نیاز)" error={errors.warranty_expire_date?.message}>
            <DatePicker
              value={warrantyDate}
              onChange={(val) => setValue('warranty_expire_date', val || '')}
              placeholder="محاسبه خودکار از دوره سرویس"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="وضعیت دستگاه" required error={errors.status?.message}>
            <select className="select select-bordered w-full" {...register('status')} value={status}>
              <option value="active">فعال در محل مشتری</option>
              <option value="under_repair">در دست تعمیر</option>
              <option value="replaced">تعویض‌شده</option>
              <option value="retired">از رده خارج</option>
            </select>
          </Field>

          <Field label="توضیحات و شرایط ضمانت" error={errors.notes?.message}>
            <input
              className="input input-bordered w-full"
              placeholder="محل نصب، تکنسین تحویل‌دهنده یا شرایط خاص..."
              {...register('notes')}
            />
          </Field>
        </div>

        {quantity > 1 && !insufficientStock && (
          <p className="text-[11px] text-base-content/60 leading-relaxed">
            با ثبت این تخصیص، {digits(quantity)} عدد از موجودی انبار کسر می‌شود و در تاریخچه انبار با نام شما و لینک این مشتری ثبت می‌گردد.
          </p>
        )}
      </form>
    </Modal>
  )
}
