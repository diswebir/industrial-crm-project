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
  list: async (params?: { customer_type?: string; q?: string; page?: number; per_page?: number }) => {
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
  assignPart: async (customerId: number | string, body: { part_id: number | string; serial_number: string; quantity: number; invoice_amount?: string | null; invoice_number?: string | null; installation_date?: string; notes?: string }) => {
    const { data } = await http.post<{ message: string; customer_part: CustomerPart; customer_type: string }>(`/customers/${customerId}/parts`, body)
    return data
  },
  updateAssignment: async (id: number | string, body: { serial_number: string; quantity: number; return_confirmed?: boolean; invoice_amount?: string | null; invoice_number?: string | null; installation_date?: string | null; notes?: string }) => {
    const { data } = await http.put<{ message: string; customer_part: CustomerPart }>(`/customer-parts/${id}`, body)
    return data
  },
  deleteAssignment: async (id: number | string) => {
    const { data } = await http.delete<{ message: string }>(`/customer-parts/${id}`)
    return data
  },
  addServiceHistory: async (customerPartId: number | string, body: { service_date: string; service_type: string; description: string; cost?: number }) => {
    const { data } = await http.post<{ message: string; history: PartServiceHistory }>(`/customer-parts/${customerPartId}/history`, body)
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
  create: async (body: FormData | { name: string; email: string; phone?: string; password: string; permissions?: string[] }) => {
    const { data } = await http.post<{ message: string; user: User }>('/users', body)
    return data
  },
  update: async (id: number | string, body: FormData | { name: string; email: string; phone?: string; password?: string; permissions?: string[]; is_active?: boolean }) => {
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
