export type Role = 'admin' | 'manager' | 'sales' | 'support' | 'warehouse' | 'finance' | 'marketing'
export type Presence = 'online' | 'away' | 'offline'

export interface User {
  id: string
  name: string
  email: string
  phone?: string
  avatar?: string
  avatar_url?: string
  title?: string
  role?: Role
  presence?: Presence
  joinedAt?: string
  is_active?: boolean
  permissions: string[]
  created_at?: string
  user_type?: UserType
  user_type_label?: string
  data_scope?: DataScope
}

export type UserType = 'administrator' | 'manager' | 'salesperson' | 'installer'
export type DataScope = 'all' | 'own' | 'custom'

export interface CompanySettings {
  company_name: string | null
  company_logo_url: string | null
}

export type CustomerType = 'potential' | 'effective'
export type CustomerPersonType = 'individual' | 'company'
export type CustomerStatus = 'active' | 'vip' | 'new' | 'inactive'

export interface Customer {
  id: number | string
  customer_type: CustomerType // potential (بالقوه) | effective (بالفعل)
  type: CustomerPersonType    // individual (حقیقی) | company (حقوقی)
  first_name: string | null
  last_name: string | null
  full_name?: string
  company_name?: string | null
  national_code?: string | null
  mobile: string | null
  phone?: string
  email?: string
  province?: string
  city?: string
  address?: string
  notes?: string
  created_at?: string
  updated_at?: string
  customer_parts_count?: number
  devices_quantity?: number
  created_by?: number | string | null
  creator?: Pick<User, 'id' | 'name' | 'user_type'>
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
  description?: string
  is_active: boolean
  stock_quantity: number
  min_stock_quantity?: number
  allocated_quantity?: number
  available_quantity?: number
  is_low_stock?: boolean
  customer_parts_count?: number
  customer_parts_sum_quantity?: number
  customer_parts?: CustomerPart[]
  inventory_logs?: InventoryLog[]
  created_at?: string
}

export type CustomerPartStatus = 'active' | 'under_repair' | 'replaced' | 'retired'

export interface CustomerPart {
  id: number | string
  customer_id: number | string
  part_id: number | string
  quantity: number
  invoice_number?: string | null
  invoice_amount?: number | string | null
  serial_number?: string | null
  installation_date?: string
  warranty_expire_date?: string
  status: CustomerPartStatus
  notes?: string
  assigned_by_user_id?: number | string | null
  part?: Part
  assigned_by?: Pick<User, 'id' | 'name'>
  customer?: Customer
  service_histories?: PartServiceHistory[]
  inventory_logs?: InventoryLog[]
  created_at?: string
}

export type InventoryMovementType = 'in' | 'out' | 'return' | 'adjust'

export interface InventoryLog {
  id: number | string
  part_id: number | string
  user_id?: number | string | null
  customer_id?: number | string | null
  customer_part_id?: number | string | null
  type: InventoryMovementType
  type_label?: string
  quantity: number
  stock_after: number
  note?: string | null
  created_at: string
  part?: Part
  user?: Pick<User, 'id' | 'name' | 'user_type'>
  customer?: Customer
}

export interface InventorySummary {
  total_parts: number
  total_stock: number
  total_allocated: number
  low_stock_parts: number
  today_movements: number
}

export interface CustomerAccessGrant {
  scope: DataScope
  staff_ids: number[]
  customer_ids: number[]
}

export interface StaffOption {
  id: number
  name: string
  email: string
  user_type: UserType
  user_type_label: string
}

export interface PartServiceHistory {
  id: number | string
  customer_part_id: number | string
  performed_by_user_id?: number | string
  service_date: string
  service_type: 'periodic' | 'repair' | 'overhaul'
  description: string
  cost?: number | string
  performed_by?: User
  created_at?: string
}

export interface CustomerHistory {
  id: number | string
  customer_id: number | string
  user_id?: number | string
  action: string
  description: string
  metadata?: Record<string, any>
  created_at: string
  user?: User
  customer?: Customer
}

export interface SmsLog {
  id: number | string
  customer_id?: number | string
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
}

export interface DashboardStats {
  stats: {
    total_customers: number
    effective_customers: number
    potential_customers: number
    total_parts: number
    assigned_parts: number
    assigned_devices?: number
    total_stock?: number
    total_sms_sent: number
  }
  recent_activities: CustomerHistory[]
  recent_sms: SmsLog[]
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
