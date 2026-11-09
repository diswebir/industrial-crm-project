import axios from 'axios'
import type {
  Customer,
  Part,
  CustomerPart,
  PartServiceHistory,
  SmsLog,
  SmsSettings,
  SystemPermission,
  User,
  DashboardStats,
  ResourceName,
  Resources,
  CompanySettings,
  InventoryLog,
  InventorySummary,
  InventoryMovementType,
  CustomerAccessGrant,
  StaffOption,
  DataScope,
  UserType,
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

export const customerApi = {
  list: async (params?: { customer_type?: string; q?: string; page?: number; per_page?: number; created_by?: number | string }) => {
    const { data } = await http.get<{ data: Customer[]; current_page: number; last_page: number; total: number }>('/customers', { params })
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
    const { data } = await http.post<{ message: string; imported_count: number; errors: string[] }>('/customers/import', formData)
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
  /**
   * خروجی جامع مشتریان همراه با دستگاه‌ها و فاکتورها.
   * format = xlsx (پیش‌فرض) یا csv (با UTF-8 BOM برای باز شدن صحیح فارسی در Excel)
   */
  downloadExport: async (customerType?: string, format: 'xlsx' | 'csv' = 'xlsx') => {
    const params = new URLSearchParams()
    if (customerType) params.set('customer_type', customerType)
    if (format === 'csv') params.set('format', 'csv')
    const query = params.toString()
    const url = query ? `/customers/export?${query}` : '/customers/export'
    const response = await http.get(url, { responseType: 'blob' })
    const mime =
      format === 'csv'
        ? 'text/csv;charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    const blob = new Blob([response.data], { type: mime })
    const downloadUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(downloadUrl)
  },
}

export const partApi = {
  list: async (params?: { q?: string }) => {
    const { data } = await http.get<Part[]>('/parts', { params })
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
  assignPart: async (
    customerId: number | string,
    body: {
      part_id: number | string
      quantity: number
      serial_number?: string | null
      invoice_number?: string | null
      invoice_amount?: number | string | null
      installation_date?: string
      warranty_expire_date?: string
      status?: string
      notes?: string
    },
  ) => {
    const { data } = await http.post<{
      message: string
      customer_part: CustomerPart
      customer_type: string
      stock_quantity: number
    }>(`/customers/${customerId}/parts`, body)
    return data
  },
  updateAssignment: async (
    customerPartId: number | string,
    body: {
      part_id?: number | string
      quantity?: number
      serial_number?: string | null
      invoice_number?: string | null
      invoice_amount?: number | string | null
      installation_date?: string
      warranty_expire_date?: string
      status?: string
      notes?: string
    },
  ) => {
    const { data } = await http.put<{ message: string; customer_part: CustomerPart }>(
      `/customer-parts/${customerPartId}`,
      body,
    )
    return data
  },
  deleteAssignment: async (customerPartId: number | string) => {
    const { data } = await http.delete<{ message: string }>(`/customer-parts/${customerPartId}`)
    return data
  },
  addServiceHistory: async (customerPartId: number | string, body: { service_date: string; service_type: string; description: string; cost?: number }) => {
    const { data } = await http.post<{ message: string; history: PartServiceHistory }>(`/customer-parts/${customerPartId}/history`, body)
    return data
  },
  deleteServiceHistory: async (customerPartId: number | string, historyId: number | string) => {
    const { data } = await http.delete<{ message: string }>(
      `/customer-parts/${customerPartId}/history/${historyId}`,
    )
    return data
  },
}

export const inventoryApi = {
  summary: async () => {
    const { data } = await http.get<InventorySummary>('/inventory/summary')
    return data
  },
  logs: async (params?: {
    part_id?: number | string
    type?: InventoryMovementType | ''
    customer_id?: number | string
    user_id?: number | string
    q?: string
    from?: string
    to?: string
    page?: number
    per_page?: number
  }) => {
    const { data } = await http.get<{ data: InventoryLog[]; current_page: number; last_page: number; total: number }>(
      '/inventory/logs',
      { params },
    )
    return data
  },
  parts: async () => {
    const { data } = await http.get<Part[]>('/inventory/parts')
    return data
  },
  customers: async () => {
    const { data } = await http.get<Customer[]>('/inventory/customers')
    return data
  },
  createMovement: async (body: {
    part_id: number | string
    type: 'in' | 'out' | 'adjust'
    quantity: number
    note?: string
  }) => {
    const { data } = await http.post<{ message: string; log: InventoryLog; stock_quantity: number }>(
      '/inventory/movements',
      body,
    )
    return data
  },
}

export const smsApi = {
  sendPattern: async (body: { mobile: string; pattern_code: string; tokens: Record<string, any>; customer_id?: number | string }) => {
    const { data } = await http.post<{ message: string; success: boolean; message_id: string; is_sandbox: boolean }>('/sms/send-pattern', body)
    return data
  },
  getLogs: async (params?: { status?: string; q?: string; page?: number }) => {
    const { data } = await http.get<{ data: SmsLog[]; current_page: number; last_page: number; total: number }>('/sms/logs', { params })
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
  create: async (
    body:
      | FormData
      | {
          name: string
          email: string
          phone?: string
          password: string
          permissions?: string[]
          user_type?: UserType
          data_scope?: DataScope
          is_active?: boolean
        },
  ) => {
    const { data } = await http.post<{ message: string; user: User }>('/users', body)
    return data
  },
  update: async (
    id: number | string,
    body:
      | FormData
      | {
          name: string
          email: string
          phone?: string
          password?: string
          permissions?: string[]
          is_active?: boolean
          user_type?: UserType
          data_scope?: DataScope
        },
  ) => {
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
  toggleActive: async (userId: number | string) => {
    const { data } = await http.patch<{ message: string; is_active: boolean }>(`/users/${userId}/toggle-active`)
    return data
  },
  getAvailablePermissions: async () => {
    const { data } = await http.get<SystemPermission[]>('/permissions')
    return data
  },
  staffOptions: async () => {
    const { data } = await http.get<StaffOption[]>('/users/staff-options')
    return data
  },
  getCustomerAccess: async (userId: number | string) => {
    const { data } = await http.get<CustomerAccessGrant>(`/users/${userId}/customer-access`)
    return data
  },
  updateCustomerAccess: async (
    userId: number | string,
    body: { scope: DataScope; staff_ids?: number[]; customer_ids?: number[] },
  ) => {
    const { data } = await http.put<{ message: string; access: CustomerAccessGrant }>(
      `/users/${userId}/customer-access`,
      body,
    )
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
