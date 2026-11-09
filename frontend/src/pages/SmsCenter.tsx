import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  MessageSquare,
  Plus,
  Radio,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Field, TableSkeleton, EmptyState } from '../components/ui/Field'
import { Can } from '../components/common/Can'
import AccessDenied from './AccessDenied'
import { smsApi, settingsApi } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'
import { cx, dateShort, dateTimeFa, num, relativeFa } from '../utils/format'

const schema = z.object({
  mobile: z.string().regex(/^09\d{9}$/, 'شماره موبایل معتبر نیست (مثال: 09121234567)'),
  pattern_code: z.string().trim().min(1, 'کد الگوی ملی‌پیامک را وارد کنید'),
  customer_id: z.string().optional(),
})

type SmsFormValues = z.infer<typeof schema>

export default function SmsCenter() {
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const canSend = hasPermission('sms.send')
  const canViewLogs = hasPermission('sms.logs')
  const canViewSettings = hasPermission('settings.manage')

  // Dynamic tokens for pattern
  const [tokens, setTokens] = useState<Array<{ key: string; value: string }>>([
    { key: '0', value: '' },
    { key: '1', value: '' },
  ])

  const initialMobile = params.get('mobile') ?? ''
  const initialCustomerId = params.get('customer_id') ?? ''

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SmsFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      mobile: initialMobile,
      pattern_code: '',
      customer_id: initialCustomerId,
    },
  })

  useEffect(() => {
    if (initialMobile) setValue('mobile', initialMobile)
    if (initialCustomerId) setValue('customer_id', initialCustomerId)
  }, [initialMobile, initialCustomerId, setValue])

  // Get SMS settings to show Sandbox status
  const { data: smsSettings } = useQuery({
    queryKey: ['sms-settings'],
    queryFn: settingsApi.getSmsSettings,
    enabled: canViewSettings,
  })

  // Get SMS logs (درخواست فقط با مجوز sms.logs ارسال می‌شود؛ قبلاً برای همه ۴۰۳ می‌گرفت)
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['sms-logs'],
    queryFn: () => smsApi.getLogs(),
    enabled: canViewLogs,
  })

  const addTokenRow = () => {
    setTokens((prev) => {
      // کلید بعدی باید یکتا باشد؛ پس از حذف یک ردیف، prev.length ممکن است
      // کلید تکراری بسازد و مقدار توکن قبلی را بازنویسی کند.
      let next = 0
      while (prev.some((t) => t.key === String(next))) next += 1
      return [...prev, { key: String(next), value: '' }]
    })
  }

  const removeTokenRow = (index: number) => {
    setTokens((prev) => prev.filter((_, i) => i !== index))
  }

  const updateToken = (index: number, field: 'key' | 'value', val: string) => {
    setTokens((prev) => {
      const next = [...prev]
      next[index][field] = val
      return next
    })
  }

  const onSubmit = async (values: SmsFormValues) => {
    // Build tokens object
    const tokenPayload: Record<string, string> = {}
    const usedKeys = new Set<string>()

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]
      if (!token.value.trim()) continue
      const key = token.key || String(i)

      if (usedKeys.has(key)) {
        toast.error(`کلید متغیر «${key}» تکراری است؛ برای هر متغیر یک شماره یکتا وارد کنید.`)
        return
      }

      usedKeys.add(key)
      tokenPayload[key] = token.value.trim()
    }

    try {
      const res = await smsApi.sendPattern({
        mobile: values.mobile,
        pattern_code: values.pattern_code,
        tokens: tokenPayload,
        customer_id: values.customer_id || undefined,
      })

      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['sms-logs'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setValue('pattern_code', '')
      setTokens([
        { key: '0', value: '' },
        { key: '1', value: '' },
      ])
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'خطا در ارسال پیامک')
    }
  }

  const logs = logsData?.data ?? []

  if (!canSend && !canViewLogs) {
    return <AccessDenied requiredPermission="sms.send یا sms.logs" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="سامانه پیامک خدماتی (ملی‌پیامک)"
        subtitle="ارسال پیامک‌های سریع بر اساس کدهای الگوی ملی‌پیامک (بدون مسدودی بلک‌لیست) و مشاهده لاگ‌ها"
      />

      {/* Sandbox Notice Banner */}
      {smsSettings?.melipayamak_sandbox && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 flex items-start gap-3 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <Radio className="size-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">حالت شبیه‌ساز (Sandbox) فعال است</span>
              <span className="badge badge-warning badge-xs">آزمایشی</span>
            </div>
            <p className="opacity-80 leading-relaxed">
              پیامک‌ها به صورت شبیه‌سازی‌شده در لاگ سیستم ذخیره می‌شوند و اعتباری از پنل ملی‌پیامک شما کسر نخواهد شد.
              جهت ارسال واقعی، در بخش تنظیمات اطلاعات کاربری ملی‌پیامک را ثبت نموده و حالت سندباکس را غیرفعال کنید.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Send Pattern SMS Form Card */}
        {canSend && (
        <div className={cx('rounded-2xl border border-base-200 bg-base-100 p-5 shadow-xs space-y-4', canViewLogs ? 'lg:col-span-5' : 'lg:col-span-12')}>
          <div className="pb-3 border-b border-base-200">
            <h3 className="font-bold text-base text-base-content flex items-center gap-2">
              <Send className="size-4 text-primary" /> ارسال پیامک با الگو
            </h3>
            <p className="text-xs text-base-content/60 mt-0.5">
              متغیرهای الگو را تکمیل کنید تا مستقیماً به شماره همراه ارسال شود.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <Field label="شماره موبایل گیرنده" required error={errors.mobile?.message}>
              <input
                dir="ltr"
                className="input input-bordered w-full text-start font-mono"
                placeholder="09121234567"
                {...register('mobile')}
              />
            </Field>

            <Field label="کد الگو (شناسه متن / BodyId در ملی‌پیامک)" required error={errors.pattern_code?.message}>
              <input
                dir="ltr"
                className="input input-bordered w-full text-start font-mono"
                placeholder="مثال: 123456"
                {...register('pattern_code')}
              />
            </Field>

            {/* Dynamic Pattern Tokens */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-base-content/70">متغیرهای الگو (Tokens)</label>
                <button
                  type="button"
                  onClick={addTokenRow}
                  className="btn btn-ghost btn-xs text-primary gap-1"
                >
                  <Plus className="size-3" /> افزودن متغیر
                </button>
              </div>

              <div className="space-y-2">
                {tokens.map((token, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      className="input input-bordered input-sm w-20 text-center font-mono text-xs"
                      placeholder={`0`}
                      value={token.key}
                      onChange={(e) => updateToken(index, 'key', e.target.value)}
                    />
                    <input
                      className="input input-bordered input-sm flex-1 text-xs"
                      placeholder={`مقدار متغیر شماره ${index + 1}`}
                      value={token.value}
                      onChange={(e) => updateToken(index, 'value', e.target.value)}
                    />
                    {tokens.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTokenRow(index)}
                        className="btn btn-ghost btn-xs btn-square text-error"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-base-content/50">
                در ملی‌پیامک، متغیرها به ترتیب با علامت سمی‌کالن (;) جدا می‌شوند.
              </p>
            </div>

            <Can permission="sms.send">
              <button type="submit" className="btn btn-primary w-full gap-2 mt-4" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Send className="size-4" />
                )}
                ارسال پیامک خدماتی
              </button>
            </Can>
          </form>
        </div>
        )}

        {/* SMS Logs Table Card */}
        {canViewLogs && (
        <div className={cx('rounded-2xl border border-base-200 bg-base-100 p-5 shadow-xs space-y-4', canSend ? 'lg:col-span-7' : 'lg:col-span-12')}>
          <div className="flex items-center justify-between pb-3 border-b border-base-200">
            <div>
              <h3 className="font-bold text-base text-base-content flex items-center gap-2">
                <MessageSquare className="size-4 text-emerald-600" /> لاگ و سوابق پیامک‌های ارسالی
              </h3>
              <p className="text-xs text-base-content/60 mt-0.5">
                وضعیت تحویل و کدهای پیگیری ارسال‌های ملی‌پیامک
              </p>
            </div>
            <span className="badge badge-sm bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 text-xs">{num(logsData?.total ?? logs.length)} رکورد</span>
          </div>

          {logsLoading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : !logs.length ? (
            <EmptyState
              title="پیامکی ارسال نشده است"
              subtitle="از فرم روبه‌رو برای ارسال اولین پیامک آزمایشی با الگو استفاده کنید."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm table-hover">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs font-bold text-base-content/75 border-b border-base-200">
                    <th>شماره گیرنده</th>
                    <th>کد الگو</th>
                    <th>وضعیت</th>
                    <th>شناسه پیامک</th>
                    <th>زمان ارسال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-200/80">
                  {logs.map((log) => (
                    <tr key={log.id} className="transition-colors hover:bg-base-200/50">
                      <td>
                        <span className="font-mono font-bold text-xs ltr-text text-start block">{log.recipient_mobile}</span>
                        {log.customer && (
                          <span className="text-[10px] text-base-content/50 block">
                            {log.customer.first_name} {log.customer.last_name}
                          </span>
                        )}
                      </td>

                      <td>
                        <span className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {log.pattern_code}
                        </span>
                      </td>

                      <td>
                        <span
                          className={cx(
                            'badge badge-xs font-bold gap-1',
                            log.status === 'sent'
                              ? 'badge-success badge-soft'
                              : log.status === 'pending'
                              ? 'badge-warning badge-soft'
                              : 'badge-error badge-soft',
                          )}
                        >
                          {log.status === 'sent' ? (
                            <>
                              <CheckCircle2 className="size-3" /> موفق
                            </>
                          ) : log.status === 'pending' ? (
                            <>
                              <Clock className="size-3" /> در صف
                            </>
                          ) : (
                            <>
                              <XCircle className="size-3" /> خطا
                            </>
                          )}
                        </span>
                        {log.error_message && (
                          <span className="text-[10px] text-error block truncate max-w-[140px]" title={log.error_message}>
                            {log.error_message}
                          </span>
                        )}
                      </td>

                      <td className="font-mono text-xs text-base-content/60">
                        {log.provider_message_id || '—'}
                      </td>

                      <td className="text-xs text-base-content/70">
                        <span className="block font-medium">{dateTimeFa(log.created_at)}</span>
                        <span className="text-[10px] text-base-content/40 block">{relativeFa(log.created_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
