import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { SearchableSelect } from '../ui/SearchableSelect'
import { customerApi } from '../../services/api'
import { IRAN_PROVINCES, getCitiesByProvince } from '../../data/iranLocations'
import { cx, toEnDigits } from '../../utils/format'
import type { Customer } from '../../types'

/**
 * اعتبارسنجی فرم مشتری (تسک ۵):
 *  - شخص حقوقی: «نام شرکت» اجباری است و نام/نام‌خانوادگی اختیاری.
 *  - شخص حقیقی: نام و نام‌خانوادگی اجباری است.
 *  - شماره همراه در هر دو حالت اختیاری است (اگر وارد شود باید معتبر باشد).
 */
const schema = z
  .object({
    customer_type: z.enum(['potential', 'effective']),
    type: z.enum(['individual', 'company']),
    first_name: z.string().trim().optional(),
    last_name: z.string().trim().optional(),
    company_name: z.string().trim().optional(),
    national_code: z.string().trim().optional(),
    mobile: z.string().trim().optional(),
    phone: z
      .string()
      .trim()
      .regex(/^0\d{7,10}$/, 'شماره تلفن ثابت باید ۸ تا ۱۱ رقم عددی بوده و با 0 شروع شود (مثال: 02188776655)')
      .or(z.literal(''))
      .optional(),
    email: z.string().trim().email('فرمت آدرس ایمیل معتبر نیست').or(z.literal('')).optional(),
    province: z.string().trim().optional(),
    city: z.string().trim().optional(),
    address: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'company') {
      if (!data.company_name || data.company_name.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['company_name'],
          message: 'نام شرکت / کارگاه باید حداقل ۲ کاراکتر باشد',
        })
      }
    } else {
      if (!data.first_name || data.first_name.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['first_name'],
          message: 'نام باید حداقل ۲ کاراکتر باشد',
        })
      }
      if (!data.last_name || data.last_name.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['last_name'],
          message: 'نام خانوادگی باید حداقل ۲ کاراکتر باشد',
        })
      }
      if (data.company_name && data.company_name.length > 0 && data.company_name.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['company_name'],
          message: 'نام شرکت باید حداقل ۲ کاراکتر باشد',
        })
      }
    }

    if (data.mobile && data.mobile.length > 0 && !/^09\d{9}$/.test(data.mobile)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mobile'],
        message: 'شماره همراه باید ۱۱ رقم عددی بوده و با 09 شروع شود (مثال: 09121234567)',
      })
    }

    if (data.national_code && data.national_code.length > 0) {
      // هر دو طول ۱۰ و ۱۱ برای سازگاری با پرونده‌های قدیمی پذیرفته می‌شود.
      if (!/^\d{10,11}$/.test(data.national_code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['national_code'],
          message: 'کد ملی / شناسه ملی باید ۱۰ یا ۱۱ رقم عددی باشد',
        })
      }
    }
  })

type FormValues = z.infer<typeof schema>

interface CustomerFormModalProps {
  open: boolean
  onClose: () => void
  customer?: Customer
  onSuccess: () => void
}

const EMPTY_VALUES: FormValues = {
  customer_type: 'potential',
  type: 'individual',
  first_name: '',
  last_name: '',
  company_name: '',
  national_code: '',
  mobile: '',
  phone: '',
  email: '',
  province: 'تهران',
  city: 'تهران',
  address: '',
  notes: '',
}

