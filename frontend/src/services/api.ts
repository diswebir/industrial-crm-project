import axios from 'axios'
import type {
  AclRole,
  AclScopeOption,
  Customer,
  CustomerPart,
  CustomerType,
  DashboardStats,
  ImportResult,
  InventoryLog,
  InventoryLogType,
  InventoryReconciliationRow,
  InventorySummary,
  Paginated,
  Part,
  PartServiceHistory,
  ResourceName,
  Resources,
  SelectableCustomer,
  SelectableStaff,
  SmsLog,
  SmsSettings,
  SystemPermission,
  User,
  UserRole,
  CompanySettings,
  CustomerScope,
} from '../types'

export const http = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

// Handle FormData Content-Type
http.interceptors.request.use((config) => {
  // When sending FormData, let the browser/runtime set Content-Type with multipart boundary
  if (config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type']
  }
  return config
})

// Handle 401 Unauthenticated
http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.includes('/login')) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

/** پیام خطای فارسی برگردانده‌شده از سمت سرور (۴۲۲/۴۰۳/…) را استخراج می‌کند */
export function apiErrorMessage(err: any, fallback = 'انجام عملیات ناموفق بود.'): string {
  const data = err?.response?.data
  if (!data) return fallback
  if (typeof data === 'string' && data.trim()) return data
  if (data.message) {
    const errors = data.errors
    if (errors && typeof errors === 'object') {
      const first = Object.values(errors)[0]
      if (Array.isArray(first) && first[0]) return `${data.message} — ${first[0]}`
    }
    return data.message
  }
  if (data.errors) {
    const first = Object.values(data.errors)[0]
    if (Array.isArray(first) && first[0]) return String(first[0])
  }
  return fallback
}

// API Services
export const authApi = {
  login: async (login: string, password: string) => {
    const { data } = await http.post<{ user: any; token?: string }>('/auth/login', { login, password })
    data.user.id = String(data.user.id)
    return data as { user: User; token?: string }
  },
  sendOtp: async (phone: string) => {
    const { data } = await http.post<{ message: string; expires_in: number; sandbox_code?: string }>('/auth/otp/send', { phone })
    return data
  },
  verifyOtp: async (phone: string, code: string) => {
    const { data } = await http.post<{ user: any; token?: string; message: string }>('/auth/otp/verify', { phone, code })
    data.user.id = String(data.user.id)
    return data as { user: User; token?: string; message: string }
  },
  me: async () => {
    const { data } = await http.get<{ user: any }>('/auth/me')
    data.user.id = String(data.user.id)
    return data.user as User
  },
  logout: async () => {
    await http.post('/auth/logout')
  },
  updateProfile: async (body: FormData) => {
    const { data } = await http.post<{ message: string; user: any }>('/auth/me', body)
    data.user.id = String(data.user.id)
    return data as { message: string; user: User }
  },
}

export const dashboardApi = {
  getStats: async () => {
    const { data } = await http.get<DashboardStats>('/dashboard/stats')
    return data
  },
}

export interface CustomerListParams {
  customer_type?: CustomerType | string
  type?: string
  q?: string
  page?: number
  per_page?: number
  owner_id?: number | string
  created_by_user_id?: number | string
}

export const customerApi = {
  list: async (params?: CustomerListParams) => {
    const { data } = await http.get<Paginated<Customer>>('/customers', { params })
    return data
  },
  get: async (id: number | string) => {
    const { data } = await http.get<Customer>(`/customers/${id}`)
    return data
  },
  create: async (body: Partial<Customer>) => {
    const { data } = await http.post<{ message: string; customer: Customer }>('/customers', body)
    return data
  },
  update: async (id: number | string, body: Partial<Customer>) => {
    const { data } = await http.put<{ message: string; customer: Customer }>(`/customers/${id}`, body)
    return data
  },
  delete: async (id: number | string) => {
    const { data } = await http.delete<{ message: string }>(`/customers/${id}`)
    return data
  },
  importExcel: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await http.post<ImportResult>('/customers/import', formData)
    return data
  },
  exportExcelUrl: (customerType?: string) => {
    const base = '/api/v1/customers/export'
    return customerType ? `${base}?customer_type=${customerType}` : base
  },
  templateExcelUrl: () => '/api/v1/customers/template',
  downloadTemplate: async () => {
    const response = await http.get('/customers/template', { responseType: 'blob' })
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const downloadUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = 'customers-sample-template.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(downloadUrl)
  },
  downloadExport: async (customerType?: string) => {
    const url = customerType ? `/customers/export?customer_type=${customerType}` : '/customers/export'
    const response = await http.get(url, { responseType: 'blob' })
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const downloadUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(downloadUrl)
  },
}

