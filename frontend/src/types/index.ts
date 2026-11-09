/** ─────────────────────────────────────────────────────────────────────────
 *  انواع داده سامانه — نسخه ۲٫۰٫۰
 *  تغییرات مهم: نقش‌های جدید (کارمند فروش/نصاب)، دامنه دسترسی مشتریان،
 *  موجودی انبار و تاریخچه تراکنش‌ها، فیلدهای فاکتور روی تخصیص دستگاه،
 *  و اختیاری‌شدن نام/نام‌خانوادگی/موبایل مشتری.
 *  ───────────────────────────────────────────────────────────────────────── */

export type Role = 'admin' | 'manager' | 'sales' | 'support' | 'warehouse' | 'finance' | 'marketing'
export type Presence = 'online' | 'away' | 'offline'

/** نقش‌های سازمانی واقعی سامانه (کلید `users.user_type`) */
export type UserRole = 'administrator' | 'manager' | 'salesperson' | 'installer'

/** دامنه دسترسی کاربر به مشتریان */
export type CustomerScope = 'all' | 'own'

export interface User {
  id: string
  name: string
  email: string
  phone?: string | null
  avatar?: string | null
  avatar_url?: string | null
  title?: string
  role?: Role
  presence?: Presence
  joinedAt?: string
  is_active?: boolean
  permissions: string[]
  created_at?: string
  user_type?: UserRole
  role_label?: string
  customers_scope?: CustomerScope
  has_global_customer_access?: boolean
  created_customers_count?: number
  accessible_staff_ids?: number[]
  accessible_customer_ids?: number[]
  accessible_staff?: { id: number; name: string }[]
  accessible_customers?: { id: number; label: string }[]
}

/** نقش سازمانی به‌همراه پیش‌فرض‌های آن (از `GET /acl/roles`) */
export interface AclRole {
  key: UserRole
  label: string
  description: string
  default_scope: CustomerScope
  default_permissions: string[]
  assignable: boolean
}

export interface AclScopeOption {
  key: CustomerScope
  label: string
}

export interface SelectableStaff {
  id: number
  name: string
  email: string
  role: UserRole
  role_label: string
}

export interface SelectableCustomer {
  id: number
  label: string
  mobile: string | null
}

export interface CompanySettings {
  company_name: string | null
  company_logo_url: string | null
  app_version?: string
  app_version_name?: string
}

export type CustomerType = 'potential' | 'effective'
export type CustomerPersonType = 'individual' | 'company'
export type CustomerStatus = 'active' | 'vip' | 'new' | 'inactive'

export interface Customer {
  id: number | string
  customer_type: CustomerType // potential (بالقوه) | effective (بالفعل)
  type: CustomerPersonType    // individual (حقیقی) | company (حقوقی)
  /** برای شخصیت حقوقی اختیاری است (تسک ۵) */
  first_name?: string | null
  last_name?: string | null
  full_name?: string
  /** برای شخصیت حقوقی الزامی است (تسک ۵) */
  company_name?: string | null
  national_code?: string | null
  /** شماره همراه برای هر دو نوع شخصیت اختیاری است (تسک ۵) */
  mobile?: string | null
  phone?: string | null
  email?: string | null
  province?: string | null
  city?: string | null
  address?: string | null
  notes?: string | null
  /** کارمندی که مشتری را ثبت کرده — پایه دامنه دسترسی «فقط مشتریان خودش» */
  created_by_user_id?: number | null
  created_by?: User | null
  created_at?: string
  updated_at?: string
  customer_parts_count?: number
  customer_parts?: CustomerPart[]
  histories?: CustomerHistory[]
  sms_logs?: SmsLog[]

  // Legacy demo compatibility fields
  firstName?: string
  lastName?: string
  company?: string
  status?: CustomerStatus
  source?: string
  tags?: string[]
  assignedTo?: string
  createdAt?: string
  lastContact?: string
  lastPurchase?: string
  totalSpent?: number
  ordersCount?: number
}

export interface Part {
  id: number | string
  name: string
  code: string
  periodic_service_months: number
  description?: string | null
  is_active: boolean
  /** موجودی انبار (تسک ۴) */
  stock_quantity: number
  /** حد هشدار کمبود موجودی */
  min_stock_quantity: number
  /** واحد شمارش — پیش‌فرض «عدد» */
  unit_label?: string
  /** آیا موجودی به حد هشدار رسیده است (محاسبه سمت سرور) */
  is_low_stock?: boolean
  /** مجموع تعداد دستگاه‌های تخصیص‌یافته (محاسبه سمت سرور) */
  assigned_quantity?: number
  customer_parts_count?: number
  customer_parts?: CustomerPart[]
  created_at?: string
  updated_at?: string
}

export type CustomerPartStatus = 'active' | 'under_repair' | 'replaced' | 'retired'

export interface CustomerPart {
  id: number | string
  customer_id: number | string
  part_id: number | string
  serial_number: string
  /** تعداد دستگاه تخصیص‌یافته (تسک ۳) */
  quantity: number
  /** شماره فاکتور — دستی و اختیاری (تسک ۳) */
  invoice_number?: string | null
  /** مبلغ فاکتور — دستی (تسک ۳) */
  invoice_amount?: number | string | null
  installation_date?: string | null
  warranty_expire_date?: string | null
  status: CustomerPartStatus
  notes?: string | null
  /** کارمندی که تخصیص را ثبت کرده */
  assigned_by_user_id?: number | null
  assigned_by?: User | null
  part?: Part
  customer?: Customer
  service_histories?: PartServiceHistory[]
  service_histories_count?: number
  created_at?: string
  updated_at?: string
}

export type ServiceType = 'periodic' | 'repair' | 'overhaul'