export function CustomerFormModal({ open, onClose, customer, onSuccess }: CustomerFormModalProps) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
  })

  // فقط در لحظه باز شدن (یا تغییر مشتریِ در حال ویرایش) فرم را مقدار‌دهی می‌کنیم؛
  // refetch خودکار مشتری نباید ورودی‌های در حال تکمیل را پاک کند.
  const wasOpenRef = useRef(false)
  const lastCustomerIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      lastCustomerIdRef.current = undefined
      return
    }

    const currentId = customer ? String(customer.id) : undefined
    if (wasOpenRef.current && lastCustomerIdRef.current === currentId) return

    wasOpenRef.current = true
    lastCustomerIdRef.current = currentId

    if (customer) {
      reset({
        customer_type: customer.customer_type,
        type: customer.type,
        first_name: customer.first_name ?? '',
        last_name: customer.last_name ?? '',
        company_name: customer.company_name ?? '',
        national_code: customer.national_code ?? '',
        mobile: customer.mobile ?? '',
        phone: customer.phone ?? '',
        email: customer.email ?? '',
        province: customer.province ?? 'تهران',
        city: customer.city ?? 'تهران',
        address: customer.address ?? '',
        notes: customer.notes ?? '',
      })
      return
    }

    reset(EMPTY_VALUES)
  }, [open, customer, reset])

  const type = watch('type')
  const customerType = watch('customer_type')
  const province = watch('province')
  const city = watch('city')

  // Available cities based on current province
  const availableCities = useMemo(() => getCitiesByProvince(province), [province])

  const handleProvinceChange = (newProvince: string) => {
    setValue('province', newProvince)
    const cities = getCitiesByProvince(newProvince)
    if (cities.length > 0) {
      setValue('city', cities[0])
    } else {
      setValue('city', '')
    }
  }

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        ...values,
        first_name: values.type === 'company' ? values.first_name || '' : values.first_name,
        last_name: values.type === 'company' ? values.last_name || '' : values.last_name,
        company_name: values.company_name || '',
        mobile: values.mobile || '',
        national_code: values.national_code || '',
      }

      if (customer) {
        await customerApi.update(customer.id, payload)
        toast.success('مشخصات مشتری بروزرسانی شد.')
      } else {
        await customerApi.create(payload)
        toast.success('مشتری جدید با موفقیت ثبت شد.')
      }
      onSuccess()
    } catch (err: any) {
      const serverErrors = err.response?.data?.errors
      const firstServerError = serverErrors ? Object.values(serverErrors)[0] : null
      const msg =
        (Array.isArray(firstServerError) ? firstServerError[0] : firstServerError) ||
        err.response?.data?.message ||
        'خطا در ذخیره اطلاعات مشتری'
      toast.error(String(msg))
    }
  }

  const digitOnly = (e: React.FormEvent<HTMLInputElement>, maxLength: number) => {
    const input = e.currentTarget
    input.value = toEnDigits(input.value).replace(/\D/g, '').slice(0, maxLength)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={customer ? 'ویرایش پرونده مشتری' : 'ثبت مشتری جدید'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
            انصراف
          </button>
          <button type="submit" form="customer-modal-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting && <span className="loading loading-spinner loading-xs" />}
            {customer ? 'بروزرسانی تغییرات' : 'ثبت مشتری'}
          </button>
        </>
      }
    >
      <form id="customer-modal-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* Type Segments */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-base-content/70 mb-1.5 block">وضعیت مشتری</label>
            <div role="tablist" className="tabs tabs-box w-full">
              <label role="tab" className={cx('tab flex-1 text-xs', customerType === 'potential' && 'tab-active')}>
                <input type="radio" value="potential" className="hidden" {...register('customer_type')} />
                مشتری بالقوه (سرنخ)
              </label>
              <label role="tab" className={cx('tab flex-1 text-xs', customerType === 'effective' && 'tab-active')}>
                <input type="radio" value="effective" className="hidden" {...register('customer_type')} />
                مشتری بالفعل (خریدار)
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-base-content/70 mb-1.5 block">نوع شخص</label>
            <div role="tablist" className="tabs tabs-box w-full">
              <label role="tab" className={cx('tab flex-1 text-xs', type === 'individual' && 'tab-active')}>
                <input type="radio" value="individual" className="hidden" {...register('type')} />
                حقیقی (فرد)
              </label>
              <label role="tab" className={cx('tab flex-1 text-xs', type === 'company' && 'tab-active')}>
                <input type="radio" value="company" className="hidden" {...register('type')} />
                حقوقی (شرکت/کارگاه)
              </label>
            </div>
          </div>
        </div>

        {type === 'company' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-950 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
            برای مشتری حقوقی فقط <b>نام شرکت</b> الزامی است؛ نام و نام‌خانوادگی و شماره همراه اختیاری هستند.
          </div>
        )}

        {/* Company name (required for company, optional for individual) */}
        <Field
          label="نام شرکت / کارگاه"
          required={type === 'company'}
          error={errors.company_name?.message}
          hint={type === 'individual' ? 'در صورت ثبت به نام یک شرکت یا کارگاه، این فیلد را پر کنید.' : undefined}
        >
          <input
            className="input input-bordered w-full"
            {...register('company_name')}
            placeholder="نام ثبتی شرکت یا کارگاه"
          />
        </Field>

        {/* Name Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="نام" required={type === 'individual'} error={errors.first_name?.message}>
            <input
              className="input input-bordered w-full"
              {...register('first_name')}
              placeholder={type === 'company' ? 'نام رابط (اختیاری)' : 'مثال: حمید'}
            />
          </Field>
          <Field label="نام خانوادگی" required={type === 'individual'} error={errors.last_name?.message}>
            <input
              className="input input-bordered w-full"
              {...register('last_name')}
              placeholder={type === 'company' ? 'نام خانوادگی رابط (اختیاری)' : 'مثال: رضایی'}
            />
          </Field>
        </div>

        {/* National Code */}
        <Field
          label={type === 'company' ? 'شناسه ملی شرکت (۱۱ رقم - اختیاری)' : 'کد ملی (۱۰ رقم - اختیاری)'}
          error={errors.national_code?.message}
        >
          <input
            dir="ltr"
            className="input input-bordered w-full text-start font-mono"
            placeholder={type === 'company' ? 'مثال: 10100123456' : 'مثال: 0012345678'}
            {...register('national_code', {
              onChange: (e) => digitOnly(e, type === 'company' ? 11 : 10),
            })}
            onKeyDown={(e) => {
              if (
                e.ctrlKey ||
                e.metaKey ||
                ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)
              ) {
                return
              }
              if (!/^\d$/.test(e.key) && !/^[۰-۹]$/.test(e.key)) {
                e.preventDefault()
              }
            }}
          />
        </Field>

        {/* Contact Numbers — mobile is optional in both person types */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field
            label="شماره همراه (اختیاری)"
            error={errors.mobile?.message}
            hint="در صورت وارد کردن، ۱۱ رقم و با 09 شروع شود."
          >
            <input
              dir="ltr"
              className="input input-bordered w-full text-start"
              placeholder="09123456789"
              {...register('mobile', {
                onChange: (e) => digitOnly(e, 11),
              })}
              onKeyDown={(e) => {
                if (
                  e.ctrlKey ||
                  e.metaKey ||
                  ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)
                ) {
                  return
                }
                if (!/^\d$/.test(e.key) && !/^[۰-۹]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
            />
          </Field>
          <Field label="تلفن ثابت (۸ تا ۱۱ رقم با 0)" error={errors.phone?.message}>
            <input
              dir="ltr"
              className="input input-bordered w-full text-start"
              placeholder="02188776655"
              {...register('phone', {
                onChange: (e) => digitOnly(e, 11),
              })}
              onKeyDown={(e) => {
                if (
                  e.ctrlKey ||
                  e.metaKey ||
                  ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)
                ) {
                  return
                }
                if (!/^\d$/.test(e.key) && !/^[۰-۹]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
            />
          </Field>
          <Field label="ایمیل" error={errors.email?.message}>
            <input
              type="email"
              dir="ltr"
              className="input input-bordered w-full text-start"
              {...register('email')}
              placeholder="name@domain.com"
            />
          </Field>
        </div>

        {/* Location with SearchableSelect catalog */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SearchableSelect
            label="استان"
            placeholder="انتخاب استان..."
            searchPlaceholder="جستجوی استان..."
            value={province || ''}
            options={IRAN_PROVINCES}
            onChange={handleProvinceChange}
          />

          <SearchableSelect
            label="شهر"
            placeholder="انتخاب شهر..."
            searchPlaceholder="جستجوی شهر..."
            value={city || ''}
            options={availableCities}
            onChange={(val) => setValue('city', val)}
            disabled={!province}
          />
        </div>

        <Field label="آدرس پستی">
          <textarea
            rows={2}
            className="textarea textarea-bordered w-full"
            {...register('address')}
            placeholder="آدرس کارخانه یا محل نصب دستگاه‌ها..."
          />
        </Field>

        <Field label="یادداشت و توضیحات">
          <textarea
            rows={2}
            className="textarea textarea-bordered w-full"
            {...register('notes')}
            placeholder="توضیحات تکمیلی یا نیازهای فنی مشتری..."
          />
        </Field>
      </form>
    </Modal>
  )
}
