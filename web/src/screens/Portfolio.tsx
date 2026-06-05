import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCw, Settings, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { usePortfolio, useTrackedInstruments } from '../hooks/usePortfolio'
import { useReturnMode, type ReturnMode } from '../hooks/useReturnMode'
import { orderHoldings, useHoldingsOrder } from '../hooks/useHoldingsOrder'
import { useMarket } from '../store/market'
import { AppBar, EmptyState, Loading, Spinner } from '../components/ui'
import { SortableHoldings } from '../components/SortableHoldings'
import { formatINR, formatPct, formatSignedINR, sign } from '../lib/format'

export function PortfolioScreen() {
  const navigate = useNavigate()
  const { summary, loading } = usePortfolio()
  const tracked = useTrackedInstruments()
  const refreshing = useMarket((s) => s.refreshing)
  const refresh = useMarket((s) => s.refresh)
  const [mode, toggleMode] = useReturnMode()
  const { order, isCustom, save, reset } = useHoldingsOrder()

  const holdings = useMemo(
    () => orderHoldings(summary.holdings, order),
    [summary.holdings, order],
  )
  const hasHoldings = summary.holdings.length > 0

  return (
    <>
      <AppBar
        title="My Funds"
        right={
          <>
            <button
              className="icon-btn"
              type="button"
              aria-label="Refresh prices"
              onClick={() => refresh(tracked)}
            >
              {refreshing ? <Spinner /> : <RefreshCw size={19} />}
            </button>
            <button
              className="icon-btn"
              type="button"
              aria-label="Add transaction"
              onClick={() => navigate('/add')}
            >
              <Plus size={20} />
            </button>
            <button
              className="icon-btn"
              type="button"
              aria-label="Settings"
              onClick={() => navigate('/settings')}
            >
              <Settings size={19} />
            </button>
          </>
        }
      />

      {loading ? (
        <Loading label="Loading portfolio…" />
      ) : !hasHoldings ? (
        <>
          <Hero summary={summary} mode={mode} onToggleMode={toggleMode} />
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
          <Hero summary={summary} mode={mode} onToggleMode={toggleMode} />

          <div className="screen section">
            <div className="section-title">
              Holdings
              {isCustom && (
                <button type="button" className="link" onClick={() => void reset()}>
                  Reset to value order
                </button>
              )}
            </div>
            <SortableHoldings
              holdings={holdings}
              mode={mode}
              onToggleMode={toggleMode}
              onReorder={(ids) => void save(ids)}
              onOpen={(id) => navigate(`/instrument/${encodeURIComponent(id)}`)}
            />
          </div>
        </>
      )}
    </>
  )
}

function Hero({
  summary,
  mode,
  onToggleMode,
}: {
  summary: ReturnType<typeof usePortfolio>['summary']
  mode: ReturnMode
  onToggleMode: () => void
}) {
  const showAlloc = summary.currentValue > 0
  const stockPct = showAlloc ? (summary.byType.stock / summary.currentValue) * 100 : 0
  const mfPct = showAlloc ? (summary.byType.mf / summary.currentValue) * 100 : 0
  return (
    <div className="hero">
      <div className="label">Current value</div>
      <div className="value tnum">{formatINR(summary.currentValue, 0)}</div>
      <div className="hero-pills">
        <span className="pill">
          Today {summary.dayChange >= 0 ? '▲' : '▼'} {formatINR(Math.abs(summary.dayChange), 0)} (
          {formatPct(summary.dayChangePct, false)})
        </span>
        <button
          type="button"
          className="pill"
          onClick={onToggleMode}
          aria-label="Toggle overall return and XIRR"
        >
          {mode === 'xirr' ? (
            <>
              XIRR {(summary.xirr ?? 0) >= 0 ? '▲' : '▼'}{' '}
              {summary.xirr != null ? formatPct(summary.xirr, false) : '—'}
            </>
          ) : (
            <>
              Overall {summary.totalPnl >= 0 ? '▲' : '▼'} {formatPct(summary.totalPnlPct, false)}
            </>
          )}
        </button>
      </div>
      <div className="stat-strip">
        <div className="hero-stat">
          <div className="k">Invested</div>
          <div className="v tnum">{formatINR(summary.invested, 0)}</div>
        </div>
        <div className="hero-stat">
          <div className="k">Total returns</div>
          <div className="v tnum">
            {summary.totalPnl >= 0 ? '+' : '−'}
            {formatINR(Math.abs(summary.totalPnl), 0)}
            <span className="sub"> ({formatPct(summary.totalPnlPct, false)})</span>
          </div>
        </div>
      </div>

      {sign(summary.realizedPnl) !== 'zero' && (
        <div className="hero-realized">
          Realized P/L <span className="tnum">{formatSignedINR(summary.realizedPnl, 0)}</span>
        </div>
      )}

      {showAlloc && (
        <div className="alloc">
          <div className="alloc-bar">
            {summary.byType.stock > 0 && (
              <span className="seg" style={{ width: `${stockPct}%`, background: 'var(--stock)' }} />
            )}
            {summary.byType.mf > 0 && (
              <span className="seg" style={{ width: `${mfPct}%`, background: 'var(--mf)' }} />
            )}
          </div>
          <div className="alloc-legend">
            <span>
              <span className="dot" style={{ background: 'var(--stock)' }} /> Stocks {stockPct.toFixed(1)}%
            </span>
            <span>
              <span className="dot" style={{ background: 'var(--mf)' }} /> Mutual Funds {mfPct.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
