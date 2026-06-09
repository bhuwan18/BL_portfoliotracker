import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, ArrowUpDown, CandlestickChart, Check, ChevronDown, Layers, Plus, RefreshCw, Settings, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { usePortfolio, useTrackedInstruments } from '../hooks/usePortfolio'
import { useActiveProfile, useProfiles } from '../hooks/useProfiles'
import { useReturnMode } from '../hooks/useReturnMode'
import { useDayMode, useIrrSleeve, type IrrSleeve } from '../hooks/useHeroToggles'
import { orderHoldings, useHoldingsOrder } from '../hooks/useHoldingsOrder'
import { useMarket } from '../store/market'
import { AppBar, EmptyState, Loading, Spinner } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { SortableHoldings } from '../components/SortableHoldings'
import { DeleteHoldingSheet } from '../components/DeleteHoldingSheet'
import { formatINR, formatINRCompact, formatPct, formatSignedINR, sign } from '../lib/format'
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
  const [typeFilter, setTypeFilter] = useState<'all' | 'stock' | 'mf'>('all')

  const holdings = useMemo(
    () => orderHoldings(summary.holdings, order),
    [summary.holdings, order],
  )
  const hasHoldings = summary.holdings.length > 0

  // Subtle stocks/MF view filter (Holdings header). Only meaningful when the portfolio holds
  // both kinds; with a single kind the toggle is hidden and the filter stays 'all'.
  const hasStocks = summary.holdings.some((h) => h.instrument.type === 'stock')
  const hasMf = summary.holdings.some((h) => h.instrument.type === 'mf')
  const showTypeFilter = hasStocks && hasMf
  // If the filtered-to kind disappears (e.g. its last holding deleted), revert to showing all.
  useEffect(() => {
    if (!showTypeFilter && typeFilter !== 'all') setTypeFilter('all')
  }, [showTypeFilter, typeFilter])
  const visibleHoldings = useMemo(
    () => (typeFilter === 'all' ? holdings : holdings.filter((h) => h.instrument.type === typeFilter)),
    [holdings, typeFilter],
  )
  // Reordering persists a single ordered id list, so it must run over the full holdings set;
  // entering edit mode clears any active type filter to keep that saved order complete.
  const enterEdit = () => {
    setTypeFilter('all')
    setEditing(true)
  }

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
          <Hero summary={summary} />
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
                <span className="section-actions">
                  {showTypeFilter && (
                    <span className="type-filter" role="group" aria-label="Filter holdings by type">
                      <button
                        type="button"
                        className={`type-filter-btn stock${typeFilter === 'stock' ? ' active' : ''}`}
                        aria-pressed={typeFilter === 'stock'}
                        aria-label="Show stocks only"
                        onClick={() => setTypeFilter((f) => (f === 'stock' ? 'all' : 'stock'))}
                      >
                        <CandlestickChart size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={`type-filter-btn mf${typeFilter === 'mf' ? ' active' : ''}`}
                        aria-pressed={typeFilter === 'mf'}
                        aria-label="Show mutual funds only"
                        onClick={() => setTypeFilter((f) => (f === 'mf' ? 'all' : 'mf'))}
                      >
                        <Layers size={15} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                  <button
                    type="button"
                    className="icon-link"
                    aria-label="Reorder holdings"
                    onClick={enterEdit}
                  >
                    <ArrowUpDown size={15} aria-hidden="true" />
                  </button>
                </span>
              )}
            </div>
            <SortableHoldings
              holdings={visibleHoldings}
              mode={mode}
              onToggleMode={toggleMode}
              editing={editing}
              onRequestEdit={enterEdit}
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

