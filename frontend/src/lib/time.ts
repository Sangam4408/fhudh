// Delivery window for decisions made 1–31 Jan 2026 (PRD §4.1).
export const WINDOW_START = '2026-01-02'
export const WINDOW_END = '2026-02-01'

export const DEFAULT_DECISION_TIME = '09:00'
export const DEFAULT_HORIZON_H = 24

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export function dayStartMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`)
}

/** Every 30-minute slot start (ms) from the start of `start` to the end of `end`. */
export function slotsBetween(start: string, end: string): number[] {
  const out: number[] = []
  const last = dayStartMs(end) + DAY_MS
  for (let t = dayStartMs(start); t < last; t += HOUR_MS / 2) out.push(t)
  return out
}

export function addDays(day: string, n: number): string {
  return new Date(dayStartMs(day) + n * DAY_MS).toISOString().slice(0, 10)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2 Jan 09:30" from an ISO string, read in UTC (= UK time in January). */
export function formatSlot(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm}`
}

export function formatDay(day: string): string {
  const d = new Date(dayStartMs(day))
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export function formatMw(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })} MW`
}
