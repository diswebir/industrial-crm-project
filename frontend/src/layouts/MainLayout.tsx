import { Suspense, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut, Menu, MessageSquare, Moon, Palette, ShieldCheck, Sun, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { Sidebar } from './Sidebar'
import { GlobalSearch } from './GlobalSearch'
import { NotificationsMenu } from './NotificationsMenu'
import { RealtimeClock } from '../components/ui/RealtimeClock'
import { Avatar } from '../components/ui/Avatar'
import { PageSkeleton } from '../components/ui/Field'
import { useAuthStore } from '../store/useAuthStore'
import { useThemeStore } from '../store/useThemeStore'
import { roleLabel } from '../utils/meta'

const closeDropdown = () => (document.activeElement as HTMLElement | null)?.blur()

/** Redirects to /login when there is no session, waits for initial auth verification. */
export function ProtectedRoute() {
  const user = useAuthStore((s) => s.user)
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const location = useLocation()

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <MainLayout />
}

function ThemeToggle() {
  const { theme, toggle } = useThemeStore()
  const dark = theme === 'nikan-dark'
  return (
    <button className="btn btn-ghost btn-circle" onClick={toggle} aria-label={dark ? 'حالت روشن' : 'حالت تاریک'} title={dark ? 'حالت روشن' : 'حالت تاریک'}>
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  )
}

function UserMenu() {
  const user = useAuthStore((s) => s.user)!
  const logout = useAuthStore((s) => s.logout)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const nav = useNavigate()

  return (
    <div className="dropdown dropdown-end shrink-0">
      <div
        tabIndex={0}
        role="button"
        className="flex items-center gap-2 rounded-full p-1 ps-2.5 transition-colors hover:bg-base-200 cursor-pointer shrink-0"
        aria-label="منوی کاربر"
      >
        <span className="hidden text-end leading-tight whitespace-nowrap lg:block">
          <span className="block text-xs font-bold truncate max-w-[110px] xl:max-w-[150px]">{user.name}</span>
          <span className="block text-[10px] text-base-content/60 truncate max-w-[110px] xl:max-w-[150px]">{user.user_type ? ({ administrator: 'مدیر ارشد', manager: 'مدیر', salesperson: 'کارمند فروش', installer: 'نصاب' } as const)[user.user_type] : roleLabel[user.role || 'admin']}</span>
        </span>
        <Avatar name={user.name} src={user.avatar_url} size="md" presence="online" />
      </div>
      <ul tabIndex={0} className="dropdown-content menu z-50 mt-2 w-56 rounded-2xl border border-base-300 bg-base-100 p-2 shadow-xl">
        <li className="menu-title px-3 pb-1">
          <span className="block truncate">{user.email}</span>
        </li>
        <li>
          <button onClick={() => { closeDropdown(); nav('/settings/profile') }}>
            <User className="size-4" /> پروفایل من
          </button>
        </li>
        {hasPermission('settings.manage') && (
          <li>
            <button onClick={() => { closeDropdown(); nav('/settings/sms') }}>
              <MessageSquare className="size-4" /> تنظیمات ملی‌پیامک
            </button>
          </li>
        )}
        {hasPermission('users.manage') && (
          <li>
            <button onClick={() => { closeDropdown(); nav('/settings/users') }}>
              <ShieldCheck className="size-4" /> کاربران و دسترسی‌ها
            </button>
          </li>
        )}
        {hasPermission('settings.manage') && (
          <li>
            <button onClick={() => { closeDropdown(); nav('/settings/system') }}>
              <Palette className="size-4" /> پوسته و رنگ
            </button>
          </li>
        )}
        <li className="mt-1 border-t border-base-300/60 pt-1">
          <button
            className="text-error"
            onClick={() => {
              closeDropdown()
              logout()
              toast.success('با موفقیت از سیستم خارج شدید')
              nav('/login', { replace: true })
            }}
          >
            <LogOut className="size-4" /> خروج از حساب
          </button>
        </li>
      </ul>
    </div>
  )
}

export function MainLayout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className="flex h-dvh overflow-hidden bg-base-200">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-base-300/60 bg-base-100/80 px-3 backdrop-blur-md sm:gap-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 max-w-md">
            <button className="btn btn-ghost btn-circle lg:hidden shrink-0" onClick={() => setOpen(true)} aria-label="باز کردن منو">
              <Menu className="size-5" />
            </button>
            <GlobalSearch />
          </div>
          <div className="ms-auto flex items-center gap-1.5 sm:gap-2.5 md:gap-3 shrink-0">
            {/* Realtime Jalali Date & Time Clock */}
            <RealtimeClock />
            <ThemeToggle />
            <NotificationsMenu />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto max-w-[1500px]">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </motion.div>
        </main>
      </div>
    </div>
  )
}
