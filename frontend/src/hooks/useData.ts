import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { createOne, deleteOne, getAll, patchOne } from '../services/api'
import type { Resources, ResourceName } from '../types'

const EMPTY: never[] = []

/** Fetches a whole collection. `data` is always an array (stable empty ref while loading). */
export function useList<K extends ResourceName>(resource: K) {
  const q = useQuery({ queryKey: [resource], queryFn: () => getAll(resource), staleTime: 20_000 })
  return { ...q, data: (Array.isArray(q.data) ? q.data : EMPTY) as Resources[K][] }
}

interface MutationOpts {
  /** Toast shown on success. Pass `false` to stay silent. */
  success?: string | false
}

export function useCreate<K extends ResourceName>(resource: K, opts: MutationOpts = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Resources[K]>) => createOne(resource, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] })
      if (opts.success !== false) toast.success(opts.success ?? 'با موفقیت ثبت شد')
    },
    onError: () => toast.error('خطا در ثبت اطلاعات'),
  })
}

export function useUpdate<K extends ResourceName>(resource: K, opts: MutationOpts = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Resources[K]> & { id: string }) =>
      patchOne(resource, id, body as Partial<Resources[K]>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] })
      if (opts.success) toast.success(opts.success)
    },
    onError: () => toast.error('خطا در بروزرسانی اطلاعات'),
  })
}

export function useRemove(resource: ResourceName, opts: MutationOpts = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteOne(resource, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] })
      if (opts.success !== false) toast.success(opts.success ?? 'با موفقیت حذف شد')
    },
    onError: () => toast.error('خطا در حذف اطلاعات'),
  })
}

/** Handy id → record lookup for joins (customer name on an invoice, etc). */
export function useLookup<K extends ResourceName>(resource: K) {
  const { data, isLoading } = useList(resource)
  const map = new Map<string, Resources[K]>()
  for (const r of data) map.set((r as { id: string }).id, r)
  return { map, isLoading }
}
