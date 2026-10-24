import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { CutoffMode, Filters } from '../api/types'
import { DEFAULT_DECISION_TIME, DEFAULT_HORIZON_H, WINDOW_END, WINDOW_START } from '../lib/time'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function clampDay(v: string | null, fallback: string): string {
  if (!v || !DAY_RE.test(v)) return fallback
  if (v < WINDOW_START) return WINDOW_START
  if (v > WINDOW_END) return WINDOW_END
  return v
}

function parse(sp: URLSearchParams): Filters {
  let start = clampDay(sp.get('start'), WINDOW_START)
  let end = clampDay(sp.get('end'), WINDOW_END)
  if (start > end) [start, end] = [end, start]
  const mode: CutoffMode = sp.get('mode') === 'horizon' ? 'horizon' : 'decision'
  const t = sp.get('time')
  const h = Number(sp.get('h'))
  return {
    start,
    end,
    mode,
    decisionTime: t && TIME_RE.test(t) ? t : DEFAULT_DECISION_TIME,
    horizonH: Number.isInteger(h) && h >= 1 && h <= 48 ? h : DEFAULT_HORIZON_H,
  }
}

/** Filters live in the URL so both pages share them and any view can be linked. */
export function useFilters(): [Filters, (patch: Partial<Filters>) => void] {
  const [sp, setSp] = useSearchParams()
  const filters = useMemo(() => parse(sp), [sp])

  const update = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch }
      setSp(
        {
          start: next.start,
          end: next.end,
          mode: next.mode,
          time: next.decisionTime,
          h: String(next.horizonH),
        },
        { replace: true },
      )
    },
    [filters, setSp],
  )

  return [filters, update]
}
