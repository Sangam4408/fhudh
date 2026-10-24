// API contract shared with the FastAPI backend (PRD §8.2).
// All timestamps are ISO 8601 UTC strings; UK time equals UTC in January.

export type CutoffMode = 'decision' | 'horizon'

export interface Filters {
  /** First delivery day, YYYY-MM-DD (inclusive). */
  start: string
  /** Last delivery day, YYYY-MM-DD (inclusive). */
  end: string
  mode: CutoffMode
  /** Decision time on D-1, HH:MM UK time. Used when mode = 'decision'. */
  decisionTime: string
  /** Hours before the target slot. Used when mode = 'horizon'. */
  horizonH: number
}

export interface ForecastPoint {
  startTime: string
  actual: number | null
  forecast: number | null
  publishTime: string | null
  horizonH: number | null
}

export interface ForecastResponse {
  /** Every half-hour slot. WINDFOR is hourly, so :30 slots have no forecast. */
  points: ForecastPoint[]
  /** Hours (on the hour) with no forecast published before the cutoff. */
  missingForecast: number
  missingActual: number
  /** Slots with both an actual and a forecast. */
  pairs: number
}

export interface Metrics {
  /** Slots with both an actual and a forecast. */
  n: number
  mae: number
  rmse: number
  /** Mean of forecast − actual; positive means over-forecast. */
  bias: number
  maePctMean: number
  maePctCapacity: number
  meanActual: number
  capacity: number
  p10: number
  p50: number
  p90: number
  /** 90th percentile of |error|: the buffer figure. */
  p90Abs: number
}

export type BreakdownBy = 'hour' | 'horizon' | 'day'

export interface BreakdownRow {
  key: string
  n: number
  mae: number
  bias: number
  p90Abs: number
}

export interface BreakdownResponse {
  by: BreakdownBy
  rows: BreakdownRow[]
}

export interface ErrorsResponse {
  /** Signed errors (forecast − actual) in MW, one per complete slot. */
  errors: number[]
}

export interface ConclusionResponse {
  text: string
}
