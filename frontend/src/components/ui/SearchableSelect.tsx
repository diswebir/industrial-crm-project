import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cx } from '../../utils/format'

export interface SelectOption {
  value: string
  label: string
  hint?: string
  /** گزینه غیرقابل انتخاب (مثلاً دستگاه بدون موجودی انبار) */
  disabled?: boolean
  /** برچسب کوتاه سمت چپ گزینه (مثلاً «ناموجود») */
  badge?: string
}

interface SearchableSelectProps {
  label?: string
  value?: string
  onChange: (value: string) => void
  options: (string | SelectOption)[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  required?: boolean
  error?: string
  hint?: string
  className?: string
  allowClear?: boolean
}

export function SearchableSelect({
  label,
  value = '',
  onChange,
  options,
  placeholder = 'انتخاب کنید...',
  searchPlaceholder = 'جستجو در موارد...',
  disabled = false,
  required = false,
  error,
  hint,
  className,
  allowClear = true,
}: SearchableSelectProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Normalize options to { value, label, hint }
  const normalizedOptions: SelectOption[] = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt }
      }
      return opt
    })
  }, [options])

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return normalizedOptions
    return normalizedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        opt.hint?.toLowerCase().includes(q),
    )
  }, [normalizedOptions, query])

  const selectedOption = normalizedOptions.find((opt) => opt.value === value)

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Keyboard escape
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const handleSelect = (val: string) => {
    onChange(val)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }

  return (
    <div className={cx('form-control w-full space-y-1', className)} ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label htmlFor={id} className="label py-0">
          <span className="label-text text-xs font-bold text-base-content/80">
            {label}
            {required && <span className="text-error ms-1">*</span>}
          </span>
        </label>
      )}

      <div className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((prev) => !prev)}
          className={cx(
            'input input-bordered w-full flex items-center justify-between text-start text-sm transition-all focus:outline-none focus:border-primary',
            disabled && 'input-disabled cursor-not-allowed opacity-60',
            error ? 'border-error text-error' : 'border-base-300',
            open && 'border-primary ring-2 ring-primary/20',
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={cx('truncate', !selectedOption && 'text-base-content/40')}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>

          <div className="flex items-center gap-1 shrink-0 ms-2">
            {allowClear && selectedOption && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                className="p-0.5 rounded-full hover:bg-base-300/60 text-base-content/50 hover:text-base-content transition-colors"
                title="پاک کردن"
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronDown className={cx('size-4 text-base-content/50 transition-transform duration-200', open && 'rotate-180')} />
          </div>
        </button>

        {/* Dropdown Menu */}
        {open && (
          <div className="absolute top-full z-[60] mt-1 w-full rounded-2xl border border-base-300 bg-base-100 p-2 shadow-xl animate-in fade-in zoom-in-95 duration-100">
            {/* Search Input */}
            <div className="relative mb-2">
              <Search className="absolute right-3 top-2.5 size-4 text-base-content/40" />
              <input
                ref={searchInputRef}
                type="text"
                className="input input-sm input-bordered w-full pe-9 text-xs"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute left-2.5 top-2.5 text-base-content/40 hover:text-base-content"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Options List */}
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {filteredOptions.length === 0 ? (
                <p className="py-4 text-center text-xs text-base-content/50">موردی یافت نشد</p>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value
                  const isOff = Boolean(opt.disabled)
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isOff}
                      onClick={() => !isOff && handleSelect(opt.value)}
                      title={isOff ? 'این گزینه قابل انتخاب نیست' : undefined}
                      className={cx(
                        'flex w-full items-center justify-between rounded-xl px-3 py-2 text-start text-xs transition-colors',
                        isOff && 'cursor-not-allowed opacity-45',
                        isSelected
                          ? 'bg-primary font-bold text-primary-content'
                          : 'text-base-content hover:bg-base-200',
                      )}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{opt.label}</span>
                        {opt.hint && (
                          <span
                            className={cx(
                              'truncate text-[10px]',
                              isSelected ? 'text-primary-content/80' : 'text-base-content/50',
                            )}
                          >
                            {opt.hint}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 ms-2">
                        {opt.badge && (
                          <span className="badge badge-ghost badge-xs font-normal">{opt.badge}</span>
                        )}
                        {isSelected && <Check className="size-4" />}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-error">{error}</p>}
      {hint && !error && <p className="text-[11px] text-base-content/50">{hint}</p>}
    </div>
  )
}
