import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  ChevronDown,
  Cpu,
  ExternalLink,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react'
import { MAIN_NAV, SETTINGS_NAV } from './nav'
import { useAuthStore } from '../store/useAuthStore'
import { Avatar } from '../components/ui/Avatar'
import { settingsApi } from '../services/api'
import { cx } from '../utils/format'

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { data: companySettings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: settingsApi.getCompanySettings,
    staleTime: 5 * 60 * 1000,
  })

  const companyName = companySettings?.company_name || 'سی‌آر‌ام قطعات'
  const logoUrl = companySettings?.company_logo_url

  return (
    <div className="flex items-center gap-3 min-w-0">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={companyName}
          className={cx(
            'rounded-2xl object-cover border border-base-200 shadow-sm shrink-0',
            size === 'lg' ? 'size-13' : 'size-10',
          )}
        />
      ) : (
        <span
          className={cx(
            'flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 font-black text-white shadow-lg shadow-blue-500/25',
            size === 'lg' ? 'size-13 text-2xl' : 'size-10 text-xl',
          )}
        >
          <Cpu className={cx(size === 'lg' ? 'size-8 text-white' : 'size-6 text-white')} />
        </span>
      )}
      <div className="leading-tight min-w-0 flex-1">
        <p className={cx('font-extrabold tracking-tight truncate', size === 'lg' ? 'text-xl' : 'text-base')}>
          {companyName}
        </p>
        <p className="text-[11px] text-base-content/50 truncate">مدیریت مشتریان و خدمات</p>
      </div>
    </div>
  )
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const location = useLocation()

  // By default closed as requested in requirement 7
  const [settingsOpen, setSettingsOpen] = useState(false)

  const isSettingsActive = location.pathname.startsWith('/settings')

  const isAdministrator = useAuthStore((s) => s.isAdministrator)()

  const visibleSettingsItems = SETTINGS_NAV.filter(
    (item) => !item.permission || hasPermission(item.permission),
  ).map((item) => {
    if (item.to === '/settings/system' && !isAdministrator) {
      return { ...item, label: 'تنظیمات پوسته نمایشی' }
    }
    return item
  })

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cx(
          'fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-base-300/60 bg-base-100 transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-label="منوی اصلی"
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5 border-b border-base-200">
          <Logo />
          <button className="btn btn-ghost btn-sm btn-circle lg:hidden" onClick={onClose} aria-label="بستن منو">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {/* Main Navigation Groups */}
          {MAIN_NAV.map((group) => {
            const visibleItems = group.items.filter((item) => !item.permission || hasPermission(item.permission))
            if (!visibleItems.length) return null

            return (
              <div key={group.title}>
                <p className="mb-1.5 px-3 text-[11px] font-bold tracking-wide text-base-content/40 uppercase">{group.title}</p>
                <ul className="space-y-1">
                  {visibleItems.map(({ to, label, icon: Icon, end }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={end}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cx(
                            'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
                            isActive
                              ? 'bg-primary text-primary-content shadow-md shadow-primary/20'
                              : 'text-base-content/70 hover:bg-base-200 hover:text-base-content',
                          )
                        }
                      >
                        <Icon className="size-5 shrink-0" />
                        <span className="flex-1">{label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {/* Settings Collapsible Accordion (Only visible if user has at least one settings item permitted) */}
          {visibleSettingsItems.length > 0 && (
            <div>
              <p className="mb-1.5 px-3 text-[11px] font-bold tracking-wide text-base-content/40 uppercase">پیکربندی سیستم</p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setSettingsOpen((prev) => !prev)}
                  className={cx(
                    'group flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all cursor-pointer',
                    isSettingsActive
                      ? 'bg-base-200 text-primary font-bold'
                      : 'text-base-content/70 hover:bg-base-200 hover:text-base-content',
                  )}
                  aria-expanded={settingsOpen}
                >
                  <div className="flex items-center gap-3">
                    <Settings className={cx('size-5 shrink-0 transition-transform duration-300', settingsOpen && 'rotate-45')} />
                    <span>تنظیمات سیستم</span>
                  </div>
                  <ChevronDown
                    className={cx(
                      'size-4 text-base-content/50 transition-transform duration-200',
                      settingsOpen && 'rotate-180',
                    )}
                  />
                </button>

                {/* Accordion Sub-items */}
                {settingsOpen && (
                  <ul className="ms-4 space-y-1 border-r-2 border-primary/30 pe-1 pt-1 animate-in fade-in duration-150">
                    {visibleSettingsItems.map(({ to, label, icon: Icon, end }) => (
                      <li key={to}>
                        <NavLink
                          to={to}
                          end={end}
                          onClick={onClose}
                          className={({ isActive }) =>
                            cx(
                              'group flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
                              isActive
                                ? 'bg-primary text-primary-content shadow-xs'
                                : 'text-base-content/70 hover:bg-base-200 hover:text-base-content',
                            )
                          }
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="flex-1 truncate">{label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </nav>

        {/* Current User Card */}
        {user && (
          <div className="p-3 border-t border-base-200">
            <NavLink
              to="/settings/profile"
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl bg-base-200/50 p-2.5 hover:bg-base-200 transition-colors"
              title="مشاهده پروفایل من"
            >
              <Avatar name={user.name} src={user.avatar_url} size="sm" presence="online" />
              <div className="flex-1 min-w-0 text-start">
                <p className="font-bold text-xs text-base-content truncate">{user.name}</p>
                <p className="text-[10px] text-base-content/50 truncate font-mono">{user.email}</p>
              </div>
            </NavLink>
          </div>
        )}

        {/* External Links with solid high-contrast styling */}
        {/* <div className="p-3 border-t border-base-200 space-y-2">
          <a
            href="/admin"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <ShieldCheck className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="font-bold">پنل ادمین Filament</p>
              <p className="text-[10px] text-amber-800/70 dark:text-amber-300/70">مدیریت مستقیم دیتابیس</p>
            </div>
            <ExternalLink className="size-3.5 opacity-60" />
          </a>

          <a
            href="/docs/api"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-900 hover:bg-blue-100 transition-colors dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300"
          >
            <BookOpen className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="flex-1">
              <p className="font-bold">مستندات API (Scramble)</p>
              <p className="text-[10px] text-blue-800/70 dark:text-blue-300/70">مشاهده و تست اندپوئینت‌ها</p>
            </div>
            <ExternalLink className="size-3.5 opacity-60" />
          </a>
        </div> */}
      </aside>
    </>
  )
}
