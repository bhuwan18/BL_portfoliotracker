import { useNavigate } from 'react-router-dom'
import { CalendarClock, Plus, RefreshCw, Star, TrendingUp, Wallet } from 'lucide-react'
import { usePortfolio, useTrackedInstruments } from '../hooks/usePortfolio'
import { useMarket } from '../store/market'
import { AppBar, EmptyState, Loading, Spinner } from '../components/ui'
import { DonutChart } from '../components/DonutChart'
import { HoldingRow } from '../components/HoldingRow'
import { formatINR, formatPct, sign } from '../lib/format'

export function PortfolioScreen() {
  const navigate = useNavigate()
  const { summary, loading } = usePortfolio()
  const tracked = useTrackedInstruments()
  const refreshing = useMarket((s) => s.refreshing)
  const refresh = useMarket((s) => s.refresh)

  const hasHoldings = summary.holdings.length > 0

  return (
    <>
      <AppBar
        title="My Funds"
        subtitle="Your portfolio"
        right={
          <button
            className="icon-btn"
            type="button"
            aria-label="Refresh prices"
            onClick={() => refresh(tracked)}
          >
            {refreshing ? <Spinner /> : <RefreshCw size={19} />}
          </button>
        }
      />

      {loading ? (
        <Loading label="Loading portfolio…" />
      ) : !hasHoldings ? (
        <>
          <Hero summary={summary} />
          <QuickActions />
          <div className="screen">
            <EmptyState
              icon={<Wallet size={28} />}
              title="Start tracking"
              message="Add your first stock or mutual fund transaction to see live value, day's gain and XIRR."
              action={
                <button className="btn primary" type="button" onClick={() => navigate('/add')}>
                  <Plus size={18} /> Add transaction
                </button>
              }
            />
          </div>
        </>
      ) : (
        <>
          <Hero summary={summary} />
          <QuickActions />

          {summary.currentValue > 0 && <Allocation summary={summary} />}

          <div className="screen section">
            <div className="section-title">
              Holdings
              <span className="link" onClick={() => navigate('/holdings')}>
                See all
              </span>
            </div>
            <div className="list">
              {summary.holdings.slice(0, 5).map((h) => (
                <HoldingRow
                  key={h.instrument.id}
                  holding={h}
                  onClick={() => navigate(`/instrument/${encodeURIComponent(h.instrument.id)}`)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function Hero({ summary }: { summary: ReturnType<typeof usePortfolio>['summary'] }) {
  return (
    <div className="hero">
      <div className="label">Current value</div>
      <div className="value tnum">{formatINR(summary.currentValue, 0)}</div>
      <div className="row">
        <span className="pill">
          Today {summary.dayChange >= 0 ? '▲' : '▼'} {formatINR(Math.abs(summary.dayChange), 0)} (
          {formatPct(summary.dayChangePct, false)})
        </span>
        <span className="pill">
          Overall {summary.totalPnl >= 0 ? '▲' : '▼'} {formatPct(summary.totalPnlPct, false)}
        </span>
      </div>
      <div className="hero-grid">
        <div className="hero-stat">
          <div className="k">Invested</div>
          <div className="v tnum">{formatINR(summary.invested, 0)}</div>
        </div>
        <div className="hero-stat">
          <div className="k">Total returns</div>
          <div className="v tnum">
            {summary.totalPnl >= 0 ? '+' : '−'}
            {formatINR(Math.abs(summary.totalPnl), 0)}
          </div>
        </div>
        <div className="hero-stat">
          <div className="k">Realized P/L</div>
          <div className="v tnum">
            {summary.realizedPnl >= 0 ? '+' : '−'}
            {formatINR(Math.abs(summary.realizedPnl), 0)}
          </div>
        </div>
        <div className="hero-stat">
          <div className="k">XIRR</div>
          <div className="v tnum">{summary.xirr != null ? formatPct(summary.xirr) : '—'}</div>
        </div>
      </div>
    </div>
  )
}

function QuickActions() {
  const navigate = useNavigate()
  const items = [
    { icon: <Plus size={20} />, label: 'Add', to: '/add' },
    { icon: <CalendarClock size={20} />, label: 'SIPs', to: '/sip' },
    { icon: <Star size={20} />, label: 'Watchlist', to: '/watchlist' },
    { icon: <TrendingUp size={20} />, label: 'Holdings', to: '/holdings' },
  ]
  return (
    <div className="screen section" style={{ marginTop: 16 }}>
      <div className="quick-row">
        {items.map((it) => (
          <button key={it.label} className="quick" type="button" onClick={() => navigate(it.to)}>
            <span className="qi">{it.icon}</span>
            <span className="ql">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Allocation({ summary }: { summary: ReturnType<typeof usePortfolio>['summary'] }) {
  const data = [
    { name: 'Stocks', value: summary.byType.stock, color: '#2f80ed' },
    { name: 'Mutual Funds', value: summary.byType.mf, color: '#8b5cf6' },
  ]
  const total = summary.currentValue || 1
  return (
    <div className="screen section">
      <div className="section-title">Allocation</div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <DonutChart
          data={data}
          size={130}
          center={
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Total</div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{formatINR(summary.currentValue, 0)}</div>
            </div>
          }
        />
        <div className="legend">
          {data.map((d) => (
            <div key={d.name} className="legend-item">
              <span className="dot" style={{ background: d.color }} />
              <span className="nm">{d.name}</span>
              <span className="vl">{((d.value / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
          <div className="legend-item" style={{ marginTop: 4 }}>
            <span className="nm">Day's gain</span>
            <span className={`vl delta ${sign(summary.dayChange)}`}>
              {formatINR(summary.dayChange, 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