function Hero({ summary }: { summary: ReturnType<typeof usePortfolio>['summary'] }) {
  const showAlloc = summary.currentValue > 0
  const stockPct = showAlloc ? (summary.byType.stock / summary.currentValue) * 100 : 0
  const mfPct = showAlloc ? (summary.byType.mf / summary.currentValue) * 100 : 0

  // Two hero metrics, both glanceable: today's move and the overall return. Net worth is
  // deliberately demoted to a stat tile below — a return % is glanceable without exposing
  // how much wealth is on screen.
  //
  // Tile 1 (Today) toggles between the percentage move and the absolute ₹ gain.
  // Tile 2 (Overall) cycles XIRR across sleeves: blended → MF → Equity. Both choices are
  // persisted (see useHeroToggles). The ₹ figure on each tile is the demoted sub-line.
  const [dayMode, toggleDayMode] = useDayMode()
  const [sleeve, setSleeve] = useIrrSleeve()

  const dayUp = summary.dayChange >= 0
  const dayTri = dayUp ? '▲' : '▼'

  // The XIRR sleeve toggle is only offered when the portfolio actually holds both kinds —
  // with a single kind the blended figure already *is* that sleeve, so cycling is pointless.
  const hasStocks = summary.byType.stock > 0
  const hasMf = summary.byType.mf > 0
  const sleeves: IrrSleeve[] = hasStocks && hasMf ? ['all', 'mf', 'stock'] : ['all']
  const canCycle = sleeves.length > 1
  // If the selected sleeve disappears (its last priced holding removed, or only one kind
  // remains), fall back to the blended figure.
  useEffect(() => {
    if (!sleeves.includes(sleeve)) setSleeve('all')
  }, [hasStocks, hasMf, sleeve, setSleeve])

  const activeSleeve = sleeves.includes(sleeve) ? sleeve : 'all'
  const sleeveXirr =
    activeSleeve === 'all'
      ? summary.xirr
      : activeSleeve === 'stock'
        ? summary.xirrByType.stock
        : summary.xirrByType.mf
  const sleevePnl =
    activeSleeve === 'all'
      ? summary.totalPnl
      : activeSleeve === 'stock'
        ? summary.pnlByType.stock
        : summary.pnlByType.mf
  const sleeveLabel =
    activeSleeve === 'all' ? 'Overall' : activeSleeve === 'stock' ? 'Equity' : 'MF'

  const cycleSleeve = () => {
    const i = sleeves.indexOf(activeSleeve)
    setSleeve(sleeves[(i + 1) % sleeves.length])
  }

  const overall = (
    <>
      <div className="k">
        {sleeveLabel} · XIRR
        {canCycle && <ArrowLeftRight size={12} aria-hidden="true" />}
      </div>
      <div className="big tnum">
        {sleeveXirr == null ? '—' : <>{sleeveXirr >= 0 ? '▲' : '▼'} {formatPct(sleeveXirr, false)}</>}
      </div>
      <div className="sub tnum">{formatSignedINR(sleevePnl, 0)}</div>
    </>
  )

  return (
    <div className="hero">
      <div className="hero-metrics">
        <button
          type="button"
          className="hero-metric"
          onClick={toggleDayMode}
          aria-label="Toggle today's gain between percent and rupees"
        >
          <div className="k">
            Today
            <ArrowLeftRight size={12} aria-hidden="true" />
          </div>
          <div className="big tnum">
            {dayTri}{' '}
            {dayMode === 'pct'
              ? formatPct(summary.dayChangePct, false)
              : formatINRCompact(Math.abs(summary.dayChange))}
          </div>
          <div className="sub tnum">
            {dayMode === 'pct'
              ? formatSignedINR(summary.dayChange, 0)
              : formatPct(summary.dayChangePct)}
          </div>
        </button>
        {canCycle ? (
          <button
            type="button"
            className="hero-metric"
            onClick={cycleSleeve}
            aria-label="Cycle XIRR between overall, mutual funds and equity"
          >
            {overall}
          </button>
        ) : (
          <div className="hero-metric">{overall}</div>
        )}
      </div>

      <div className="stat-strip">
        <div className="hero-stat">
          <div className="k">Current value</div>
          <div className="v tnum">{formatINR(summary.currentValue, 0)}</div>
        </div>
        <div className="hero-stat">
          <div className="k">Invested</div>
          <div className="v tnum">{formatINR(summary.invested, 0)}</div>
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
              {summary.xirrByType.stock != null && (
                <span className="xirr">
                  {' · '}XIRR {summary.xirrByType.stock >= 0 ? '▲' : '▼'}{' '}
                  {formatPct(summary.xirrByType.stock, false)}
                </span>
              )}
            </span>
            <span>
              <span className="dot" style={{ background: 'var(--mf)' }} /> Mutual Funds {mfPct.toFixed(1)}%
              {summary.xirrByType.mf != null && (
                <span className="xirr">
                  {' · '}XIRR {summary.xirrByType.mf >= 0 ? '▲' : '▼'}{' '}
                  {formatPct(summary.xirrByType.mf, false)}
                </span>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
