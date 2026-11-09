import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Building2, Check, Moon, Palette, Save, Sun } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { FilePondLogo } from '../../components/ui/FilePondLogo'
import { useThemeStore, type ThemeColor } from '../../store/useThemeStore'
import { useAuthStore } from '../../store/useAuthStore'
import { settingsApi } from '../../services/api'
import { cx } from '../../utils/format'

interface ColorOption {
  id: ThemeColor
  name: string
  description: string
  dotClass: string
  previewClass: string
}

const COLOR_OPTIONS: ColorOption[] = [
  {
    id: 'default',
    name: 'رنگ پیش‌فرض (نیلی / ایندیگو)',
    description: 'تم رنگی استاندارد و صنعتی سامانه',
    dotClass: 'bg-indigo-600',
    previewClass: 'from-indigo-600 to-violet-600',
  },
  {
    id: 'blue',
    name: 'آبی اقیانوسی (Ocean Blue)',
    description: 'تم آبی پررنگ مناسب محیط‌های شرکتی',
    dotClass: 'bg-blue-600',
    previewClass: 'from-blue-600 to-cyan-600',
  },
  {
    id: 'green',
    name: 'سبز زمردی (Emerald Green)',
    description: 'تم آرامش‌بخش و پرانرژی سبز',
    dotClass: 'bg-emerald-600',
    previewClass: 'from-emerald-600 to-teal-600',
  },
  {
    id: 'red',
    name: 'قرمز یاقوتی (Ruby Red)',
    description: 'تم گرم، پویا و با کنتراست بالا',
    dotClass: 'bg-rose-600',
    previewClass: 'from-rose-600 to-red-600',
  },
]

