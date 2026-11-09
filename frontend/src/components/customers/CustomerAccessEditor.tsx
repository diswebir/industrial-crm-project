import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { http } from '../../services/api'

type Person = { id: number; name: string }
type CustomerOption = { id: number; full_name?: string; first_name: string | null; last_name: string | null; company_name: string | null }
type Scope = { all: boolean; owner_user_ids: number[]; customer_ids: number[]; selected_customers: CustomerOption[] }
type Options = { owners: Person[]; customers: CustomerOption[] }
const customerName = (c: CustomerOption) => c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || `#${c.id}`

export function CustomerAccessEditor({ userId }: { userId: string }) {
  const qc = useQueryClient()
  const [all, setAll] = useState(false)
  const [owners, setOwners] = useState<number[]>([])
  const [customers, setCustomers] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [knownCustomers, setKnownCustomers] = useState<CustomerOption[]>([])
  const scope = useQuery({ queryKey: ['customer-access', userId], queryFn: async () => (await http.get<Scope>(`/users/${userId}/customer-access`)).data })
  const options = useQuery({ queryKey: ['customer-access-options', userId, search], queryFn: async () => (await http.get<Options>(`/users/${userId}/customer-access/options`, { params: { q: search } })).data })
  useEffect(() => {
    if (scope.data) {
      setAll(scope.data.all)
      setOwners(scope.data.owner_user_ids.map(Number))
      setCustomers(scope.data.customer_ids.map(Number))
    }
  }, [scope.data])
  useEffect(() => {
    if (options.data) setKnownCustomers((previous) => [...previous, ...options.data!.customers].filter((item, index, arr) => arr.findIndex((c) => c.id === item.id) === index))
  }, [options.data])
  const save = useMutation({
    mutationFn: () => http.put(`/users/${userId}/customer-access`, { all, owner_user_ids: owners, customer_ids: customers }),
    onSuccess: () => { toast.success('محدوده مشتریان ذخیره شد'); qc.invalidateQueries({ queryKey: ['customer-access', userId] }) },
    onError: (e: any) => toast.error(e.response?.data?.message || 'ذخیره محدوده دسترسی ناموفق بود'),
  })
  const toggle = (items: number[], value: number) => items.includes(value) ? items.filter((id) => id !== value) : [...items, value]
  const choices = [...(scope.data?.selected_customers ?? []), ...knownCustomers.filter((item) => customers.includes(item.id)), ...(options.data?.customers ?? [])].filter((item, index, arr) => arr.findIndex((c) => c.id === item.id) === index)
  return <section className="rounded-2xl border border-base-300 bg-base-100 p-5 space-y-4">
    <h2 className="font-bold">محدوده مشتریان کارمند</h2>
    <p className="text-sm text-base-content/70">کاربر به صورت پیش‌فرض به مشتریان ثبت‌شده توسط خودش دسترسی دارد. استثناها در این بخش تنظیم می‌شوند.</p>
    {(scope.isError || options.isError) && <p className="text-error">دریافت محدوده یا فهرست گزینه‌ها ناموفق بود.</p>}
    <label className="flex gap-2 items-center"><input className="checkbox checkbox-sm" type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> دسترسی به همه مشتریان</label>
    <div><h3 className="font-semibold mb-2">مشتریان کارمندان انتخابی</h3><div className="max-h-40 overflow-auto space-y-1">{options.data?.owners.map((owner) => <label key={owner.id} className="flex gap-2"><input type="checkbox" checked={owners.includes(owner.id)} onChange={() => setOwners(toggle(owners, owner.id))} />{owner.name}</label>)}</div></div>
    <div><h3 className="font-semibold mb-2">مشتریان تکی</h3><input className="input input-bordered w-full" placeholder="جستجوی مشتری" value={search} onChange={(e) => setSearch(e.target.value)} /><div className="max-h-48 overflow-auto space-y-1 mt-2">{choices.map((customer) => <label key={customer.id} className="flex gap-2"><input type="checkbox" checked={customers.includes(customer.id)} onChange={() => setCustomers(toggle(customers, customer.id))} />{customerName(customer)}</label>)}</div></div>
    <button type="button" className="btn btn-primary btn-sm" disabled={!scope.data || save.isPending} onClick={() => save.mutate()}>ذخیره محدوده مشتریان</button>
  </section>
}
