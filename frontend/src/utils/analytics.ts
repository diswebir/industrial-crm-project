import type { Customer, Product, Sale } from '../types'
import { monthKey, monthLabelFromKey } from './jalali'

const DAY = 86_400_000

/** Only paid invoices count as revenue. */
export const paid = (sales: Sale[]) => sales.filter((s) => s.status === 'paid')
export const sum = (sales: Sale[]) => sales.reduce((t, s) => t + s.total, 0)

/** Sales whose date falls in [now - fromDays, now - toDays). */
export function inWindow(sales: Sale[], fromDays: number, toDays = 0, now = Date.now()) {
  return sales.filter((s) => {
    const t = new Date(s.date).getTime()
    return t >= now - fromDays * DAY && t < now - toDays * DAY
  })
}

export const pctChange = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100)

export interface MonthPoint { key: number; label: string; revenue: number; orders: number; profit: number }

/** Revenue/orders per Jalali month for the last `months` months (oldest → newest). */
export function monthlySeries(sales: Sale[], products: Map<string, Product>, months = 12): MonthPoint[] {
  const current = monthKey(new Date())
  const points = new Map<number, MonthPoint>()
  for (let i = months - 1; i >= 0; i--) {
    const key = current - i
    points.set(key, { key, label: monthLabelFromKey(key), revenue: 0, orders: 0, profit: 0 })
  }
  for (const s of paid(sales)) {
    const p = points.get(monthKey(new Date(s.date)))
    if (!p) continue
    p.revenue += s.total
    p.orders += 1
    const cost = s.items.reduce((t, it) => t + it.quantity * (products.get(it.productId)?.cost ?? it.price * 0.8), 0)
    p.profit += s.total - cost
  }
  return [...points.values()]
}

export function revenueBy<T extends string>(sales: Sale[], keyOf: (s: Sale, item: Sale['items'][number]) => T | undefined) {
  const m = new Map<T, number>()
  for (const s of paid(sales)) {
    for (const it of s.items) {
      const k = keyOf(s, it)
      if (!k) continue
      m.set(k, (m.get(k) ?? 0) + it.quantity * it.price)
    }
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

export const revenueByCategory = (sales: Sale[], products: Map<string, Product>) =>
  revenueBy(sales, (_, it) => products.get(it.productId)?.category)

export const revenueByCity = (sales: Sale[], customers: Map<string, Customer>) =>
  revenueBy(sales, (s) => customers.get(s.customerId)?.city ?? undefined)

export function topProducts(sales: Sale[], n = 6) {
  const m = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const s of paid(sales)) {
    for (const it of s.items) {
      const cur = m.get(it.productId) ?? { name: it.name, qty: 0, revenue: 0 }
      cur.qty += it.quantity
      cur.revenue += it.quantity * it.price
      m.set(it.productId, cur)
    }
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, n)
}

export function topCustomers(sales: Sale[], customers: Map<string, Customer>, n = 5) {
  const m = new Map<string, number>()
  for (const s of paid(sales)) m.set(s.customerId, (m.get(s.customerId) ?? 0) + s.total)
  return [...m.entries()]
    .map(([id, total]) => ({ customer: customers.get(id), total }))
    .filter((x): x is { customer: Customer; total: number } => !!x.customer)
    .sort((a, b) => b.total - a.total)
    .slice(0, n)
}

/** Shorten long product names for chart axes. */
export const short = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n)}…` : s)
