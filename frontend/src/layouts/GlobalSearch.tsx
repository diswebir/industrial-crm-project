import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Cpu, Search, User, X } from 'lucide-react'
import { customerApi, partApi } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'
import { Avatar } from '../components/ui/Avatar'

export function GlobalSearch() {
  const [q, setQ] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const nav = useNavigate()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const canViewCustomers = hasPermission('customers.view')
  const canViewParts = hasPermission('parts.view')

  // جستجوی سراسری با هر کلید فوراً به سرور نمی‌رود؛ ۳۰۰ میلی‌ثانیه صبر می‌کنیم.
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(q.trim()), 300)
    return () => clearTimeout(timer)
  }, [q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { data: customerData, isFetching: customersLoading } = useQuery({
    queryKey: ['global-search-customers', searchTerm],
    queryFn: () => customerApi.list({ q: searchTerm, per_page: 5 }),
    enabled: canViewCustomers && searchTerm.length >= 2,
    staleTime: 1000 * 30,
  })

  const { data: partsData = [], isFetching: partsLoading } = useQuery({
    queryKey: ['global-search-parts', searchTerm],
    queryFn: () => partApi.list({ q: searchTerm }),
    enabled: canViewParts && searchTerm.length >= 2,
    staleTime: 1000 * 30,
  })

  const customers = canViewCustomers ? customerData?.data || [] : []
  const parts = canViewParts ? partsData.slice(0, 5) : []
  const isLoading = customersLoading || partsLoading

  const go = (path: string) => {
    setOpen(false)
    setQ('')
    nav(path)
  }

  const hasSearched = searchTerm.length >= 2
  const empty = hasSearched && !isLoading && customers.length === 0 && parts.length === 0

  if (!canViewCustomers && !canViewParts) return null

  return (
    <div className="relative w-full max-w-xs sm:max-w-sm lg:max-w-md min-w-0">
      <label className="input input-sm h-10 w-full bg-base-200/80 border-slate-200 dark:border-slate-800 focus-within:border-primary focus-within:bg-base-100 flex items-center gap-2">
        <Search className="size-4 text-base-content/50" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="جستجوی مشتریان یا دستگاه‌ها..."
          aria-label="جستجوی سراسری"
          className="grow text-xs"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="text-base-content/40 hover:text-base-content"
          >
            <X className="size-3.5" />
          </button>
        )}
        <kbd className="kbd kbd-sm hidden sm:inline-flex text-[10px]">/</kbd>
      </label>

      {open && hasSearched && (
        <div className="absolute inset-x-0 top-12 z-50 max-h-96 overflow-y-auto rounded-2xl border border-base-300 bg-base-100 p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
          {isLoading && (
            <div className="p-4 text-center text-xs text-base-content/60 flex items-center justify-center gap-2">
              <span className="loading loading-spinner loading-xs text-primary" />
              در حال جستجو در پایگاه‌داده...
            </div>
          )}

          {empty && (
            <p className="p-4 text-center text-xs text-base-content/60">
              موردی با عبارت «{searchTerm}» یافت نشد
            </p>
          )}

          {customers.length > 0 && (
            <div className="mb-2">
              <p className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-base-content/50 uppercase">
                <User className="size-3.5 text-primary" /> مشتریان
              </p>
              <div className="space-y-0.5">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(`/customers/${c.id}`)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-xs hover:bg-base-200 transition-colors"
                  >
                    <Avatar name={c.full_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base-content truncate">
                        {c.full_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()}
                      </p>
                      <p className="text-[10px] text-base-content/50 font-mono ltr-text">{c.mobile || 'بدون شماره همراه'}</p>
                    </div>
                    <span className="badge badge-xs bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                      {c.customer_type === 'effective' ? 'بالفعل' : 'بالقوه'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {parts.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-base-content/50 uppercase">
                <Cpu className="size-3.5 text-secondary" /> دستگاه‌ها و کاتالوگ
              </p>
              <div className="space-y-0.5">
                {parts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(`/parts?q=${encodeURIComponent(p.code)}`)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-xs hover:bg-base-200 transition-colors"
                  >
                    <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800 shrink-0">
                      <Cpu className="size-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base-content truncate">{p.name}</p>
                      <p className="text-[10px] text-base-content/50 font-mono">کد: {p.code}</p>
                    </div>
                    <span className="badge badge-xs badge-ghost">
                      سرویس {p.periodic_service_months} ماهه
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
