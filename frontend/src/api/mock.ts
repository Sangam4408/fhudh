// Synthetic data that follows the API contract, so the frontend can be built
// before the backend exists. Numbers are plausible, not real Elexon data.
// Mock assumption: WINDFOR publishes on the hour, each run covering 48 h ahead.

import type {
  BreakdownBy,
  BreakdownResponse,
  BreakdownRow,
  ConclusionResponse,
  ErrorsResponse,
  Filters,
  ForecastPoint,
  ForecastResponse,
  Metrics,
} from './types'
import { dayStartMs, formatMw, slotsBetween, WINDOW_START } from '../lib/time'

const HOUR_MS = 3_600_000
const MAX_HORIZON_H = 48

// Deterministic hash → uniform [0, 1), so the same slot always gets the same value.
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return ((h >>> 0) % 1_000_000) / 1_000_000
}

function gaussian(a: number, b: number): number {
  const u = Math.max(hash01(a, b), 1e-6)
  const v = hash01(b, a + 17)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const ORIGIN = dayStartMs(WINDOW_START)

function actualAt(t: number): number {
  const h = (t - ORIGIN) / HOUR_MS
  // Weather systems over days, plus a mild diurnal swing.
  const weather = 9000 + 5500 * Math.sin(h / 41) + 2500 * Math.sin(h / 13 + 1.3) + 1200 * Math.sin(h / 5.7)
  const diurnal = 600 * Math.sin(((h % 24) / 24) * 2 * Math.PI - 1)
  return Math.max(300, Math.min(19500, weather + diurnal))
}

function cutoffFor(t: number, f: Filters): number {
  if (f.mode === 'horizon') return t - f.horizonH * HOUR_MS
  const [hh, mm] = f.decisionTime.split(':').map(Number)
  const day = Math.floor(t / (24 * HOUR_MS)) * 24 * HOUR_MS
  return day - 24 * HOUR_MS + (hh * 60 + mm) * 60_000
}

function buildPoints(f: Filters): ForecastPoint[] {
  return slotsBetween(f.start, f.end).map((t) => {
    const idx = (t - ORIGIN) / (HOUR_MS / 2)
    const missingActual = hash01(idx, 7) < 0.01
    // Latest hourly publication strictly before the cutoff.
    const cutoff = cutoffFor(t, f)
    const publish = Math.ceil(cutoff / HOUR_MS) * HOUR_MS - HOUR_MS
    const horizonH = (t - publish) / HOUR_MS
    const missingForecast = horizonH > MAX_HORIZON_H || hash01(idx, 11) < 0.005

    const actual = actualAt(t)
    const sigma = 250 + 28 * horizonH
    const forecast = Math.max(0, actual + 180 + sigma * gaussian(idx, publish / HOUR_MS))

    return {
      startTime: new Date(t).toISOString(),
      actual: missingActual ? null : Math.round(actual),
      forecast: missingForecast ? null : Math.round(forecast),
      publishTime: missingForecast ? null : new Date(publish).toISOString(),
      horizonH: missingForecast ? null : horizonH,
    }
  })
}

type Complete = ForecastPoint & { actual: number; forecast: number; horizonH: number }

function complete(points: ForecastPoint[]): Complete[] {
  return points.filter((p): p is Complete => p.actual != null && p.forecast != null)
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

const CAPACITY_MW = 22_000

function summarise(rows: Complete[]): Metrics {
  const errs = rows.map((r) => r.forecast - r.actual)
  const n = errs.length
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1)
  const mae = mean(errs.map(Math.abs))
  const meanActual = mean(rows.map((r) => r.actual))
  const sorted = [...errs].sort((a, b) => a - b)
  const sortedAbs = errs.map(Math.abs).sort((a, b) => a - b)
  return {
    n,
    mae,
    rmse: Math.sqrt(mean(errs.map((e) => e * e))),
    bias: mean(errs),
    maePctMean: (mae / meanActual) * 100,
    maePctCapacity: (mae / CAPACITY_MW) * 100,
    meanActual,
    capacity: CAPACITY_MW,
    p10: percentile(sorted, 0.1),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p90Abs: percentile(sortedAbs, 0.9),
  }
}

function horizonBucket(h: number): string {
  if (h < 18) return '<18 h'
  if (h < 24) return '18–24 h'
  if (h < 30) return '24–30 h'
  if (h < 36) return '30–36 h'
  return '36 h+'
}

const HORIZON_ORDER = ['<18 h', '18–24 h', '24–30 h', '30–36 h', '36 h+']

function groupKey(p: Complete, by: BreakdownBy): string {
  if (by === 'hour') return p.startTime.slice(11, 16)
  if (by === 'day') return p.startTime.slice(0, 10)
  return horizonBucket(p.horizonH)
}

const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150))

export const mockApi = {
  forecast(f: Filters): Promise<ForecastResponse> {
    const points = buildPoints(f)
    return delay({
      points,
      missingForecast: points.filter((p) => p.forecast == null).length,
      missingActual: points.filter((p) => p.actual == null).length,
    })
  },

  metrics(f: Filters): Promise<Metrics> {
    return delay(summarise(complete(buildPoints(f))))
  },

  breakdown(f: Filters, by: BreakdownBy): Promise<BreakdownResponse> {
    const groups = new Map<string, Complete[]>()
    for (const p of complete(buildPoints(f))) {
      const k = groupKey(p, by)
      groups.set(k, [...(groups.get(k) ?? []), p])
    }
    const rows: BreakdownRow[] = [...groups.entries()].map(([key, g]) => {
      const m = summarise(g)
      return { key, n: m.n, mae: m.mae, bias: m.bias, p90Abs: m.p90Abs }
    })
    rows.sort((a, b) =>
      by === 'horizon' ? HORIZON_ORDER.indexOf(a.key) - HORIZON_ORDER.indexOf(b.key) : a.key.localeCompare(b.key),
    )
    return delay({ by, rows })
  },

  errors(f: Filters): Promise<ErrorsResponse> {
    return delay({ errors: complete(buildPoints(f)).map((p) => p.forecast - p.actual) })
  },

  async conclusion(f: Filters): Promise<ConclusionResponse> {
    const m = await mockApi.metrics(f)
    const { rows } = await mockApi.breakdown(f, 'hour')
    const worst = [...rows].sort((a, b) => b.mae - a.mae)[0]
    const cutoff = f.mode === 'decision' ? `a ${f.decisionTime} D-1 cutoff` : `a ${f.horizonH} h horizon`
    const direction = m.bias >= 0 ? 'over' : 'under'
    return {
      text:
        `At ${cutoff}, the wind forecast missed by ${formatMw(m.mae)} on average ` +
        `(${m.maePctMean.toFixed(1)}% of mean output) and tended to ${direction}-forecast by ${formatMw(Math.abs(m.bias))}. ` +
        `In 90% of half-hours the error was within ±${formatMw(m.p90Abs)}, so a buffer of that size covers 9 in 10 slots. ` +
        `Errors peak around ${worst?.key ?? '—'} UK time, where a larger buffer is justified.`,
    }
  },
}
