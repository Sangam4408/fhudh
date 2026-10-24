import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Empty, ErrorBanner, KpiCard, Loading, Panel } from '../components/common'
import { useBreakdown, useConclusion, useErrors, useMetrics } from '../hooks/useApi'
import { useFilters } from '../hooks/useFilters'
import { formatDay, formatMw } from '../lib/time'

const BIN_MW = 250
const axis = { stroke: 'var(--axis)', tick: { fill: 'var(--text-2)', fontSize: 12 } }
const mwTip = (v: unknown) => formatMw(Number(v))

function histogram(errors: number[]) {
  if (errors.length === 0) return []
  const lo = Math.floor(Math.min(...errors) / BIN_MW)
  const hi = Math.floor(Math.max(...errors) / BIN_MW)
  const counts = new Array(hi - lo + 1).fill(0)
  for (const e of errors) counts[Math.floor(e / BIN_MW) - lo]++
  return counts.map((count, i) => ({ mid: (lo + i) * BIN_MW + BIN_MW / 2, count }))
}

/** Category on the histogram axis closest to a value, so reference lines land on a bar. */
function nearestMid(v: number): number {
  return Math.floor(v / BIN_MW) * BIN_MW + BIN_MW / 2
}

export default function Accuracy() {
  const [f] = useFilters()
  const metrics = useMetrics(f)
  const errors = useErrors(f)
  const byHour = useBreakdown(f, 'hour')
  const byHorizon = useBreakdown(f, 'horizon')
  const byDay = useBreakdown(f, 'day')
  const conclusion = useConclusion(f)

  const bins = useMemo(() => histogram(errors.data?.errors ?? []), [errors.data])
  const worstDays = useMemo(
    () => new Set([...(byDay.data?.rows ?? [])].sort((a, b) => b.mae - a.mae).slice(0, 3).map((r) => r.key)),
    [byDay.data],
  )

  if (metrics.error) return <ErrorBanner error={metrics.error} />
  const m = metrics.data

  if (m && m.n === 0) return <Empty>No slots with both a forecast and an actual in this selection.</Empty>

  return (
    <div className="stack">
      <div className="callout">
        {m ? (
          <>
            With 90% confidence, actual wind will be within <b className="num">±{formatMw(m.p90Abs)}</b> of the forecast.
            <span className="muted"> Based on {m.n.toLocaleString('en-GB')} half-hours.</span>
          </>
        ) : (
          'Loading…'
        )}
      </div>

      <div className="kpis five">
        <KpiCard label="MAE" value={m ? formatMw(m.mae) : '…'} hint="Typical miss" />
        <KpiCard label="RMSE" value={m ? formatMw(m.rmse) : '…'} hint="Penalises big misses" />
        <KpiCard
          label="Bias"
          value={m ? `${m.bias > 0 ? '+' : ''}${formatMw(m.bias)}` : '…'}
          hint={m ? (m.bias >= 0 ? 'Over-forecasts' : 'Under-forecasts') : undefined}
        />
        <KpiCard label="MAE % of mean" value={m ? `${m.maePctMean.toFixed(1)}%` : '…'} hint={m ? `Mean output ${formatMw(m.meanActual)}` : undefined} />
        <KpiCard label="MAE % of capacity" value={m ? `${m.maePctCapacity.toFixed(1)}%` : '…'} hint={m ? `Capacity ${formatMw(m.capacity)}` : undefined} />
      </div>

      <Panel
        title="Error distribution"
        subtitle={m ? `Forecast − actual, ${BIN_MW} MW bins. P10 ${formatMw(m.p10)} · P50 ${formatMw(m.p50)} · P90 ${formatMw(m.p90)}` : undefined}
      >
        {errors.isPending || !m ? (
          <Loading />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={bins} margin={{ top: 24, right: 16, bottom: 0, left: 8 }} barCategoryGap={1}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="mid" {...axis} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} minTickGap={24} />
              <YAxis {...axis} allowDecimals={false} label={{ value: 'slots', angle: -90, position: 'insideLeft', fill: 'var(--text-2)', fontSize: 12 }} />
              <Tooltip formatter={(v) => [v, 'slots']} labelFormatter={(v) => `${formatMw(Number(v) - BIN_MW / 2)} to ${formatMw(Number(v) + BIN_MW / 2)}`} />
              <Bar dataKey="count" fill="var(--c-forecast)" isAnimationActive={false} />
              <ReferenceLine x={nearestMid(m.p10)} stroke="var(--text-1)" strokeDasharray="4 3" label={{ value: 'P10', position: 'top', fill: 'var(--text-1)', fontSize: 12 }} />
              <ReferenceLine x={nearestMid(m.p50)} stroke="var(--text-1)" label={{ value: 'P50', position: 'top', fill: 'var(--text-1)', fontSize: 12 }} />
              <ReferenceLine x={nearestMid(m.p90)} stroke="var(--text-1)" strokeDasharray="4 3" label={{ value: 'P90', position: 'top', fill: 'var(--text-1)', fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="grid-2">
        <Panel title="Error by time of day" subtitle="MAE (bars) and bias (line) per half-hour, UK time">
          {byHour.isPending ? (
            <Loading height={260} />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={byHour.data?.rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="key" {...axis} interval={7} />
                <YAxis {...axis} />
                <Tooltip formatter={mwTip} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <ReferenceLine y={0} stroke="var(--axis)" />
                <Bar name="MAE" dataKey="mae" fill="var(--c-actual)" isAnimationActive={false} />
                <Line name="Bias" dataKey="bias" stroke="var(--c-forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Error by forecast horizon" subtitle="Hours between publishTime and the slot">
          {byHorizon.isPending ? (
            <Loading height={260} />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byHorizon.data?.rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="key" {...axis} />
                <YAxis {...axis} />
                <Tooltip formatter={mwTip} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar name="MAE" dataKey="mae" fill="var(--c-actual)" isAnimationActive={false} />
                <Bar name="P90 |error|" dataKey="p90Abs" fill="var(--c-forecast)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Error by delivery day" subtitle="MAE per day; the three worst days are highlighted">
        {byDay.isPending ? (
          <Loading height={260} />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byDay.data?.rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="key" {...axis} tickFormatter={formatDay} minTickGap={16} />
              <YAxis {...axis} />
              <Tooltip formatter={mwTip} labelFormatter={(v) => formatDay(String(v))} />
              <Bar name="MAE" dataKey="mae" isAnimationActive={false}>
                {byDay.data?.rows.map((r) => (
                  <Cell key={r.key} fill={worstDays.has(r.key) ? 'var(--c-highlight)' : 'var(--c-actual)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Conclusion">
        {conclusion.isPending ? <Loading height={80} /> : <p className="conclusion">{conclusion.data?.text}</p>}
      </Panel>
    </div>
  )
}
