import type {
  ActivityType, CustomerPartStatus, CustomerScope, CustomerStatus, EventType, InventoryLogType,
  InvoiceStatus, LeadStage, Priority, ServiceType, TaskStatus, TicketStatus, UserRole,
} from '../types'

type Meta = { label: string; badge: string }

export const customerStatus: Record<CustomerStatus, Meta> = {
  active: { label: 'فعال', badge: 'badge-success' },
  vip: { label: 'ویژه', badge: 'badge-primary' },
  new: { label: 'جدید', badge: 'badge-info' },
  inactive: { label: 'غیرفعال', badge: 'badge-ghost' },
}

export const invoiceStatus: Record<InvoiceStatus, Meta> = {
  paid: { label: 'پرداخت‌شده', badge: 'badge-success' },
  pending: { label: 'در انتظار پرداخت', badge: 'badge-warning' },
  overdue: { label: 'سررسید گذشته', badge: 'badge-error' },
  cancelled: { label: 'لغو شده', badge: 'badge-ghost' },
}

export const ticketStatus: Record<TicketStatus, Meta> = {
  open: { label: 'باز', badge: 'badge-error' },
  pending: { label: 'در حال بررسی', badge: 'badge-warning' },
  resolved: { label: 'حل‌شده', badge: 'badge-success' },
  closed: { label: 'بسته', badge: 'badge-ghost' },
}

export const priority: Record<Priority, Meta> = {
  high: { label: 'بالا', badge: 'badge-error' },
  medium: { label: 'متوسط', badge: 'badge-warning' },
  low: { label: 'کم', badge: 'badge-info' },
}

export const taskStatus: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: 'در انتظار', color: 'bg-base-content/30' },
  'in-progress': { label: 'در حال انجام', color: 'bg-warning' },
  done: { label: 'انجام‌شده', color: 'bg-success' },
}

export const leadStages: { id: LeadStage; label: string; color: string }[] = [
  { id: 'new', label: 'جدید', color: 'bg-info' },
  { id: 'contacted', label: 'تماس گرفته شد', color: 'bg-secondary' },
  { id: 'proposal', label: 'ارسال پیشنهاد', color: 'bg-primary' },
  { id: 'negotiation', label: 'مذاکره', color: 'bg-warning' },
  { id: 'won', label: 'موفق', color: 'bg-success' },
  { id: 'lost', label: 'ازدست‌رفته', color: 'bg-error' },
]
export const stageProbability: Record<LeadStage, number> = {
  new: 12, contacted: 25, proposal: 45, negotiation: 70, won: 100, lost: 0,
}

export const eventType: Record<EventType, { label: string; dot: string; chip: string }> = {
  meeting: { label: 'جلسه', dot: 'bg-primary', chip: 'bg-primary/15 text-primary' },
  call: { label: 'تماس', dot: 'bg-info', chip: 'bg-info/15 text-info' },
  deadline: { label: 'سررسید', dot: 'bg-error', chip: 'bg-error/15 text-error' },
  reminder: { label: 'یادآوری', dot: 'bg-warning', chip: 'bg-warning/20 text-warning-content' },
}

export const activityType: Record<ActivityType, { label: string }> = {
  call: { label: 'تماس' },
  meeting: { label: 'جلسه' },
  email: { label: 'ایمیل' },
  note: { label: 'یادداشت' },
}

/**
 * برچسب نقش‌های سازمانی واقعی سامانه (کلید `users.user_type`).
 * نقش‌های «کارمند فروش» و «نصاب» در نسخه ۲٫۰٫۰ اضافه شدند (تسک ۱).
 */
export const userRoleLabel: Record<UserRole, string> = {
  administrator: 'مدیر ارشد سامانه',
  manager: 'مدیر / سرپرست',
  salesperson: 'کارمند فروش',
  installer: 'نصاب',
}

export const customerScopeLabel: Record<CustomerScope, string> = {
  all: 'همه مشتریان سامانه',
  own: 'فقط مشتریان خودش + استثناهای اعطاشده',
}

export const customerScopeShort: Record<CustomerScope, string> = {
  all: 'همه مشتریان',
  own: 'فقط مشتریان خودش',
}

