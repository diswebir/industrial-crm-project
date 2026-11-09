import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MessageSquare, Save, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Field } from '../../components/ui/Field'
import AccessDenied from '../AccessDenied'
import { settingsApi } from '../../services/api'
import { useAuthStore } from '../../store/useAuthStore'

export default function SmsSettingsPage() {
  const qc = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const { data: smsSettings, isLoading } = useQuery({
    queryKey: ['settings-sms'],
    queryFn: settingsApi.getSmsSettings,
    enabled: hasPermission('settings.manage'),
  })

  const [smsForm, setSmsForm] = useState({
    username: '',
    password: '',
    from: '',
    sandbox: false,
  })

  useEffect(() => {
    if (smsSettings) {
      setSmsForm({
        username: smsSettings.melipayamak_username || '',
        password: '',
        from: smsSettings.melipayamak_from || '',
        sandbox: smsSettings.melipayamak_sandbox ?? false,
      })
    }
  }, [smsSettings])

  const saveSmsMutation = useMutation({
    mutationFn: (body: any) => settingsApi.updateSmsSettings(body),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['settings-sms'] })
      qc.invalidateQueries({ queryKey: ['sms-settings'] })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'خطا در ذخیره تنظیمات ملی‌پیامک')
    },
  })

  const handleSaveSms = (e: React.FormEvent) => {
    e.preventDefault()
    saveSmsMutation.mutate({
      melipayamak_username: smsForm.username,
      melipayamak_password: smsForm.password || undefined,
      melipayamak_from: smsForm.from,
      melipayamak_sandbox: smsForm.sandbox,
    })
  }

  if (!hasPermission('settings.manage')) {
    return <AccessDenied requiredPermission="settings.manage" />
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="تنظیمات سامانه ملی‌پیامک"
        subtitle="پیکربندی اطلاعات اتصال و مشخصات درگاه ملی‌پیامک (نام کاربری، کلمه عبور و شماره اختصاصی خط)"
      />

      <div className="card-surface p-6 sm:p-8">
        <div className="flex items-center gap-3 pb-5 border-b border-base-200">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
            <MessageSquare className="size-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-base-content">اطلاعات احراز هویت درگاه</h3>
            <p className="text-xs text-base-content/60">این مشخصات برای ارتباط مستقیم با وب‌سرویس صابونی و REST ملی‌پیامک استفاده می‌شود.</p>
          </div>
        </div>

        <form onSubmit={handleSaveSms} className="space-y-5 mt-6 max-w-xl">
          <Field label="نام کاربری پنل ملی‌پیامک (Username)" required>
            <input
              dir="ltr"
              className="input input-bordered w-full text-start font-mono text-sm"
              value={smsForm.username}
              onChange={(e) => setSmsForm({ ...smsForm, username: e.target.value })}
              placeholder="مثال: 09121234567"
              required
            />
          </Field>

          <Field
            label={
              smsSettings?.melipayamak_has_password
                ? 'کلمه عبور (برای تغییر رمز، مقدار جدید را وارد کنید)'
                : 'کلمه عبور پنل ملی‌پیامک (Password)'
            }
          >
            <input
              type="password"
              dir="ltr"
              className="input input-bordered w-full text-start font-mono text-sm"
              value={smsForm.password}
              onChange={(e) => setSmsForm({ ...smsForm, password: e.target.value })}
              placeholder={smsSettings?.melipayamak_has_password ? '••••••••' : 'رمز عبور پنل پیامک'}
            />
          </Field>

          <Field label="شماره خط پیش‌فرض ارسال‌کننده (اختیاری)">
            <input
              dir="ltr"
              className="input input-bordered w-full text-start font-mono text-sm"
              value={smsForm.from}
              onChange={(e) => setSmsForm({ ...smsForm, from: e.target.value })}
              placeholder="مثال: 5000..."
            />
          </Field>

          {/* Sandbox Toggle */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="pe-4">
                <p className="font-bold text-xs text-base-content">حالت شبیه‌ساز آزمایشی (Sandbox)</p>
                <p className="text-[11px] text-base-content/60 mt-1 leading-relaxed">
                  هنگامی که این گزینه فعال باشد، پیامک‌ها در لاگ سیستم ثبت می‌شوند اما به درگاه واقعی ارسال نمی‌گردند (مناسب محیط توسعه و تست).
                </p>
              </div>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm shrink-0"
                checked={smsForm.sandbox}
                onChange={(e) => setSmsForm({ ...smsForm, sandbox: e.target.checked })}
              />
            </label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="btn btn-primary gap-2"
              disabled={saveSmsMutation.isPending || isLoading}
            >
              {saveSmsMutation.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Save className="size-4" />
              )}
              ذخیره تنظیمات ملی‌پیامک
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
