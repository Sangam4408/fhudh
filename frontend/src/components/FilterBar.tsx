import type { Filters } from '../api/types'
import { useFilters } from '../hooks/useFilters'
import { addDays, WINDOW_END, WINDOW_START } from '../lib/time'

const PRESETS: { label: string; start: string; end: string }[] = [
  { label: 'Whole window', start: WINDOW_START, end: WINDOW_END },
  { label: 'Week 1', start: '2026-01-02', end: '2026-01-08' },
  { label: 'Week 2', start: '2026-01-09', end: '2026-01-15' },
  { label: 'Week 3', start: '2026-01-16', end: '2026-01-22' },
  { label: 'Week 4', start: '2026-01-23', end: '2026-02-01' },
]

function presetFor(f: Filters): string {
  return PRESETS.find((p) => p.start === f.start && p.end === f.end)?.label ?? 'custom'
}

export function FilterBar() {
  const [f, update] = useFilters()

  return (
    <div className="filter-bar">
      <fieldset className="control">
        <legend>Delivery days</legend>
        <div className="row">
          <select
            className="preset"
            aria-label="Date preset"
            value={presetFor(f)}
            onChange={(e) => {
              const p = PRESETS.find((x) => x.label === e.target.value)
              if (p) update({ start: p.start, end: p.end })
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.label}>{p.label}</option>
            ))}
            <option value="custom" disabled>
              Custom
            </option>
          </select>
          <div className="dates">
            <input
              type="date"
              aria-label="Start day"
              min={WINDOW_START}
              max={WINDOW_END}
              value={f.start}
              onChange={(e) => e.target.value && update({ start: e.target.value, end: f.end < e.target.value ? e.target.value : f.end })}
            />
            <span className="muted">to</span>
            <input
              type="date"
              aria-label="End day"
              min={f.start}
              max={WINDOW_END}
              value={f.end}
              onChange={(e) => e.target.value && update({ end: e.target.value })}
            />
          </div>
          <div className="day-nav">
            <button type="button" className="ghost" onClick={() => update({ start: f.start, end: f.start })}>
              Single day
            </button>
            <button
              type="button"
              className="ghost"
              aria-label="Next day"
              disabled={f.end >= WINDOW_END}
              onClick={() => update({ start: addDays(f.start, 1), end: addDays(f.end, 1) })}
            >
              →
            </button>
          </div>
        </div>
      </fieldset>

      <fieldset className="control">
        <legend>Forecast cutoff</legend>
        <div className="row">
          <div className="segmented" role="radiogroup" aria-label="Cutoff mode">
            <button
              type="button"
              role="radio"
              aria-checked={f.mode === 'decision'}
              className={f.mode === 'decision' ? 'on' : ''}
              onClick={() => update({ mode: 'decision' })}
            >
              Decision time on D-1
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={f.mode === 'horizon'}
              className={f.mode === 'horizon' ? 'on' : ''}
              onClick={() => update({ mode: 'horizon' })}
            >
              Horizon
            </button>
          </div>
          {f.mode === 'decision' ? (
            <input
              type="time"
              aria-label="Decision time"
              step={1800}
              value={f.decisionTime}
              onChange={(e) => e.target.value && update({ decisionTime: e.target.value })}
            />
          ) : (
            <label className="row slider">
              <input
                type="range"
                min={1}
                max={48}
                value={f.horizonH}
                onChange={(e) => update({ horizonH: Number(e.target.value) })}
              />
              <span className="num">{f.horizonH} h ahead</span>
            </label>
          )}
        </div>
      </fieldset>
    </div>
  )
}
