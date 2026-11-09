import type {
  ActivityType, CustomerStatus, EventType, InvoiceStatus, LeadStage, Priority, TaskStatus, TicketStatus,
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

export const roleLabel: Record<string, string> = {
  admin: 'مدیر سیستم', manager: 'مدیر', sales: 'فروش', support: 'پشتیبانی',
  warehouse: 'انبار', finance: 'مالی', marketing: 'بازاریابی',
  administrator: 'مدیر ارشد', salesperson: 'کارمند فروش', installer: 'نصاب',
}

export const PAYMENT_METHODS = ['کارت به کارت', 'پوز فروشگاهی', 'چک', 'نقدی', 'پرداخت اینترنتی']
export const CITIES = ['تهران', 'اصفهان', 'شیراز', 'مشهد', 'تبریز', 'کرج', 'اهواز', 'قم', 'رشت', 'یزد', 'کرمان', 'ارومیه', 'ساری', 'همدان']
export const SOURCES = ['وب‌سایت', 'معرفی مشتری', 'نمایشگاه', 'اینستاگرام', 'تماس سرد', 'تبلیغات گوگل']
export const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