export interface PartServiceHistory {
  id: number | string
  customer_part_id: number | string
  performed_by_user_id?: number | string | null
  service_date: string
  service_type: ServiceType
  description: string
  cost?: number | string | null
  performed_by?: User | null
  customer_part?: CustomerPart
  created_at?: string
  updated_at?: string
}

/** نوع تراکنش انبار (تسک ۴) */
export type InventoryLogType = 'in' | 'out' | 'return' | 'adjustment'

export interface InventoryLog {
  id: number | string
  part_id: number | string
  customer_id?: number | string | null
  customer_part_id?: number | string | null
  user_id?: number | string | null
  type: InventoryLogType
  quantity: number
  stock_before: number
  stock_after: number
  reference?: string | null
  notes?: string | null
  logged_at: string
  created_at?: string
  part?: Part
  customer?: Customer
  customer_part?: CustomerPart
  user?: User | null
}

export interface InventorySummary {
  total_devices: number
  active_devices: number
  total_stock: number
  low_stock_count: number
  low_stock_items: Part[]
  assigned_quantity: number
  assignment_rows: number
  received_today: number
  issued_today: number
}

export interface InventoryReconciliationRow {
  id: number
  name: string
  code: string
  stock_quantity: number
  min_stock_quantity: number
  assigned_quantity: number
}

export interface CustomerHistory {
  id: number | string
  customer_id: number | string
  user_id?: number | string | null
  action: string
  description: string
  metadata?: Record<string, any>
  created_at: string
  user?: User
  customer?: Customer
}

export interface SmsLog {
  id: number | string
  customer_id?: number | string | null
  recipient_mobile: string
  pattern_code: string
  tokens: Record<string, any> | string[]
  status: 'sent' | 'failed' | 'pending'
  provider_message_id?: string
  error_message?: string
  created_at: string
  customer?: Customer
}

export interface SmsSettings {
  melipayamak_username: string
  melipayamak_has_password: boolean
  melipayamak_from: string
  melipayamak_sandbox: boolean
}

export interface SystemPermission {
  name: string
  label: string
  group?: string
}

/** پاسخ صفحه‌بندی‌شده لاراول */
export interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
  from?: number | null
  to?: number | null
}

export interface DashboardStats {
  stats: {
    total_customers: number
    effective_customers: number
    potential_customers: number
    my_customers: number
    total_parts: number
    assigned_parts: number
    assigned_quantity: number
    total_stock: number
    low_stock_count: number
    total_sms_sent: number
    has_global_customer_access: boolean
  }
  recent_activities: CustomerHistory[]
  recent_sms: SmsLog[]
  recent_inventory: InventoryLog[]
}

/** نتیجه ورود فایل اکسل مشتریان */
export interface ImportResult {
  message: string
  imported_count: number
  created_count: number
  updated_count: number
  errors: string[]
  warnings: string[]
}

// Legacy demo types for compatibility
export type LeadStage = 'new' | 'contacted' | 'proposal' | 'negotiation' | 'won' | 'lost'
export interface Lead {
  id: string
  title: string
  contactName: string
  company: string
  phone: string
  value: number
  stage: LeadStage
  probability: number
  source: string
  assignedTo: string
  expectedClose: string
  createdAt: string
  order: number
}

export interface Product {
  id: string
  sku: string
  name: string
  category: string
  price: number
  cost: number
  stock: number
  minStock: number
  unit: string
  warehouse: string
  supplier: string
  createdAt: string
}

export interface StockMovement {
  id: string
  productId: string
  type: 'in' | 'out' | 'adjust'
  quantity: number
  date: string
  userId: string
  note: string
}

export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'cancelled'
export interface SaleItem {
  productId: string
  name: string
  quantity: number
  price: number
}
export interface Sale {
  id: string
  number: string
  date: string
  customerId: string
  userId: string
  status: InvoiceStatus
  paymentMethod: string
  items: SaleItem[]
  discount: number
  total: number
}

export type ActivityType = 'call' | 'meeting' | 'email' | 'note'
export interface Activity {
  id: string
  customerId: string
  type: ActivityType
  title: string
  description: string
  date: string
  userId: string
}

export type TaskStatus = 'todo' | 'in-progress' | 'done'
export type Priority = 'low' | 'medium' | 'high'
export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  dueDate: string
  assignedTo: string
  customerId: string | null
  createdAt: string
}

export type EventType = 'meeting' | 'call' | 'deadline' | 'reminder'
export interface CalendarEvent {
  id: string
  title: string
  type: EventType
  start: string
  end: string
  customerId: string | null
  userId: string
  location: string
}

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed'
export interface TicketMessage {
  from: 'customer' | 'agent'
  text: string
  date: string
}
export interface Ticket {
  id: string
  number: string
  subject: string
  category: string
  customerId: string
  priority: Priority
  status: TicketStatus
  assignedTo: string
  createdAt: string
  messages: TicketMessage[]
}

export interface ChatRoom {
  id: string
  name: string
  type: 'dm' | 'group'
  members: string[]
  unread: number
}
export interface ChatMessage {
  id: string
  roomId: string
  senderId: string
  text: string
  date: string
}

export interface AppNotification {
  id: string
  userId: string
  type: 'lead' | 'stock' | 'invoice' | 'ticket' | 'task' | 'system'
  title: string
  description: string
  link: string
  read: boolean
  date: string
}

export interface Resources {
  users: User
  customers: Customer
  leads: Lead
  products: Product
  stockMovements: StockMovement
  sales: Sale
  activities: Activity
  tasks: Task
  events: CalendarEvent
  tickets: Ticket
  rooms: ChatRoom
  messages: ChatMessage
  notifications: AppNotification
}
export type ResourceName = keyof Resources
