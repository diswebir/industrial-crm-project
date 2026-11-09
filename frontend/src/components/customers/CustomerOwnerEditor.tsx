import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { http, usersApi } from '../../services/api'
import type { Customer } from '../../types'

export function CustomerOwnerEditor({ customer }: { customer: Customer }) {
  const qc = useQueryClient()
  const [owner, setOwner] = useState('')
  useEffect(() => setOwner(customer.created_by_user_id == null ? '' : String(customer.created_by_user_id)), [customer.created_by_user_id])
  const users = useQuery({ queryKey: ['users'], queryFn: usersApi.list })
  const mutation = useMutation({
    mutationFn: () => http.put(`/customers/${customer.id}/owner`, { created_by_user_id: owner ? Number(owner) : null }),
    onSuccess: () => {
      toast.success('مالک پرونده تغییر کرد')
      qc.invalidateQueries({ queryKey: ['customer', String(customer.id)] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'تغییر مالک پرونده ناموفق بود'),
  })
  return <div className="rounded-xl border border-base-300 p-3 flex flex-wrap gap-2 items-center text-sm">
    <label htmlFor="customer-owner" className="font-semibold">مالک پرونده</label>
    <select id="customer-owner" className="select select-bordered select-sm" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!users.data}>
      <option value="">نامشخص</option>
      {users.data?.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
    </select>
    <button className="btn btn-sm btn-outline" disabled={!users.data || mutation.isPending} onClick={() => mutation.mutate()}>ثبت مالک</button>
    {users.isError && <span className="text-error">دریافت کاربران ناموفق بود.</span>}
  </div>
}
