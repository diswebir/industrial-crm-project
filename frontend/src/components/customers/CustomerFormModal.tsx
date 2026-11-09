import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { SearchableSelect } from '../ui/SearchableSelect'
import { apiErrorMessage, customerApi } from '../../services/api'
import { IRAN_PROVINCES, getCitiesByProvince } from '../../data/iranLocations'
import { cx, toEnDigits } from '../../utils/format'
import type { Customer } from '../../types'

/**
 * اعتبارسنجی فرم مشتری (تسک ۵)
 *
 * - شخصیت حقوقی: «نام شرکت» الزامی و ستاره‌دار؛ نام و نام خانوادگی اختیاری.
 * - شخصیت حقیقی: نام و نام خانوادگی الزامی.
 * - شماره همراه در هر دو حالت اختیاری است (بدون ستاره).
 */
const optionalName = z
  .string()
  .trim()
  .max(255)
  .refine((v) => v === '' || v.length >= 2, 'حداقل ۲ کاراکتر باشد')
  .optional()
  .or(z.literal(''))

const schema = z
  .object({
    customer_type: z.enum(['potential', 'effective']),
    type: z.enum(['individual', 'company']),
    first_name: optionalName,
    last_name: optionalName,
    company_name: z.string().trim().max(255).optional().or(z.literal('')),
    national_code: z.string().trim().max(20).optional().or(z.literal('')),
    mobile: z.string().trim().max(20).optional().or(z.literal('')),
    phone: z.string().trim().max(20).optional().or(z.literal('')),
    email: z.string().trim().max(255).optional().or(z.literal('')),
    province: z.string().trim().optional().or(z.literal('')),
    city: z.string().trim().optional().or(z.literal('')),
    address: z.string().trim().max(1000).optional().or(z.literal('')),
    notes: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    // ── نام شخص / نام شرکت بر اساس نوع شخصیت
    if (data.type === 'company') {
      if (!data.company_name || data.company_name.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['company_name'],
          message: 'برای شخصیت حقوقی وارد کردن «نام شرکت» الزامی است',
        })
      }
    } else {
      if (!data.first_name || data.first_name.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['first_name'],
          message: 'برای شخصیت حقیقی وارد کردن «نام» الزامی است',
        })
      }
      if (!data.last_name || data.last_name.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['last_name'],
          message: 'برای شخصیت حقیقی وارد کردن «نام خانوادگی» الزامی است',
        })
      }
    }

    // ── شماره همراه: اختیاری، اما اگر وارد شود باید معتبر باشد
    if (data.mobile && data.mobile.trim() !== '' && !/^09\d{9}$/.test(data.mobile)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mobile'],
        message: 'شماره همراه باید ۱۱ رقم و با 09 شروع شود (مثال: 09121234567)',
      })
    }

    if (data.phone && data.phone.trim() !== '' && !/^0\d{9,10}$/.test(data.phone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'شماره تلفن ثابت باید با 0 شروع شود (مثال: 02188776655)',
      })
    }

    if (data.email && data.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'فرمت آدرس ایمیل معتبر نیست',
      })
    }

    // ── کد ملی / شناسه ملی
    if (data.national_code && data.national_code.length > 0) {
      if (data.type === 'individual' && !/^\d{10}$/.test(data.national_code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['national_code'],
          message: 'کد ملی برای شخص حقیقی باید دقیقاً ۱۰ رقم عددی باشد',
        })
      } else if (data.type === 'company' && !/^\d{11}$/.test(data.national_code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['national_code'],
          message: 'شناسه ملی برای شخص حقوقی باید دقیقاً ۱۱ رقم عددی باشد',
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

const EMPTY_FORM: FormValues = {
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
    defaultValues: EMPTY_FORM,
  })

  useEffect(() => {
    if (!open) return

    if (customer) {
      reset({
        customer_type: customer.customer_type ?? 'potential',
        type: customer.type ?? 'individual',
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

    reset(EMPTY_FORM)
  }, [open, customer, reset])

  const type = watch('type')
  const customerType = watch('customer_type')
  const province = watch('province')
  const city = watch('city')

  const isCompany = type === 'company'

  // Available cities based on current province
  const availableCities = useMemo(() => getCitiesByProvince(province), [province])

  const handleProvinceChange = (newProvince: string) => {
    setValue('province', newProvince)
    const cities = getCitiesByProvince(newProvince)
    setValue('city', cities.length > 0 ? cities[0] : '')
  }

  const onSubmit = async (values: FormValues) => {
    const payload = {
      customer_type: values.customer_type,
      type: values.type,
      first_name: values.first_name?.trim() || null,
      last_name: values.last_name?.trim() || null,
      company_name: values.company_name?.trim() || null,
      national_code: values.national_code?.trim() || null,
      mobile: values.mobile?.trim() || null,
      phone: values.phone?.trim() || null,
      email: values.email?.trim() || null,
      province: values.province?.trim() || null,
      city: values.city?.trim() || null,
      address: values.address?.trim() || null,
      notes: values.notes?.trim() || null,
    }

    try {
      if (customer) {
        const res = await customerApi.update(customer.id, payload)
        toast.success(res.message || 'مشخصات مشتری بروزرسانی شد.')
      } else {
        const res = await customerApi.create(payload)
        toast.success(res.message || 'مشتری جدید با موفقیت ثبت شد.')
      }
      onSuccess()
    } catch (err: any) {
      const data = err?.response?.data
      const field =
        data?.errors?.first_name?.[0] ||
        data?.errors?.last_name?.[0] ||
        data?.errors?.company_name?.[0] ||
        data?.errors?.mobile?.[0] ||
        data?.errors?.national_code?.[0] ||
        data?.errors?.email?.[0]
      toast.error(field || apiErrorMessage(err, 'خطا در ذخیره اطلاعات مشتری'))
    }
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-base-content/70">وضعیت مشتری</label>
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
            <label className="mb-1.5 block text-xs font-bold text-base-content/70">نوع شخصیت</label>
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

        {/* راهنمای فیلدهای الزامی بر اساس نوع شخصیت (تسک ۵) */}
        <div className="rounded-xl border border-base-300 bg-base-200/60 px-3.5 py-2.5 text-[11px] leading-relaxed text-base-content/70">
          {isCompany ? (
            <>
              برای <span className="font-bold">شخصیت حقوقی</span> فقط «نام شرکت / کارگاه» الزامی است؛ نام و نام
              خانوادگی شخص رابط و شماره همراه اختیاری هستند.
            </>
          ) : (
            <>
              برای <span className="font-bold">شخصیت حقیقی</span> «نام» و «نام خانوادگی» الزامی است؛ شماره همراه
              اختیاری است.
            </>
          )}
        </div>

        {/* Company name — فقط برای حقوقی و الزامی */}
        {isCompany && (
          <Field label="نام شرکت / کارگاه" required error={errors.company_name?.message}>
            <input
              className={cx('input input-bordered w-full', errors.company_name && 'input-error')}
              {...register('company_name')}
              placeholder="مثال: شرکت فولاد فرایند اصفهان"
            />
          </Field>
        )}

        {/* Name Fields — برای حقوقی اختیاری (بدون ستاره) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="نام"
            required={!isCompany}
            error={errors.first_name?.message}
            hint={isCompany ? 'اختیاری — نام شخص رابط در شرکت' : undefined}
          >
            <input
              className={cx('input input-bordered w-full', errors.first_name && 'input-error')}
              {...register('first_name')}
              placeholder="مثال: حمید"
            />
          </Field>
          <Field
            label="نام خانوادگی"
            required={!isCompany}
            error={errors.last_name?.message}
            hint={isCompany ? 'اختیاری — نام خانوادگی شخص رابط' : undefined}
          >
            <input
              className={cx('input input-bordered w-full', errors.last_name && 'input-error')}
              {...register('last_name')}
              placeholder="مثال: رضایی"
            />
          </Field>
        </div>

        {/* National code */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={isCompany ? 'شناسه ملی شرکت (۱۱ رقم)' : 'کد ملی (۱۰ رقم)'}
            error={errors.national_code?.message}
            hint="اختیاری — برای جستجو و جلوگیری از ثبت تکراری استفاده می‌شود."
            className={isCompany ? '' : 'sm:col-span-2'}
          >
            <input
              dir="ltr"
              maxLength={isCompany ? 11 : 10}
              className={cx(
                'input input-bordered w-full text-start font-mono',
                errors.national_code && 'input-error',
              )}
              placeholder={isCompany ? 'مثال: 10100123456' : 'مثال: 0012345678'}
              {...register('national_code', {
                onChange: (e) => {
                  e.target.value = toEnDigits(e.target.value).replace(/\D/g, '')
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
                if (!/^[\d۰-۹٠-٩]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
            />
          </Field>

          {isCompany && (
            <Field label="ایمیل سازمانی" error={errors.email?.message} hint="اختیاری">
              <input
                type="email"
                dir="ltr"
                className={cx('input input-bordered w-full text-start', errors.email && 'input-error')}
                {...register('email')}
                placeholder="info@company.ir"
              />
            </Field>
          )}
        </div>

        {/* Contact Numbers — شماره همراه اختیاری است (تسک ۵) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="شماره همراه (۱۱ رقم با 09)"
            error={errors.mobile?.message}
            hint="اختیاری — برای ارسال پیامک به این مشتری لازم است."
          >
            <input
              dir="ltr"
              maxLength={11}
              className={cx('input input-bordered w-full text-start font-mono', errors.mobile && 'input-error')}
              placeholder="09123456789"
              {...register('mobile', {
                onChange: (e) => {
                  e.target.value = toEnDigits(e.target.value).replace(/\D/g, '')
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
                if (!/^[\d۰-۹٠-٩]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
            />
          </Field>

          <Field label="تلفن ثابت (با 0)" error={errors.phone?.message} hint="اختیاری">
            <input
              dir="ltr"
              maxLength={11}
              className={cx('input input-bordered w-full text-start font-mono', errors.phone && 'input-error')}
              placeholder="02188776655"
              {...register('phone', {
                onChange: (e) => {
                  e.target.value = toEnDigits(e.target.value).replace(/\D/g, '')
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
                if (!/^[\d۰-۹٠-٩]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
            />
          </Field>

          {!isCompany && (
            <Field label="ایمیل" error={errors.email?.message} hint="اختیاری">
              <input
                type="email"
                dir="ltr"
                className={cx('input input-bordered w-full text-start', errors.email && 'input-error')}
                {...register('email')}
                placeholder="name@domain.com"
              />
            </Field>
          )}
        </div>

        {/* Location with SearchableSelect catalog */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <Field label="آدرس پستی" error={errors.address?.message} hint="اختیاری">
          <textarea
            rows={2}
            className="textarea textarea-bordered w-full"
            {...register('address')}
            placeholder="آدرس کارخانه یا محل نصب دستگاه‌ها..."
          />
        </Field>

        <Field label="یادداشت و توضیحات" error={errors.notes?.message} hint="اختیاری">
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
