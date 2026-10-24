import type {
  BreakdownBy,
  BreakdownResponse,
  ConclusionResponse,
  ErrorsResponse,
  Filters,
  ForecastResponse,
  Metrics,
} from './types'
import { mockApi } from './mock'

const API_URL: string | undefined = import.meta.env.VITE_API_URL

/** True until a backend URL is configured. */
export const USING_MOCK = !API_URL

function params(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ start: f.start, end: f.end, ...extra })
  if (f.mode === 'decision') p.set('decision_time', f.decisionTime)
  else p.set('horizon_h', String(f.horizonH))
  return p.toString()
}

async function get<T>(path: string, query: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}?${query}`)
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export const api = {
  forecast: (f: Filters): Promise<ForecastResponse> =>
    USING_MOCK ? mockApi.forecast(f) : get('/api/forecast', params(f)),
  metrics: (f: Filters): Promise<Metrics> => (USING_MOCK ? mockApi.metrics(f) : get('/api/metrics', params(f))),
  breakdown: (f: Filters, by: BreakdownBy): Promise<BreakdownResponse> =>
    USING_MOCK ? mockApi.breakdown(f, by) : get('/api/metrics/breakdown', params(f, { by })),
  errors: (f: Filters): Promise<ErrorsResponse> => (USING_MOCK ? mockApi.errors(f) : get('/api/errors', params(f))),
  conclusion: (f: Filters): Promise<ConclusionResponse> =>
    USING_MOCK ? mockApi.conclusion(f) : get('/api/conclusion', params(f)),
}
