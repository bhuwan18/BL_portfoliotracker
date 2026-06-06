import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, Check, ChevronDown, Plus, RefreshCw, Settings, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePortfolio, useTrackedInstruments } from '../hooks/usePortfolio'
import { useActiveProfile, useProfiles } from '../hooks/useProfiles'
import { useReturnMode, type ReturnMode } from '../hooks/useReturnMode'
import { orderHoldings, useHoldingsOrder } from '../hooks/useHoldingsOrder'
import { useMarket } from '../store/market'
import { AppBar, EmptyState, Loading, Spinner } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { SortableHoldings } from '../components/SortableHoldings'
import { DeleteHoldingSheet } from '../components/DeleteHoldingSheet'
import { formatINR, formatPct, formatSignedINR, sign } from '../lib/format'
import type { Holding, Profile } from '../domain/types'

export function PortfolioScreen() {
  const navigate = useNavigate()
  const { summary, loading } = usePortfolio()
  const tracked = useTrackedInstruments()
  const refreshing = useMarket((s) => s.refreshing)
  const refresh = useMarket((s) => s.refresh)
  const [mode, toggleMode] = useReturnMode()
  const { order, isCustom, save, reset } = useHoldingsOrder()
  const profiles = useProfiles()
  const { activeId, setActive } = useActiveProfile()
  const [editing, setEditing] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Holding | null>(null)
  const [switchOpen, setSwitchOpen] = useState(false)

  const holdings = useMemo(
    () => orderHoldings(summary.holdings, order),
    [summary.holdings, order],
  )
  const hasHoldings = summary.holdings.length > 0

  // With a single profile the title stays the static brand. Once a second profile exists it
  // becomes the active profile's name + a caret that opens the switch sheet.
  const multiProfile = profiles.length > 1
  const activeProfile = profiles.find((p) => p.id === activeId)
  const title = multiProfile ? (
    <button
      type="button"
      className="profile-title"
      onClick={() => setSwitchOpen(true)}
      aria-label="Switch profile"
    >
      <span>{activeProfile?.name ?? 'B Funds'}</span>
      <ChevronDown size={18} aria-hidden="true" />
    </button>
  ) : (
    'B Funds'
  )

  return (
    <>
      <AppBar
        title={title}
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
              {editing ? (
                <span className="section-actions">
                  {isCustom && (
                    <button type="button" className="link" onClick={() => void reset()}>
                      Reset to value order
                    </button>
                  )}
                  <button type="button" className="link" onClick={() => setEditing(false)}>
                    Done
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="icon-link"
                  aria-label="Reorder holdings"
                  onClick={() => setEditing(true)}
                >
                  <ArrowUpDown size={15} aria-hidden="true" />
                </button>
              )}
            </div>
            <SortableHoldings
              holdings={holdings}
              mode={mode}
              onToggleMode={toggleMode}
              editing={editing}
              onRequestEdit={() => setEditing(true)}
              onReorder={(ids) => void save(ids)}
              onOpen={(id) => navigate(`/instrument/${encodeURIComponent(id)}`)}
              onDelete={(id) =>
                setPendingDelete(holdings.find((h) => h.instrument.id === id) ?? null)
              }
            />
          </div>
        </>
      )}

      <DeleteHoldingSheet holding={pendingDelete} onClose={() => setPendingDelete(null)} />

      <ProfileSwitchSheet
        open={switchOpen}
        profiles={profiles}
        activeId={activeId}
        onClose={() => setSwitchOpen(false)}
        onSelect={(id) => {
          void setActive(id)
          setSwitchOpen(false)
        }}
      />
    </>
  )
}

function ProfileSwitchSheet({
  open,
  profiles,
  activeId,
  onClose,
  onSelect,
}: {
  open: boolean
  profiles: Profile[]
  activeId: string | undefined
  onClose: () => void
  onSelect: (id: string) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Switch profile">
      <div className="list">
        {profiles.map((p) => (
          <button
            key={p.id}
            className="setting"
            type="button"
            onClick={() => onSelect(p.id)}
          >
            <span className="lbl">
              <div className="t">{p.name}</div>
            </span>
            {p.id === activeId && (
              <span className="ic" style={{ color: 'var(--accent)' }} aria-label="Active">
                <Check size={18} />
              </span>
            )}
          </button>
        ))}
      </div>
    </Sheet>
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