/** بدنه درخواست تخصیص دستگاه به مشتری (تسک ۳) */
export interface AssignPartPayload {
  part_id: number | string
  serial_number: string
  quantity?: number
  invoice_number?: string | null
  invoice_amount?: number | string | null
  installation_date?: string | null
  warranty_expire_date?: string | null
  status?: string
  notes?: string | null
}

/** بدنه ویرایش تخصیص دستگاه (part_id قابل تغییر نیست) */
export type UpdateAssignmentPayload = Partial<Omit<AssignPartPayload, 'part_id'>>

export const partApi = {
  list: async (params?: { q?: string; active?: boolean | 0 | 1; low_stock?: boolean | 0 | 1 }) => {
    const { data } = await http.get<Part[]>('/parts', { params })
    return data
  },
  get: async (id: number | string) => {
    const { data } = await http.get<Part>(`/parts/${id}`)
    return data
  },
  create: async (body: Partial<Part>) => {
    const { data } = await http.post<{ message: string; part: Part }>('/parts', body)
    return data
  },
  update: async (id: number | string, body: Partial<Part>) => {
    const { data } = await http.put<{ message: string; part: Part }>(`/parts/${id}`, body)
    return data
  },
  delete: async (id: number | string) => {
    const { data } = await http.delete<{ message: string }>(`/parts/${id}`)
    return data
  },
  /** تخصیص دستگاه به مشتری — تعداد + مبلغ/شماره فاکتور (تسک ۳) + کسر خودکار از انبار (تسک ۴) */
  assignPart: async (customerId: number | string, body: AssignPartPayload) => {
    const { data } = await http.post<{
      message: string
      customer_part: CustomerPart
      customer_type: CustomerType
      stock_quantity: number
    }>(`/customers/${customerId}/parts`, body)
    return data
  },
  /** ویرایش تخصیص — بازگرداندن/کسر اختلاف موجودی به‌صورت خودکار انجام می‌شود */
  updateAssignment: async (customerPartId: number | string, body: UpdateAssignmentPayload) => {
    const { data } = await http.post<{ message: string; customer_part: CustomerPart; stock_quantity: number }>(
      `/customer-parts/${customerPartId}`,
      body,
    )
    return data
  },
  /** حذف تخصیص — برگشت خودکار موجودی به انبار */
  deleteAssignment: async (customerPartId: number | string) => {
    const { data } = await http.delete<{ message: string }>(`/customer-parts/${customerPartId}`)
    return data
  },
  addServiceHistory: async (
    customerPartId: number | string,
    body: { service_date: string; service_type: string; description: string; cost?: number | string | null },
  ) => {
    const { data } = await http.post<{ message: string; history: PartServiceHistory }>(
      `/customer-parts/${customerPartId}/history`,
      body,
    )
    return data
  },
  updateServiceHistory: async (
    serviceHistoryId: number | string,
    body: Partial<{ service_date: string; service_type: string; description: string; cost: number | string | null }>,
  ) => {
    const { data } = await http.post<{ message: string; history: PartServiceHistory }>(
      `/service-histories/${serviceHistoryId}`,
      body,
    )
    return data
  },
  deleteServiceHistory: async (serviceHistoryId: number | string) => {
    const { data } = await http.delete<{ message: string }>(`/service-histories/${serviceHistoryId}`)
    return data
  },
}

export interface InventoryLogFilters {
  part_id?: number | string
  customer_id?: number | string
  user_id?: number | string
  type?: InventoryLogType | string
  from?: string
  to?: string
  q?: string
  page?: number
  per_page?: number
}

/** انبار و تاریخچه تراکنش‌ها (تسک ۴) */
export const inventoryApi = {
  logs: async (params?: InventoryLogFilters) => {
    const { data } = await http.get<Paginated<InventoryLog>>('/inventory/logs', { params })
    return data
  },
  /** ثبت حرکت دستی: ورود کالا، خروج کالا یا اصلاح موجودی */
  stock: async (body: {
    part_id: number | string
    type: 'in' | 'out' | 'adjustment'
    quantity: number
    notes?: string | null
    reference?: string | null
    customer_id?: number | string | null
    customer_part_id?: number | string | null
  }) => {
    const { data } = await http.post<{ message: string; log: InventoryLog; part: Part }>('/inventory/stock', body)
    return data
  },
  summary: async () => {
    const { data } = await http.get<InventorySummary>('/inventory/summary')
    return data
  },
  show: async (partId: number | string, perPage = 10) => {
    const { data } = await http.get<{ part: Part; logs: Paginated<InventoryLog> }>(`/inventory/parts/${partId}`, {
      params: { per_page: perPage },
    })
    return data
  },
  reconciliation: async () => {
    const { data } = await http.get<{ message: string; items: InventoryReconciliationRow[] }>('/inventory/reconciliation')
    return data
  },
}

