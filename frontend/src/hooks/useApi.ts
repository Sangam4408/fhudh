import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { BreakdownBy, Filters } from '../api/types'

// keepPreviousData keeps the old chart on screen while new filters load.
const opts = { placeholderData: keepPreviousData, staleTime: Infinity } as const

export const useForecast = (f: Filters) => useQuery({ queryKey: ['forecast', f], queryFn: () => api.forecast(f), ...opts })
export const useMetrics = (f: Filters) => useQuery({ queryKey: ['metrics', f], queryFn: () => api.metrics(f), ...opts })
export const useBreakdown = (f: Filters, by: BreakdownBy) =>
  useQuery({ queryKey: ['breakdown', by, f], queryFn: () => api.breakdown(f, by), ...opts })
export const useErrors = (f: Filters) => useQuery({ queryKey: ['errors', f], queryFn: () => api.errors(f), ...opts })
export const useConclusion = (f: Filters) =>
  useQuery({ queryKey: ['conclusion', f], queryFn: () => api.conclusion(f), ...opts })
