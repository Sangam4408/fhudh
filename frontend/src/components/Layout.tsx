import { NavLink, Outlet, useLocation } from 'react-router'
import { USING_MOCK } from '../api/client'
import { FilterBar } from './FilterBar'
import { WakeBanner } from './WakeBanner'

export function Layout() {
  // Keep the query string when switching tabs so filters carry over.
  const { search } = useLocation()

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>UK Wind Forecast</h1>
          <span className="muted">Decisions made 1–31 Jan 2026 · times in UK time (GMT)</span>
        </div>
        <nav className="tabs">
          <NavLink to={{ pathname: '/', search }} end>
            Forecast
          </NavLink>
          <NavLink to={{ pathname: '/accuracy', search }}>Accuracy</NavLink>
        </nav>
        {USING_MOCK && (
          <span className="badge" title="Set VITE_API_URL to use the real backend">
            Mock data
          </span>
        )}
      </header>
      <FilterBar />
      <WakeBanner />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