export const USER_ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  {
    value: 'administrator',
    label: userRoleLabel.administrator,
    hint: 'دسترسی کامل به همه بخش‌ها و مدیریت کاربران — فقط توسط مدیر ارشد قابل اعطا است.',
  },
  {
    value: 'manager',
    label: userRoleLabel.manager,
    hint: 'مدیریت مشتریان، دستگاه‌ها، انبار و پیامک‌ها بدون دسترسی به مدیریت کاربران.',
  },
  {
    value: 'salesperson',
    label: userRoleLabel.salesperson,
    hint: 'پیش‌فرض فقط مشتریان ثبت‌شده توسط خودش را می‌بیند؛ مدیر می‌تواند استثنا اعطا کند.',
  },
  {
    value: 'installer',
    label: userRoleLabel.installer,
    hint: 'ثبت سرویس، تعمیر و تخصیص دستگاه برای مشتریان در دسترس خودش.',
  },
]

export const CUSTOMER_SCOPE_OPTIONS: { value: CustomerScope; label: string; hint: string }[] = [
  {
    value: 'all',
    label: customerScopeLabel.all,
    hint: 'همه مشتریان سامانه بدون محدودیت قابل مشاهده و ویرایش است.',
  },
  {
    value: 'own',
    label: customerScopeLabel.own,
    hint: 'فقط مشتریانِ ثبت‌شده توسط خودش، به‌علاوه مشتریان کارمندان یا مشتریان تکی که مدیر اعطا کرده است.',
  },
]

export const inventoryTypeLabel: Record<InventoryLogType, string> = {
  in: 'ورود به انبار',
  out: 'خروج جهت تخصیص',
  return: 'برگشت به انبار',
  adjustment: 'اصلاح دستی موجودی',
}

export const inventoryTypeBadge: Record<InventoryLogType, string> = {
  in: 'badge-success badge-soft',
  out: 'badge-warning badge-soft',
  return: 'badge-info badge-soft',
  adjustment: 'badge-ghost',
}

export function inventoryTypeMeta(type: InventoryLogType | string): { label: string; badge: string } {
  const key = type as InventoryLogType
  return {
    label: inventoryTypeLabel[key] ?? String(type),
    badge: inventoryTypeBadge[key] ?? 'badge-ghost',
  }
}

export const INVENTORY_TYPE_OPTIONS: { value: InventoryLogType; label: string }[] = [
  { value: 'in', label: inventoryTypeLabel.in },
  { value: 'out', label: inventoryTypeLabel.out },
  { value: 'return', label: inventoryTypeLabel.return },
  { value: 'adjustment', label: inventoryTypeLabel.adjustment },
]

export const deviceStatusLabel: Record<CustomerPartStatus, string> = {
  active: 'فعال در محل مشتری',
  under_repair: 'در دست تعمیر',
  replaced: 'تعویض شده',
  retired: 'از رده خارج',
}

export const DEVICE_STATUS_OPTIONS: { value: CustomerPartStatus; label: string }[] = [
  { value: 'active', label: deviceStatusLabel.active },
  { value: 'under_repair', label: deviceStatusLabel.under_repair },
  { value: 'replaced', label: deviceStatusLabel.replaced },
  { value: 'retired', label: deviceStatusLabel.retired },
]

export const serviceTypeLabel: Record<ServiceType, string> = {
  periodic: 'سرویس دوره‌ای',
  repair: 'تعمیر فنی',
  overhaul: 'اورهال',
}

/** برچسب نقش‌های نمایشی نسخه قدیمی — برای سازگاری صفحات دمو نگه داشته شده است */
export const roleLabel: Record<string, string> = {
  administrator: userRoleLabel.administrator,
  manager: userRoleLabel.manager,
  salesperson: userRoleLabel.salesperson,
  installer: userRoleLabel.installer,
  admin: 'مدیر سیستم',
  sales: 'فروش',
  support: 'پشتیبانی',
  warehouse: 'انبار',
  finance: 'مالی',
  marketing: 'بازاریابی',
}

export const PAYMENT_METHODS = ['کارت به کارت', 'پوز فروشگاهی', 'چک', 'نقدی', 'پرداخت اینترنتی']
export const CITIES = ['تهران', 'اصفهان', 'شیراز', 'مشهد', 'تبریز', 'کرج', 'اهواز', 'قم', 'رشت', 'یزد', 'کرمان', 'ارومیه', 'ساری', 'همدان']
export const SOURCES = ['وب‌سایت', 'معرفی مشتری', 'نمایشگاه', 'اینستاگرام', 'تماس سرد', 'تبلیغات گوگل']
export const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