export const smsApi = {
  sendPattern: async (body: { mobile: string; pattern_code: string; tokens: Record<string, any>; customer_id?: number | string }) => {
    const { data } = await http.post<{ message: string; success: boolean; message_id: string; is_sandbox: boolean }>('/sms/send-pattern', body)
    return data
  },
  getLogs: async (params?: { status?: string; q?: string; page?: number; per_page?: number }) => {
    const { data } = await http.get<Paginated<SmsLog>>('/sms/logs', { params })
    return data
  },
}

export const settingsApi = {
  getSmsSettings: async () => {
    const { data } = await http.get<SmsSettings>('/settings/sms')
    return data
  },
  updateSmsSettings: async (body: Partial<SmsSettings & { melipayamak_password?: string }>) => {
    const { data } = await http.put<{ message: string }>('/settings/sms', body)
    return data
  },
  getCompanySettings: async () => {
    const { data } = await http.get<CompanySettings>('/settings/company')
    return data
  },
  updateCompanySettings: async (body: FormData) => {
    const { data } = await http.post<{ message: string; company_name: string | null; company_logo_url: string | null }>('/settings/company', body)
    return data
  },
}

/** بدنه ساخت/ویرایش کاربر با نقش و دامنه دسترسی (تسک ۱) */
export interface UserPayload {
  name: string
  email: string
  phone?: string | null
  password?: string
  is_active?: boolean
  user_type?: UserRole
  customers_scope?: CustomerScope
  permissions?: string[]
  accessible_staff_ids?: number[]
  accessible_customer_ids?: number[]
  remove_avatar?: boolean | 0 | 1
}

export const usersApi = {
  list: async () => {
    const { data } = await http.get<any[]>('/users')
    return data.map((u) => ({ ...u, id: String(u.id) })) as User[]
  },
  get: async (id: number | string) => {
    const { data } = await http.get<any>(`/users/${id}`)
    data.id = String(data.id)
    return data as User
  },
  create: async (body: FormData | UserPayload) => {
    const { data } = await http.post<{ message: string; user: User }>('/users', body)
    return data
  },
  update: async (id: number | string, body: FormData | UserPayload) => {
    const { data } = await http.post<{ message: string; user: User }>(`/users/${id}`, body)
    return data
  },
  delete: async (id: number | string) => {
    const { data } = await http.delete<{ message: string }>(`/users/${id}`)
    return data
  },
  updatePermissions: async (userId: number | string, permissions: string[]) => {
    const { data } = await http.put<{ message: string; permissions: string[] }>(`/users/${userId}/permissions`, { permissions })
    return data
  },
  /** تغییر دامنه دسترسی به مشتریان + استثنائهای اعطاشده (تسک ۱) */
  updateAccessScope: async (
    userId: number | string,
    body: {
      customers_scope?: CustomerScope
      accessible_staff_ids?: number[]
      accessible_customer_ids?: number[]
    },
  ) => {
    const { data } = await http.put<{ message: string; user: User }>(`/users/${userId}/access-scope`, body)
    return data
  },
  toggleActive: async (userId: number | string) => {
    const { data } = await http.patch<{ message: string; is_active: boolean }>(`/users/${userId}/toggle-active`)
    return data
  },
  getAvailablePermissions: async () => {
    const { data } = await http.get<SystemPermission[]>('/permissions')
    return data
  },
}

/** نقش‌ها، دامنه‌ها و فهرست‌های انتخاب برای مدیریت دسترسی (تسک ۱) */
export const aclApi = {
  roles: async () => {
    const { data } = await http.get<{ roles: AclRole[]; scopes: AclScopeOption[] }>('/acl/roles')
    return data
  },
  staff: async () => {
    const { data } = await http.get<SelectableStaff[]>('/acl/staff')
    return data
  },
  customers: async (q?: string) => {
    const { data } = await http.get<SelectableCustomer[]>('/acl/customers', { params: q ? { q } : undefined })
    return data
  },
}

// Legacy demo helpers for backward compatibility
export const getAll = async <K extends ResourceName>(r: K) => (await http.get<Resources[K][]>(`/${r}`)).data
export const createOne = async <K extends ResourceName>(r: K, body: Partial<Resources[K]>) =>
  (await http.post<Resources[K]>(`/${r}`, body)).data
export const patchOne = async <K extends ResourceName>(r: K, id: string, body: Partial<Resources[K]>) =>
  (await http.patch<Resources[K]>(`/${r}/${id}`, body)).data
export const deleteOne = async (r: ResourceName, id: string) => {
  await http.delete(`/${r}/${id}`)
}
