import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react'
import { cx, dateFa, dateShort, digits, safeDate } from '../../utils/format'
import { JALALI_MONTHS, WEEKDAYS_SHORT, fromJ, isSameDay, monthGrid, shiftMonth, toJ } from '../../utils/jalali'
import { toGregorian } from 'jalaali-js'

interface Props {
  value: string | null | undefined
  onChange: (val: string | null) => void
  placeholder?: string
  clearable?: boolean
  format?: 'date' | 'iso'
  className?: string
  /** حداقل و حداکثر تاریخ مجاز (YYYY-MM-DD یا هر قالب قابل پارس توسط Date) */
  minDate?: string | null
  maxDate?: string | null
  disabled?: boolean
  id?: string
  name?: string
}

const START_YEAR = 1380
const END_YEAR = 1420
const JALALI_YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i)

/** ارتفاع تقریبی پنل تقویم برای تصمیم‌گیری باز شدن به بالا یا پایین */
const PANEL_HEIGHT = 360
const PANEL_WIDTH = 288
const GAP = 6

/**
 * تقویم شمسی — تسک ۷
 *
 * پنل تقویم با `createPortal` مستقیماً زیر `document.body` رندر می‌شود و موقعیت آن
 * با `position: fixed` از روی `getBoundingClientRect()` دکمه محاسبه می‌گردد.
 * در نتیجه هیچ کانتینری با `overflow: hidden` / `overflow-x: auto` (مثل بدنه مودال،
 * جدول تخصیص دستگاه یا لایه اصلی) آن را نمی‌بُرد و همیشه بالای هدر جدول قرار می‌گیرد.
 * موقعیت با اسکرول، تغییر اندازه پنجره و بازچینش صفحه دوباره محاسبه می‌شود.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ شمسی...',
  clearable = true,
  format = 'date',
  className = '',
  minDate = null,
  maxDate = null,
  disabled = false,
  id,
  name,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Parse incoming value safely
  const selectedDate = safeDate(value)
  const today = new Date()
  const todayJ = toJ(today)
  const baseJ = selectedDate ? toJ(selectedDate) : todayJ

  const [view, setView] = useState({ jy: baseJ.jy, jm: baseJ.jm })

  // Keep view in sync when value changes externally
  useEffect(() => {
    if (selectedDate) {
      const j = toJ(selectedDate)
      setView({ jy: j.jy, jm: j.jm })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  /** نرمال‌سازی به نیمه‌شب روز تا مقایسه فقط بر اساس «روز» انجام شود */
  const dayOnly = (d: Date | null): Date | null =>
    d ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0) : null
  const minD = dayOnly(safeDate(minDate))
  const maxD = dayOnly(safeDate(maxDate))

  /** محاسبه موقعیت پنل نسبت به ویوپورت (همیشه داخل صفحه نگه داشته می‌شود) */
  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return

    const panelWidth = Math.min(PANEL_WIDTH, window.innerWidth - 16)
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const dropUp = spaceBelow < PANEL_HEIGHT + GAP && spaceAbove > spaceBelow

    // در حالت RTL پنل را با لبه شروع (راست) دکمه هم‌تراز می‌کنیم،
    // ولی هرگز اجازه نمی‌دهیم از لبه‌های ویوپورت بیرون بزند.
    const isRtl = getComputedStyle(document.documentElement).direction === 'rtl'
    const rawLeft = isRtl ? rect.right - panelWidth : rect.left
    const clampedLeft = Math.max(8, Math.min(rawLeft, window.innerWidth - panelWidth - 8))

    const top = dropUp
      ? Math.max(8, rect.top - PANEL_HEIGHT - GAP)
      : Math.min(rect.bottom + GAP, window.innerHeight - PANEL_HEIGHT - 8)

    setPos({ top, left: clampedLeft })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, updatePosition])

  // اسکرول هر کانتینری (نه فقط window) پنل را با دکمه همگام نگه می‌دارد
  useEffect(() => {
    if (!open) return

    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updatePosition)
    }

    schedule()
    window.addEventListener('resize', schedule, true)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('orientationchange', schedule, true)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule, true)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('orientationchange', schedule, true)
    }
  }, [open, updatePosition])

  // بستن با کلیک بیرون، Escape و اسکرول صفحه (بدون از دست رفتن مقدار)
  useEffect(() => {
    if (!open) return

    const handlePointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointer, true)
    document.addEventListener('touchstart', handlePointer, true)
    document.addEventListener('keydown', handleKey, true)
    return () => {
      document.removeEventListener('mousedown', handlePointer, true)
      document.removeEventListener('touchstart', handlePointer, true)
      document.removeEventListener('keydown', handleKey, true)
    }
  }, [open])

  const cells = monthGrid(view.jy, view.jm)
  const move = (delta: number) => setView((v) => shiftMonth(v.jy, v.jm, delta))

  const isDisabledDay = (jd: number): boolean => {
    if (!minD && !maxD) return false
    const cellDate = dayOnly(fromJ(view.jy, view.jm, jd))
    if (!cellDate) return false
    if (minD && cellDate < minD) return true
    if (maxD && cellDate > maxD) return true
    return false
  }

  const handleSelectDay = (jd: number) => {
    if (isDisabledDay(jd)) return
    const { gy, gm, gd } = toGregorian(view.jy, view.jm, jd)
    if (format === 'iso') {
      const d = new Date(gy, gm - 1, gd, 12, 0, 0)
      onChange(d.toISOString())
    } else {
      const ymd = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
      onChange(ymd)
    }
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleSelectToday = () => {
    setView({ jy: todayJ.jy, jm: todayJ.jm })
    if (!isDisabledDay(todayJ.jd)) handleSelectDay(todayJ.jd)
    else setOpen(false)
  }

  const toggle = () => {
    if (disabled) return
    setOpen((o) => !o)
  }

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            className="jalali-picker-portal"
            style={{ top: pos.top, left: pos.left, width: Math.min(PANEL_WIDTH, window.innerWidth - 16) }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="jalali-picker-panel" role="dialog" aria-label="انتخاب تاریخ شمسی">
              {/* Header Controls */}
              <div className="mb-2.5 flex items-center justify-between gap-1 border-b border-base-200 pb-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-circle"
                  onClick={() => move(-1)}
                  title="ماه قبل"
                  aria-label="ماه قبل"
                >
                  <ChevronRight className="size-4" />
                </button>

                {/* Quick Month & Year Selectors */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={view.jm}
                    onChange={(e) => setView((v) => ({ ...v, jm: Number(e.target.value) }))}
                    className="select select-bordered select-xs text-xs font-bold"
                    aria-label="ماه"
                  >
                    {JALALI_MONTHS.map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <select
                    value={view.jy}
                    onChange={(e) => setView((v) => ({ ...v, jy: Number(e.target.value) }))}
                    className="select select-bordered select-xs text-xs font-bold"
                    aria-label="سال"
                  >
                    {JALALI_YEARS.map((y) => (
                      <option key={y} value={y}>
                        {digits(y)}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-circle"
                  onClick={() => move(1)}
                  title="ماه بعد"
                  aria-label="ماه بعد"
                >
                  <ChevronLeft className="size-4" />
                </button>
              </div>

              {/* Weekday Names Header */}
              <div className="mb-1 grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS_SHORT.map((w) => (
                  <span key={w} className="py-0.5 text-[10px] font-bold text-base-content/60">
                    {w}
                  </span>
                ))}
              </div>

              {/* Month Grid Cells */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {cells.map((jd, i) => {
                  if (!jd) return <span key={`empty-${i}`} className="size-8" />
                  const cellDate = fromJ(view.jy, view.jm, jd, 12)
                  const isSel = selectedDate ? isSameDay(cellDate, selectedDate) : false
                  const isToday = isSameDay(cellDate, today)
                  const off = isDisabledDay(jd)

                  return (
                    <button
                      type="button"
                      key={jd}
                      onClick={() => handleSelectDay(jd)}
                      disabled={off}
                      title={off ? 'خارج از بازه مجاز' : undefined}
                      className={cx(
                        'flex size-8 cursor-pointer items-center justify-center rounded-lg text-xs font-semibold transition-all',
                        off && 'cursor-not-allowed opacity-30',
                        isSel
                          ? 'bg-primary font-bold text-primary-content shadow-xs'
                          : isToday
                            ? 'border border-primary bg-primary/10 font-bold text-primary hover:bg-primary/20'
                            : 'text-base-content/80 hover:bg-base-200',
                      )}
                    >
                      {digits(jd)}
                    </button>
                  )
                })}
              </div>

              {/* Footer Shortcuts */}
              <div className="mt-2.5 flex items-center justify-between border-t border-base-200 pt-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectToday}
                  className="btn btn-ghost btn-xs gap-1 font-bold text-primary"
                >
                  <RotateCcw className="size-3" /> امروز ({digits(`${todayJ.jy}/${todayJ.jm}/${todayJ.jd}`)})
                </button>

                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(null)
                      setOpen(false)
                    }}
                    className="btn btn-ghost btn-xs font-medium text-error"
                  >
                    پاک کردن
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div className={cx('relative w-full', className)}>
      {/* Input button */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          id={id}
          name={name}
          disabled={disabled}
          className={cx(
            'input input-bordered flex w-full cursor-pointer items-center justify-between text-start transition-colors hover:border-primary/50',
            open && 'border-primary ring-2 ring-primary/20',
            disabled && 'cursor-not-allowed opacity-60',
          )}
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <CalendarDays className="size-4 shrink-0 text-primary" />
            {selectedDate ? (
              <span className="truncate text-xs font-semibold text-base-content sm:text-sm">
                {dateFa(selectedDate)}
                <span className="ms-2 font-mono text-xs font-normal text-base-content/60">
                  ({dateShort(selectedDate)})
                </span>
              </span>
            ) : (
              <span className="text-xs text-base-content/40 sm:text-sm">{placeholder}</span>
            )}
          </div>
        </button>

        {clearable && selectedDate && !disabled && (
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle absolute end-2 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-error"
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
            title="پاک کردن تاریخ"
            aria-label="پاک کردن تاریخ"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {panel}
    </div>
  )
}
