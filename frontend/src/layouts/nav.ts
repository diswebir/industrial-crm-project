import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  Cpu,
  LayoutDashboard,
  MessageSquare,
  Palette,
  ShieldCheck,
  User,
  Users,
  Warehouse,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  permission?: string
  external?: boolean
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const MAIN_NAV: NavGroup[] = [
  {
    title: 'اصلی',
    items: [
      { to: '/', label: 'داشبورد مدیریت', icon: LayoutDashboard, end: true },
    ],
  },
  {
    title: 'مشتریان و دستگاه‌ها',
    items: [
      { to: '/customers', label: 'مدیریت مشتریان', icon: Users, permission: 'customers.view' },
      { to: '/parts', label: 'کاتالوگ و تخصیص دستگاه‌ها', icon: Cpu, permission: 'parts.view' },
      { to: '/inventory', label: 'انبار و تاریخچه ورود/خروج', icon: Warehouse, permission: 'inventory.view' },
    ],
  },
  {
    title: 'ارتباطات و پیام‌رسانی',
    items: [
      { to: '/sms', label: 'سامانه پیامک (ملی‌پیامک)', icon: MessageSquare, permission: 'sms.send' },
    ],
  },
]

export const SETTINGS_NAV: NavItem[] = [
  { to: '/settings/sms', label: 'سامانه ملی‌پیامک', icon: MessageSquare, permission: 'settings.manage' },
  { to: '/settings/users', label: 'کاربران و دسترسی‌ها (ACL)', icon: ShieldCheck, permission: 'users.manage' },
  { to: '/settings/profile', label: 'پروفایل کاربری من', icon: User },
  { to: '/settings/system', label: 'تنظیمات پوسته و رنگ', icon: Palette },
]
