import { useEffect, useState } from 'react'

/**
 * مقدار را پس از تأخیر مشخص برمی‌گرداند تا جستجوی زنده با هر کلید یک درخواست
 * جداگانه به سرور نفرستد.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
