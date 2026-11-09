import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

export function DatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ شمسی...',
  clearable = true,
  format = 'date',
  className = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 8, left: 8 })

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

  // A portal escapes clipping ancestors; native dialogs require the popup to
  // stay inside the dialog's top layer rather than being appended to body.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const anchor = containerRef.current?.getBoundingClientRect()
      const popup = popupRef.current?.getBoundingClientRect()
      if (!anchor || !popup) return
      const margin = 8
      const below = anchor.bottom + 6
      const top = below + popup.height <= window.innerHeight - margin
        ? below : Math.max(margin, anchor.top - popup.height - 6)
      const left = Math.max(margin, Math.min(anchor.right - popup.width, window.innerWidth - popup.width - margin))
      setPosition({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node) && !popupRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const cells = monthGrid(view.jy, view.jm)
  const move = (delta: number) => setView((v) => shiftMonth(v.jy, v.jm, delta))

  const handleSelectDay = (jd: number, jy = view.jy, jm = view.jm) => {
    const { gy, gm, gd } = toGregorian(jy, jm, jd)
    if (format === 'iso') {
      const d = new Date(gy, gm - 1, gd, 12, 0, 0)
      onChange(d.toISOString())
    } else {
      const ymd = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
      onChange(ymd)
    }
    setOpen(false)
  }

  const handleSelectToday = () => {
    setView({ jy: todayJ.jy, jm: todayJ.jm })
    handleSelectDay(todayJ.jd, todayJ.jy, todayJ.jm)
  }

  return (
    <div ref={containerRef} className={cx('relative w-full', open ? 'z-[9999]' : 'z-auto', className)}>
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

      {/* Jalali Calendar Dropdown - Compact floating popup over all layers */}
      {open && createPortal(
        <div
          ref={popupRef}
          dir="rtl"
          style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 99999 }}
          className="w-72 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] overflow-auto rounded-2xl border border-base-300 bg-base-100 p-3 shadow-2xl"
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
                className="select select-bordered select-xs font-bold font-mono text-xs"
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
        containerRef.current?.closest('dialog[open]') ?? document.body,
      )}
    </div>
  )
}
