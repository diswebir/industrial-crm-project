import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Can } from '../components/common/Can'
import { http, partApi } from '../services/api'
import { dateTimeFa, num, toEnDigits } from '../utils/format'
import type { Part } from '../types'

type Log = {
  id: number
  part?: Part
  type: string
  quantity: number
  balance_before: number
  balance_after: number
  user_name: string | null
  customer_id: number | null
  customer_name: string | null
  customer?: { id: number; deleted_at?: string | null } | null
  note: string | null
  created_at: string
}
type LogPage = { data: Log[]; current_page: number; last_page: number }
const labels: Record<string, string> = {
  stock_in: 'ورود به انبار', stock_out: 'خروج از انبار',
  assignment_out: 'خروج برای تخصیص', assignment_return: 'برگشت به انبار',
}

export default function Inventory() {
  const qc = useQueryClient()
  const [partId, setPartId] = useState('')
  const [type, setType] = useState<'in' | 'out'>('in')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [page, setPage] = useState(1)
  const parts = useQuery({ queryKey: ['parts-catalog'], queryFn: () => partApi.list() })
  const logs = useQuery({
    queryKey: ['inventory-logs', page],
    queryFn: async () => (await http.get<LogPage>('/inventory/logs', { params: { page } })).data,
  })
  const mutation = useMutation({
    mutationFn: () => http.post(`/parts/${partId}/stock`, { type, quantity: Number(quantity), note: note || null }),
    onSuccess: () => {
      toast.success('تغییر موجودی ثبت شد')
      setQuantity('')
      setNote('')
      qc.invalidateQueries({ queryKey: ['parts-catalog'] })
      qc.invalidateQueries({ queryKey: ['inventory-logs'] })
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'ثبت تغییر موجودی ناموفق بود'),
  })

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">انبار دستگاه‌ها</h1>
      <p className="text-sm text-base-content/70">موجودی افتتاحیه دستگاه‌های قبلی صفر است؛ پس از شمارش واقعی، ورود موجودی را ثبت کنید.</p>
      <Can permission="parts.manage">
        <form className="rounded-xl border border-base-300 bg-base-100 p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => {
          e.preventDefault()
          if (!partId || !/^[1-9]\d*$/.test(quantity) || Number(quantity) > 2147483647) {
            toast.error('دستگاه و تعداد صحیح و مثبت را وارد کنید')
            return
          }
          mutation.mutate()
        }}>
          <label className="text-sm">دستگاه
            <select className="select select-bordered w-full mt-1" value={partId} onChange={(e) => setPartId(e.target.value)} required>
              <option value="">انتخاب دستگاه</option>
              {parts.data?.map((part) => <option key={part.id} value={part.id}>{part.name} — موجودی {num(part.stock_quantity)}</option>)}
            </select>
          </label>
          <label className="text-sm">نوع عملیات
            <select className="select select-bordered w-full mt-1" value={type} onChange={(e) => setType(e.target.value as 'in' | 'out')}>
              <option value="in">ورود</option><option value="out">خروج دستی</option>
            </select>
          </label>
          <label className="text-sm">تعداد
            <input className="input input-bordered w-full mt-1" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(toEnDigits(e.target.value))} required />
          </label>
          <label className="text-sm">توضیح
            <input className="input input-bordered w-full mt-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </label>
          <button className="btn btn-primary self-end" disabled={mutation.isPending}>ثبت عملیات</button>
        </form>
      </Can>
      {parts.isError && <p className="text-error">خطا در دریافت فهرست دستگاه‌ها</p>}
      <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100">
        <table className="table table-sm">
          <thead><tr><th>دستگاه</th><th>موجودی فعلی</th></tr></thead>
          <tbody>{parts.data?.map((part) => <tr key={part.id}><td>{part.name} ({part.code})</td><td>{num(part.stock_quantity)}</td></tr>)}</tbody>
        </table>
      </div>
      <h2 className="font-bold">تاریخچه ورود و خروج</h2>
      {logs.isError && <p className="text-error">خطا در دریافت تاریخچه انبار</p>}
      {logs.isLoading && <p>در حال دریافت تاریخچه…</p>}
      <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100">
        <table className="table table-sm">
          <thead><tr><th>زمان</th><th>دستگاه</th><th>نوع</th><th>تعداد</th><th>قبل / بعد</th><th>ثبت‌کننده</th><th>مشتری</th><th>توضیح</th></tr></thead>
          <tbody>{logs.data?.data.map((log) => <tr key={log.id}>
            <td>{dateTimeFa(log.created_at)}</td><td>{log.part?.name ?? '—'}</td><td>{labels[log.type] ?? log.type}</td>
            <td>{num(log.quantity)}</td><td>{num(log.balance_before)} / {num(log.balance_after)}</td><td>{log.user_name ?? '—'}</td>
            <td>{log.customer_id && log.customer && !log.customer.deleted_at ? <Link className="link link-primary" to={`/customers/${log.customer_id}`}>{log.customer_name || 'مشاهده مشتری'}</Link> : (log.customer_name || '—')}</td>
            <td>{log.note || '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {logs.data && <div className="flex gap-2 items-center"><button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button><span>{num(page)} از {num(logs.data.last_page)}</span><button className="btn btn-sm" disabled={page >= logs.data.last_page} onClick={() => setPage(page + 1)}>بعدی</button></div>}
    </div>
  )
}
