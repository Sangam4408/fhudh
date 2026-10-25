import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ForecastPoint } from '../api/types'
import { Empty, ErrorBanner, KpiCard, Loading, Panel } from '../components/common'
import { useForecast, useMetrics } from '../hooks/useApi'
import { useFilters } from '../hooks/useFilters'
import { useIsMobile } from '../hooks/useMediaQuery'
import { axisLabel, axisProps, chartMargin, legendStyle, yAxisWidth } from '../lib/chart'
import { formatMw, formatSlot } from '../lib/time'

interface Row extends ForecastPoint {
  t: number
  error: number | null
}

const kmw = (v: number) => `${(v / 1000).toFixed(0)}k`

function axisTick(t: number, singleDay: boolean): string {
  const s = formatSlot(new Date(t).toISOString())
  return singleDay ? s.slice(-5) : s.slice(0, -6)
}

function SlotTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const r = payload?.[0]?.payload
  if (!active || !r) return null
  return (
    <div className="tooltip">
      <div className="tooltip-title">{formatSlot(r.startTime)}</div>
      <div>
        <span className="swatch actual" /> Actual: <b className="num">{formatMw(r.actual)}</b>
      </div>
      <div>
        <span className="swatch forecast" /> Forecast: <b className="num">{formatMw(r.forecast)}</b>
      </div>
      <div>Error: <b className="num">{r.error == null ? '—' : `${r.error > 0 ? '+' : ''}${formatMw(r.error)}`}</b></div>
      <hr />
      <div className="muted">
        Published {r.publishTime ? formatSlot(r.publishTime) : '—'}
        {r.horizonH != null && ` · ${r.horizonH} h ahead`}
      </div>
    </div>
  )
}

function downloadCsv(rows: Row[], name: string) {
  const header = 'startTime,actual_mw,forecast_mw,error_mw,publishTime,horizon_h'
  const lines = rows.map((r) => [r.startTime, r.actual, r.forecast, r.error, r.publishTime, r.horizonH].map((v) => v ?? '').join(','))
  const url = URL.createObjectURL(new Blob([[header, ...lines].join('\n')], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

export default function ForecastView() {
  const [f] = useFilters()
  const forecast = useForecast(f)
  const metrics = useMetrics(f)
  const singleDay = f.start === f.end
  const mobile = useIsMobile()
  const axis = axisProps(mobile)

  const rows: Row[] = useMemo(
    () =>
      (forecast.data?.points ?? []).map((p) => ({
        ...p,
        t: Date.parse(p.startTime),
        error: p.actual != null && p.forecast != null ? p.forecast - p.actual : null,
      })),
    [forecast.data],
  )

  if (forecast.error) return <ErrorBanner error={forecast.error} />

  const m = metrics.data
  const d = forecast.data

  return (
    <div className="stack">
      <div className="kpis">
        <KpiCard
          label="Hours compared"
          value={d ? d.pairs.toLocaleString('en-GB') : '…'}
          hint={d ? `${d.points.length.toLocaleString('en-GB')} half-hour actuals · hourly forecasts` : undefined}
        />
        <KpiCard
          label="Missing"
          value={d ? (d.missingForecast + d.missingActual).toLocaleString('en-GB') : '…'}
          hint={d ? `${d.missingForecast} hours no forecast · ${d.missingActual} slots no actual` : undefined}
        />
        <KpiCard label="Mean absolute error" value={m ? formatMw(m.mae) : '…'} hint={m ? `${m.maePctMean.toFixed(1)}% of mean output` : undefined} />
        <KpiCard
          label="Bias"
          value={m ? `${m.bias > 0 ? '+' : ''}${formatMw(m.bias)}` : '…'}
          hint={m ? (m.bias >= 0 ? 'Over-forecasts on average' : 'Under-forecasts on average') : undefined}
        />
      </div>

      <Panel
        title="Actual vs decision-time forecast"
        subtitle={
          f.mode === 'decision'
            ? `Latest forecast published before ${f.decisionTime} on the day before delivery`
            : `Latest forecast published at least ${f.horizonH} h before each slot`
        }
        actions={
          <button type="button" className="ghost" disabled={!rows.length} onClick={() => downloadCsv(rows, `wind_${f.start}_${f.end}.csv`)}>
            Download CSV
          </button>
        }
      >
        {forecast.isPending ? (
          <Loading height={mobile ? 280 : 380} />
        ) : rows.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={mobile ? 280 : 380}>
            <LineChart data={rows} margin={chartMargin(mobile)}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(t: number) => axisTick(t, singleDay)}
                {...axis}
                minTickGap={mobile ? 24 : 40}
              />
              <YAxis tickFormatter={kmw} {...axis} width={yAxisWidth(mobile)} label={axisLabel('MW', mobile)} />
              <Tooltip content={<SlotTooltip />} />
              <Legend wrapperStyle={legendStyle(mobile)} />
              <Line name="Actual" dataKey="actual" stroke="var(--c-actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line
                name="Forecast at cutoff"
                dataKey="forecast"
                stroke="var(--c-forecast)"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={singleDay ? { r: 2.5, fill: 'var(--c-forecast)' } : false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Forecast error over time" subtitle="Forecast − actual. Above zero: forecast too high, so too little power was bought.">
        {forecast.isPending ? (
          <Loading height={mobile ? 160 : 200} />
        ) : (
          <ResponsiveContainer width="100%" height={mobile ? 160 : 200}>
            <BarChart data={rows} margin={chartMargin(mobile)} barCategoryGap={0}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="t" tickFormatter={(t: number) => axisTick(t, singleDay)} {...axis} minTickGap={mobile ? 24 : 40} />
              <YAxis tickFormatter={kmw} {...axis} width={yAxisWidth(mobile)} />
              <Tooltip content={<SlotTooltip />} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Bar dataKey="error" fill="var(--c-error)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  )
}
