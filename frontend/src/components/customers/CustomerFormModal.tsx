import { useEffect, useMemo } from 'react'
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

const schema = z
  .object({
    customer_type: z.enum(['potential', 'effective']),
    type: z.enum(['individual', 'company']),
    first_name: z.string().trim(),
    last_name: z.string().trim(),
    company_name: z.string().trim().optional(),
    national_code: z.string().trim().optional(),
    mobile: z
      .string()
      .trim()
      .regex(/^09\d{9}$/, 'شماره همراه باید ۱۱ رقم عددی بوده و با 09 شروع شود (مثال: 09121234567)')
      .or(z.literal('')),
    phone: z
      .string()
      .trim()
      .regex(/^0\d{10}$/, 'شماره تلفن ثابت باید ۱۱ رقم عددی بوده و با 0 شروع شود (مثال: 02188776655)')
      .or(z.literal(''))
      .optional(),
    email: z.string().email('فرمت آدرس ایمیل معتبر نیست').or(z.literal('')).optional(),
    province: z.string().trim().optional(),
    city: z.string().trim().optional(),
    address: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'individual') {
      if (!data.first_name) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['first_name'], message: 'نام الزامی است' })
      if (!data.last_name) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['last_name'], message: 'نام خانوادگی الزامی است' })
    } else if (!data.company_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['company_name'], message: 'نام شرکت الزامی است' })
    }
    if (data.national_code && data.national_code.length > 0) {
      if (data.type === 'individual') {
        if (!/^\d{10}$/.test(data.national_code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['national_code'],
            message: 'کد ملی برای شخص حقیقی باید دقیقاً ۱۰ رقم عددی باشد',
          })
        }
      } else if (data.type === 'company') {
        if (!/^\d{11}$/.test(data.national_code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['national_code'],
            message: 'شناسه ملی برای شخص حقوقی باید دقیقاً ۱۱ رقم عددی باشد',
          })
        }
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
    defaultValues: {
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
    },
  })

  useEffect(() => {
    if (open) {
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
      } else {
        reset({
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
        })
      }
    }
  }, [open, customer, reset])

  const type = watch('type')
  const customerType = watch('customer_type')
  const province = watch('province')
  const city = watch('city')

  // Available cities based on current province
  const availableCities = useMemo(() => {
    return getCitiesByProvince(province)
  }, [province])

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
      if (customer) {
        await customerApi.update(customer.id, values)
        toast.success('مشخصات مشتری بروزرسانی شد.')
      } else {
        await customerApi.create(values)
        toast.success('مشتری جدید با موفقیت ثبت شد.')
      }
      onSuccess()
    } catch (err: any) {
      const msg = err.response?.data?.message || 'خطا در ذخیره اطلاعات مشتری'
      toast.error(msg)
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

        {/* Name Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="نام" required={type === 'individual'} error={errors.first_name?.message}>
            <input className="input input-bordered w-full" {...register('first_name')} placeholder="مثال: حمید" />
          </Field>
          <Field label="نام خانوادگی" required={type === 'individual'} error={errors.last_name?.message}>
            <input className="input input-bordered w-full" {...register('last_name')} placeholder="مثال: رضایی" />
          </Field>
        </div>

        {/* Company & National Code */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {type === 'company' && (
            <Field label="نام شرکت / کارگاه" required error={errors.company_name?.message}>
              <input className="input input-bordered w-full" {...register('company_name')} placeholder="نام ثبتی شرکت" />
            </Field>
          )}
          <Field
            label={type === 'company' ? 'شناسه ملی شرکت (۱۱ رقم)' : 'کد ملی (۱۰ رقم)'}
            error={errors.national_code?.message}
            className={type === 'individual' ? 'sm:col-span-2' : ''}
          >
            <input
              dir="ltr"
              maxLength={type === 'company' ? 11 : 10}
              className="input input-bordered w-full text-start font-mono"
              placeholder={type === 'company' ? 'مثال: 10100123456' : 'مثال: 0012345678'}
              {...register('national_code', {
                setValueAs: (value) => toEnDigits(value).replace(/\D/g, ''),
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
                if (!/^[0-9۰-۹٠-٩]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
            />
          </Field>
        </div>

        {/* Contact Numbers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="شماره همراه (۱۱ رقم با 09)" error={errors.mobile?.message}>
            <input
              dir="ltr"
              maxLength={11}
              className="input input-bordered w-full text-start font-mono"
              placeholder="09123456789"
              {...register('mobile', {
                setValueAs: (value) => toEnDigits(value).replace(/\D/g, ''),
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
                if (!/^[0-9۰-۹٠-٩]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
            />
          </Field>
          <Field label="تلفن ثابت (۱۱ رقم با 0)" error={errors.phone?.message}>
            <input
              dir="ltr"
              maxLength={11}
              className="input input-bordered w-full text-start font-mono"
              placeholder="02188776655"
              {...register('phone', {
                setValueAs: (value) => toEnDigits(value).replace(/\D/g, ''),
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
                if (!/^[0-9۰-۹٠-٩]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
            />
          </Field>
          <Field label="ایمیل" error={errors.email?.message}>
            <input type="email" dir="ltr" className="input input-bordered w-full text-start" {...register('email')} placeholder="name@domain.com" />
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
          <textarea rows={2} className="textarea textarea-bordered w-full" {...register('address')} placeholder="آدرس کارخانه یا محل نصب دستگاه‌ها..." />
        </Field>

        <Field label="یادداشت و توضیحات">
          <textarea rows={2} className="textarea textarea-bordered w-full" {...register('notes')} placeholder="توضیحات تکمیلی یا نیازهای فنی مشتری..." />
        </Field>
      </form>
    </Modal>
  )
}
