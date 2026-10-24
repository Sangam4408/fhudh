import type { ReactNode } from 'react'

export function KpiCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num">{value}</div>
      {hint && <div className="kpi-hint muted">{hint}</div>}
    </div>
  )
}

export function Panel({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Loading({ height = 320 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-busy="true" aria-label="Loading" />
}

export function ErrorBanner({ error }: { error: unknown }) {
  return (
    <div className="error-banner" role="alert">
      Could not load data: {error instanceof Error ? error.message : String(error)}
    </div>
  )
}

export function Empty({ children = 'No data for this selection.' }: { children?: ReactNode }) {
  return <div className="empty muted">{children}</div>
}
