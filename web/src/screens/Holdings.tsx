import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCw, Wallet } from 'lucide-react'
import { usePortfolio, useTrackedInstruments } from '../hooks/usePortfolio'
import { useReturnMode } from '../hooks/useReturnMode'
import { useMarket } from '../store/market'
import { AppBar, EmptyState, Loading, Pill, SegmentedControl, Spinner } from '../components/ui'
import { HoldingRow } from '../components/HoldingRow'
import type { InstrumentType } from '../domain/types'
import { formatINR } from '../lib/format'

type Filter = 'all' | InstrumentType

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'stock', label: 'Stocks' },
  { value: 'mf', label: 'Mutual Funds' },
]

export function HoldingsScreen() {
  const navigate = useNavigate()
  const { summary, loading } = usePortfolio()
  const tracked = useTrackedInstruments()
  const refreshing = useMarket((s) => s.refreshing)
  const refresh = useMarket((s) => s.refresh)
  const [filter, setFilter] = useState<Filter>('all')
  const [mode, toggleMode] = useReturnMode()

  const filtered = useMemo(
    () =>
      filter === 'all'
        ? summary.holdings
        : summary.holdings.filter((h) => h.instrument.type === filter),
    [summary.holdings, filter],
  )

  const totalValue = useMemo(
    () => filtered.reduce((sum, h) => sum + (h.hasPrice ? h.currentValue : 0), 0),
    [filtered],
  )
  const totalInvested = useMemo(
    () => filtered.reduce((sum, h) => sum + h.investedValue, 0),
    [filtered],
  )
  const totalPnl = totalValue - totalInvested
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

  const hasHoldings = summary.holdings.length > 0

  return (
    <>
      <AppBar
        title="Holdings"
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
        <Loading label="Loading holdings…" />
      ) : !hasHoldings ? (
        <div className="screen">
          <EmptyState
            icon={<Wallet size={28} />}
            title="No holdings yet"
            message="Add your first stock or mutual fund transaction to start tracking your holdings."
            action={
              <button className="btn primary" type="button" onClick={() => navigate('/add')}>
                <Plus size={18} /> Add transaction
              </button>
            }
          />
        </div>
      ) : (
        <div className="screen">
          <div className="section">
            <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
          </div>

          <div className="card spread" style={{ marginTop: 16 }}>
            <div>
              <div className="faint" style={{ fontSize: 12 }}>
                Current value
              </div>
              <div className="tnum" style={{ fontWeight: 800, fontSize: 20 }}>
                {formatINR(totalValue, 0)}
              </div>
            </div>
            <Pill pct={totalPnlPct} />
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="Nothing here" message="No holdings match this filter." />
          ) : (
            <div className="list" style={{ marginTop: 16 }}>
              {filtered.map((h) => (
                <HoldingRow
                  key={h.instrument.id}
                  holding={h}
                  onClick={() => navigate(`/instrument/${encodeURIComponent(h.instrument.id)}`)}
                  mode={mode}
                  onToggleMode={toggleMode}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