export default function SystemSettingsPage() {
  const { theme, setTheme, color, setColor } = useThemeStore()
  const isAdministrator = useAuthStore((s) => s.isAdministrator)()
  const qc = useQueryClient()

  const [companyName, setCompanyName] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)

  // Fetch company settings (admin only)
  const { data: companySettings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: settingsApi.getCompanySettings,
    enabled: isAdministrator,
  })

  useEffect(() => {
    if (companySettings) {
      setCompanyName(companySettings.company_name || '')
    }
  }, [companySettings])

  // Save company settings mutation
  const saveCompanyMutation = useMutation({
    mutationFn: (formData: FormData) => settingsApi.updateCompanySettings(formData),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['company-settings'] })
      setLogoFile(null)
      setRemoveLogo(false)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'خطا در ذخیره تنظیمات شرکت')
    },
  })

  const handleSaveCompany = () => {
    const fd = new FormData()
    fd.append('company_name', companyName.trim())
    if (logoFile) {
      fd.append('company_logo', logoFile)
    }
    if (removeLogo) {
      fd.append('remove_logo', '1')
    }
    saveCompanyMutation.mutate(fd)
  }

  const currentLogoUrl = removeLogo ? null : companySettings?.company_logo_url

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title={isAdministrator ? 'تنظیمات سیستم، برندینگ و ظاهر' : 'تنظیمات پوسته نمایشی'}
        subtitle={
          isAdministrator
            ? 'مدیریت مشخصات شرکت، پالت رنگی اصلی و حالت روز/شب (Light/Dark) سامانه'
            : 'شخصی‌سازی حالت روز یا شب (Light/Dark) سامانه متناسب با نور محیط کار'
        }
      />

      {/* Company Branding - Admins Only */}
      {isAdministrator && (
        <div className="card-surface p-6 sm:p-8 space-y-5">
          <div>
            <h3 className="text-base font-bold text-base-content flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              مشخصات شرکت و برندینگ
            </h3>
            <p className="text-xs text-base-content/60 mt-1">
              نام شرکت و لوگو در نوار کناری سامانه نمایش داده می‌شوند.
            </p>
          </div>

          <div className="space-y-5">
            {/* Company Name */}
            <div>
              <label className="block text-xs font-bold text-base-content mb-1.5">
                نام شرکت یا سازمان
              </label>
              <input
                type="text"
                className="input input-bordered w-full text-sm"
                placeholder="نام شرکت یا سازمان"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            {/* Company Logo using FilePond */}
            <FilePondLogo
              label="لوگوی رسمی شرکت (جهت نمایش در نوار کناری)"
              currentLogoUrl={currentLogoUrl}
              onFileChange={(file) => {
                setLogoFile(file)
                if (file) setRemoveLogo(false)
              }}
              onRemoveCurrentLogo={() => {
                // حذف واقعی هنگام «ذخیره مشخصات شرکت» انجام می‌شود؛ قبلاً همان لحظه
                // حذف می‌شد و سپس دوباره با ذخیره، درخواست تکراری ارسال می‌کرد.
                setRemoveLogo(true)
                setLogoFile(null)
              }}
              disabled={saveCompanyMutation.isPending}
            />

            {/* Save button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveCompany}
                disabled={saveCompanyMutation.isPending}
                className="btn btn-primary gap-2"
              >
                {saveCompanyMutation.isPending ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Save className="size-4" />
                )}
                ذخیره مشخصات شرکت
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dark / Light Mode Selection */}
      <div className="card-surface p-6 sm:p-8 space-y-5">
        <div>
          <h3 className="text-base font-bold text-base-content flex items-center gap-2">
            <Sun className="size-4 text-amber-500" />
            حالت نمایشی (پوسته تاریک یا روشن)
          </h3>
          <p className="text-xs text-base-content/60 mt-1">
            پوسته دیداری مورد نظر خود را متناسب با نور محیط کار انتخاب نمایید.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <button
            type="button"
            onClick={() => setTheme('nikan-light')}
            className={cx(
              'flex items-center gap-4 rounded-2xl border-2 p-5 text-start transition-all cursor-pointer',
              theme === 'nikan-light'
                ? 'border-primary bg-primary/5 text-primary shadow-xs'
                : 'border-base-200 hover:border-base-300 bg-base-100',
            )}
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 dark:bg-amber-950/40 dark:border-amber-800">
              <Sun className="size-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm text-base-content">حالت روشن (روز)</p>
                {theme === 'nikan-light' && <Check className="size-4 text-primary" />}
              </div>
              <p className="text-xs text-base-content/60 mt-1">پس‌زمینه سفید با کنتراست بالا</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme('nikan-dark')}
            className={cx(
              'flex items-center gap-4 rounded-2xl border-2 p-5 text-start transition-all cursor-pointer',
              theme === 'nikan-dark'
                ? 'border-primary bg-primary/5 text-primary shadow-xs'
                : 'border-base-200 hover:border-base-300 bg-base-100',
            )}
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-500 dark:bg-indigo-950/40 dark:border-indigo-800">
              <Moon className="size-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm text-base-content">حالت تاریک (شب)</p>
                {theme === 'nikan-dark' && <Check className="size-4 text-primary" />}
              </div>
              <p className="text-xs text-base-content/60 mt-1">کاهش خستگی چشم در محیط‌های کم‌نور</p>
            </div>
          </button>
        </div>
      </div>

      {/* Theme Color Selection - Admins Only */}
      {isAdministrator && (
        <div className="card-surface p-6 sm:p-8 space-y-5">
          <div>
            <h3 className="text-base font-bold text-base-content flex items-center gap-2">
              <Palette className="size-4 text-primary" />
              انتخاب پالت رنگی اصلی (تم رنگی)
            </h3>
            <p className="text-xs text-base-content/60 mt-1">
              رنگ اصلی اجزای سامانه (دکمه‌ها، آیکون‌ها، تگ‌ها و عناصر تعاملی) را سفارشی‌سازی کنید.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {COLOR_OPTIONS.map((opt) => {
              const isSelected = color === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setColor(opt.id)}
                  className={cx(
                    'flex items-center gap-4 rounded-2xl border-2 p-4 text-start transition-all cursor-pointer',
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'border-base-200 hover:border-base-300 bg-base-100',
                  )}
                >
                  <div
                    className={cx(
                      'flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr text-white shadow-xs',
                      opt.previewClass,
                    )}
                  >
                    <span className="size-3.5 rounded-full bg-white/90" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-xs text-base-content">{opt.name}</p>
                      {isSelected && <Check className="size-4 text-primary" />}
                    </div>
                    <p className="text-[11px] text-base-content/60 mt-0.5 truncate">{opt.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
