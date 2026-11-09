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
}

const START_YEAR = 1380
const END_YEAR = 1420
const JALALI_YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i)

/** عرض پاپ‌آپ تقویم (px) */
const POPUP_WIDTH = 300
/** ارتفاع تقریبی پاپ‌آپ (px) برای تصمیم‌گیری باز شدن به بالا/پایین */
const POPUP_HEIGHT = 340
const VIEWPORT_PADDING = 8

type Position = { top: number; left: number; placement: 'top' | 'bottom' }

/**
 * تقویم شمسی با رندر پاپ‌آپ در `document.body` (Portal) و موقعیت `fixed`.
 *
 * این پیاده‌سازی مشکل تسک ۷ را حل می‌کند: کانتینرهایی مانند `.modal-box` دارای
 * `overflow-y: auto` هستند و هر عنصر `absolute` داخل آن‌ها بریده می‌شود. با Portal،
 * تقویم خارج از هر کانتینر overflow ساخته می‌شود و با z-index بسیار بالا روی هدر جدول،
 * فوتر و نوشته‌ها قرار می‌گیرد. موقعیت با scroll/resize به‌روزرسانی می‌شود.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ شمسی...',
  clearable = true,
  format = 'date',
  className = '',
}: Props) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<Position>({ top: 0, left: 0, placement: 'bottom' })
  // در مودال‌های Native <dialog>، لایه Top Layer فقط فرزندان همان dialog را روی backdrop نشان می‌دهد؛
  // بنابراین پاپ‌آپ را داخل نزدیک‌ترین <dialog> (یا body در صفحات عادی) رندر می‌کنیم.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const host = triggerRef.current?.closest('dialog')
    setPortalTarget((host as HTMLElement | null) ?? document.body)
  }, [])

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
  }, [value])

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // در RTL پاپ‌آپ به لبه راست فیلد تراز می‌شود.
    const width = Math.min(POPUP_WIDTH, viewportWidth - VIEWPORT_PADDING * 2)
    let left = rect.right - width
    left = Math.max(VIEWPORT_PADDING, Math.min(left, viewportWidth - width - VIEWPORT_PADDING))

    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top
    const placement: Position['placement'] =
      spaceBelow < POPUP_HEIGHT && spaceAbove > spaceBelow ? 'top' : 'bottom'

    const top =
      placement === 'bottom'
        ? rect.bottom + 6
        : Math.max(VIEWPORT_PADDING, rect.top - POPUP_HEIGHT - 6)

    setPosition({ top, left, placement })
  }, [])

  // Position on open and keep it in sync while scrolling/resizing
  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    const handleScrollOrResize = () => updatePosition()

    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open, updatePosition])

  // Close when clicking outside both the trigger and the portal popup
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Close with Escape (useful inside <dialog> modals)
  useEffect(() => {
    if (!open) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [open])

  const cells = monthGrid(view.jy, view.jm)
  const move = (delta: number) => setView((v) => shiftMonth(v.jy, v.jm, delta))

  /** تاریخ انتخاب‌شده را با فرمت درخواستی به والد برمی‌گرداند. */
  const emitDate = (jy: number, jm: number, jd: number) => {
    const { gy, gm, gd } = toGregorian(jy, jm, jd)
    if (format === 'iso') {
      // ساعت ۱۲ ظهر برای جلوگیری از جابه‌جایی روز در تبدیل منطقه زمانی.
      const d = new Date(gy, gm - 1, gd, 12, 0, 0)
      onChange(d.toISOString())
    } else {
      const ymd = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
      onChange(ymd)
    }
    setOpen(false)
  }

  const handleSelectDay = (jd: number) => emitDate(view.jy, view.jm, jd)

  const handleSelectToday = () => {
    // مهم: از تاریخ امروز استفاده می‌کنیم، نه ماهِ در حال نمایش؛ وگرنه اگر کاربر
    // ماه را عوض کرده باشد، «امروز» تاریخ اشتباهی ثبت می‌کرد.
    setView({ jy: todayJ.jy, jm: todayJ.jm })
    emitDate(todayJ.jy, todayJ.jm, todayJ.jd)
  }

  const popup =
    open &&
    portalTarget &&
    createPortal(
      <div
        ref={popupRef}
        role="dialog"
        aria-label="تقویم شمسی"
        data-crm-datepicker="true"
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: Math.min(POPUP_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2),
          zIndex: 2147483000,
        }}
        className={cx(
          'rounded-2xl border border-base-300 bg-base-100 p-3 shadow-2xl',
          'animate-in fade-in zoom-in-95 duration-150',
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header Controls */}
        <div className="mb-2.5 flex items-center justify-between gap-1 pb-2 border-b border-base-200">
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle"
            onClick={() => move(-1)}
            title="ماه قبل"
          >
            <ChevronRight className="size-4" />
          </button>

          {/* Quick Month & Year Selectors */}
          <div className="flex items-center gap-1.5">
            <select
              value={view.jm}
              onChange={(e) => setView((v) => ({ ...v, jm: Number(e.target.value) }))}
              className="select select-bordered select-xs font-bold text-xs"
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
              className="select select-bordered select-xs font-bold text-xs"
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
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>

        {/* Weekday Names Header */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
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
            const isSel = selectedDate && isSameDay(cellDate, selectedDate)
            const isToday = isSameDay(cellDate, today)

            return (
              <button
                type="button"
                key={jd}
                onClick={() => handleSelectDay(jd)}
                className={cx(
                  'size-8 rounded-lg text-xs font-semibold flex items-center justify-center transition-all cursor-pointer',
                  isSel
                    ? 'bg-primary text-primary-content font-bold shadow-xs'
                    : isToday
                    ? 'border border-primary text-primary font-bold bg-primary/10 hover:bg-primary/20'
                    : 'hover:bg-base-200 text-base-content/80',
                )}
              >
                {digits(jd)}
              </button>
            )
          })}
        </div>

        {/* Footer Shortcuts */}
        <div className="mt-2.5 pt-2 border-t border-base-200 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={handleSelectToday}
            className="btn btn-ghost btn-xs text-primary font-bold gap-1"
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
              className="btn btn-ghost btn-xs text-error font-medium"
            >
              پاک کردن
            </button>
          )}
        </div>
      </div>,
      portalTarget,
    )

  return (
    <div ref={triggerRef} className={cx('relative w-full', className)}>
      {/* Input button */}
      <div className="relative">
        <button
          type="button"
          className={cx(
            'input input-bordered w-full flex items-center justify-between text-start cursor-pointer hover:border-primary/50 transition-colors',
            open && 'border-primary ring-2 ring-primary/20',
          )}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <CalendarDays className="size-4 shrink-0 text-primary" />
            {selectedDate ? (
              <span className="font-semibold text-xs sm:text-sm text-base-content truncate">
                {dateFa(selectedDate)}
                <span className="ms-2 font-mono text-xs text-base-content/60 font-normal">
                  ({dateShort(selectedDate)})
                </span>
              </span>
            ) : (
              <span className="text-xs sm:text-sm text-base-content/40">{placeholder}</span>
            )}
          </div>
        </button>

        {clearable && selectedDate && (
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle absolute end-2 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-error"
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
            title="پاک کردن تاریخ"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {popup}
    </div>
  )
}
