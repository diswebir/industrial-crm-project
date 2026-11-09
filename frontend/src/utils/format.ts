/** Locale-aware formatting helpers: Persian digits, Toman, Jalali dates. */

const nf = new Intl.NumberFormat('fa-IR')
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

export const digits = (v: string | number) => String(v).replace(/\d/g, (d) => PERSIAN_DIGITS[+d])

/** Converts Persian (۰-۹) and Arabic (٠-٩) numerals to standard ASCII digits (0-9). */
export function toEnDigits(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
}

export const num = (n: number) => nf.format(n)
export const toman = (n: number) => `${nf.format(Math.round(n))} تومان`

/** 1_250_000_000 → "۱٫۲۵ میلیارد" */
export function compact(n: number): string {
  const abs = Math.abs(n)
  const f = (v: number) => nf.format(Math.round(v * 10) / 10)
  if (abs >= 1e12) return `${f(n / 1e12)} هزار میلیارد`
  if (abs >= 1e9) return `${f(n / 1e9)} میلیارد`
  if (abs >= 1e6) return `${f(n / 1e6)} میلیون`
  if (abs >= 1e3) return `${f(n / 1e3)} هزار`
  return nf.format(n)
}
export const compactToman = (n: number) => `${compact(n)} تومان`

export function phoneFa(p: string): string {
  return digits(p.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3'))
}

export function safeDate(val: string | Date | null | undefined): Date | null {
  if (!val) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val
  if (typeof val === 'string') {
    const s = val.trim()
    if (!s) return null
    // If standard YYYY-MM-DD
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (ymd) {
      const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0)
      return isNaN(d.getTime()) ? null : d
    }
    // If standard YYYY-MM-DD HH:mm(:ss)
    const d = new Date(s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

const dateLong = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' })
const dateNum = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long' })

export const dateFa = (iso: string | Date | null | undefined) => {
  const d = safeDate(iso)
  return d ? dateLong.format(d) : '—'
}

export const dateShort = (iso: string | Date | null | undefined) => {
  const d = safeDate(iso)
  return d ? dateNum.format(d) : '—'
}

export const timeFa = (iso: string | Date | null | undefined) => {
  const d = safeDate(iso)
  return d ? timeFmt.format(d) : '—'
}

export const dateTimeFa = (iso: string | Date | null | undefined) => {
  const d = safeDate(iso)
  return d ? `${dateShort(d)} - ${timeFa(d)}` : '—'
}

export const weekdayFa = (iso: string | Date | null | undefined) => {
  const d = safeDate(iso)
  return d ? weekdayFmt.format(d) : '—'
}

export function relativeFa(iso: string | Date | null | undefined, now = Date.now()): string {
  const d = safeDate(iso)
  if (!d) return '—'
  const diff = now - d.getTime()
  const future = diff < 0
  const s = Math.abs(diff) / 1000
  const suffix = future ? 'دیگر' : 'پیش'
  if (s < 60) return 'همین الان'
  const m = Math.floor(s / 60)
  if (m < 60) return `${num(m)} دقیقه ${suffix}`
  const h = Math.floor(m / 60)
  if (h < 24) return `${num(h)} ساعت ${suffix}`
  const day = Math.floor(h / 24)
  if (day < 30) return `${num(day)} روز ${suffix}`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${num(mo)} ماه ${suffix}`
  return `${num(Math.floor(mo / 12))} سال ${suffix}`
}

export const fullName = (c: {
  firstName?: string | null
  lastName?: string | null
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
}) => {
  const person = `${c.first_name ?? c.firstName ?? ''} ${c.last_name ?? c.lastName ?? ''}`.trim()
  // برای مشتری حقوقی که نام شخص ندارد، نام شرکت نمایش داده می‌شود.
  return person || (c.company_name ?? '').trim()
}

/** Stable pseudo-random hue from a string, used for avatar colours. */
export function hueFrom(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360
  return h
}
