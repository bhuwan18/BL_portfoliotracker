import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Star, Trash2 } from 'lucide-react'
import { AppBar, Delta, EmptyState, Pill } from '../components/ui'
import { PriceChart } from '../components/PriceChart'
import { InstrumentAvatar } from '../components/InstrumentAvatar'
import { useHolding, useInstrument, useInstrumentTxns } from '../hooks/usePortfolio'
import { useMarket } from '../store/market'
import { db } from '../db'
import { addToWatchlist, deleteTransaction, pruneInstrument, removeFromWatchlist } from '../db/repo'
import { CHART_RANGES, fetchHistory, type ChartRange } from '../api/instrument'
import { formatDate, formatINR, formatUnits, sign } from '../lib/format'

export function InstrumentDetailScreen() {
  const navigate = useNavigate()
  const { id = '' } = useParams<'id'>()

  const instrument = useInstrument(id)
  const holding = useHolding(id)
  const txns = useInstrumentTxns(id)
  const snapshot = useMarket((s) => s.prices[id])
  const refreshOne = useMarket((s) => s.refreshOne)
  const watched = useLiveQuery(() => (id ? db.watchlist.get(id) : undefined), [id])

  const [range, setRange] = useState<ChartRange>('1y')
  const [points, setPoints] = useState<{ t: number; close: number }[]>([])
  const [chartLoading, setChartLoading] = useState(true)

  // Refresh the live price once the instrument is known.
  useEffect(() => {
    if (instrument) void refreshOne(instrument)
  }, [instrument, refreshOne])

  // Load chart history for the selected range; ignore stale responses.
  const seq = useRef(0)
  useEffect(() => {
    if (!instrument) return
    const my = ++seq.current
    setChartLoading(true)
    void fetchHistory(instrument, range)
      .then((h) => {
        if (my !== seq.current) return
        setPoints(h?.points ?? [])
        setChartLoading(false)
      })
      .catch(() => {
        if (my !== seq.current) return
        setPoints([])
        setChartLoading(false)
      })
  }, [instrument, range])

  if (instrument === undefined) {
    return (
      <>
        <AppBar title="Instrument" back />
        <div className="screen">
          <EmptyState
            title="Instrument not found"
            message="This instrument is no longer in your portfolio."
            action={
              <button className="btn ghost" type="button" onClick={() => navigate(-1)}>
                Go back
              </button>
            }
          />
        </div>
      </>
    )
  }

  const isMf = instrument.type === 'mf'
  const price = snapshot?.price ?? holding?.price ?? 0
  const hasPrice = snapshot != null || (holding?.hasPrice ?? false)
  const dayChange = snapshot ? snapshot.price - snapshot.prevClose : 0
  const dayChangePct = snapshot && snapshot.prevClose ? (dayChange / snapshot.prevClose) * 100 : 0

  const sortedTxns = [...txns].sort((a, b) => b.date.localeCompare(a.date))

  async function toggleWatch() {
    if (watched) await removeFromWatchlist(instrument!.id)
    else await addToWatchlist(instrument!)
  }

  async function removeTxn(txnId: string) {
    await deleteTransaction(txnId)
    await pruneInstrument(instrument!.id)
  }

  return (
    <>
      <AppBar
        title={instrument.name}
        subtitle={instrument.category}
        back
        right={
          <button
            className="icon-btn"
            type="button"
            aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            onClick={() => void toggleWatch()}
          >
            <Star size={19} fill={watched ? 'currentColor' : 'none'} />
          </button>
        }
      />

      <div className="screen section" style={{ marginTop: 6 }}>
        <div className="card">
          <div className="row" style={{ border: 'none', background: 'transparent', padding: 0, gap: 12 }}>
            <InstrumentAvatar name={instrument.name} type={instrument.type} />
            <div className="main">
              <div className="title">{instrument.name}</div>
              <div className="subtitle">
                {isMf ? 'Mutual Fund' : [instrument.exchange, instrument.symbol].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>

          <div className="detail-price">
            <span className="p tnum">{hasPrice ? formatINR(price) : '—'}</span>
            {snapshot && <Pill pct={dayChangePct} value={dayChange} />}
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            {isMf ? 'Latest NAV' : 'Last price'}
            {snapshot && (
              <>
                {' · '}
                <Delta value={dayChange} pct={dayChangePct} />
              </>
            )}
          </div>

          <PriceChart points={points} loading={chartLoading} />

          <div className="range-row">
            {CHART_RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={r.value === range ? 'active' : ''}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {holding && holding.units > 0 && (
        <div className="screen section">
          <div className="section-title">Your position</div>
          <div className="card">
            <div className="summary-2">
              <div>
                <div className="k">Units</div>
                <div className="v">{formatUnits(holding.units)}</div>
              </div>
              <div>
                <div className="k">Avg cost</div>
                <div className="v">{formatINR(holding.avgCost)}</div>
              </div>
              <div>
                <div className="k">Invested</div>
                <div className="v">{formatINR(holding.investedValue, 0)}</div>
              </div>
              <div>
                <div className="k">Current value</div>
                <div className="v">{holding.hasPrice ? formatINR(holding.currentValue, 0) : '—'}</div>
              </div>
              <div>
                <div className="k">Unrealized P/L</div>
                <div className="v">
                  {holding.hasPrice ? <Delta value={holding.pnl} pct={holding.pnlPct} decimals={0} /> : '—'}
                </div>
              </div>
              <div>
                <div className="k">Day's gain</div>
                <div className="v">
                  {holding.hasPrice ? (
                    <Delta value={holding.dayChange} pct={holding.dayChangePct} decimals={0} />
                  ) : (
                    '—'
                  )}
                </div>
              </div>
              {sign(holding.realizedPnl) !== 'zero' && (
                <div>
                  <div className="k">Realized P/L</div>
                  <div className="v">
                    <Delta value={holding.realizedPnl} decimals={0} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="screen section">
        <div className="section-title">Transactions</div>
        {sortedTxns.length === 0 ? (
          <EmptyState title="No transactions" message="Add a buy or sell to start tracking this instrument." />
        ) : (
          <div className="list">
            {sortedTxns.map((t) => (
              <div key={t.id} className="row">
                <span className="badge-type">{t.kind === 'buy' ? 'BUY' : 'SELL'}</span>
                <div className="main">
                  <div className="title">{formatDate(t.date)}</div>
                  <div className="subtitle">
                    {formatUnits(t.units)} {isMf ? 'units' : 'qty'} @ {formatINR(t.price)}
                  </div>
                </div>
                <div className="end">
                  <div className="v">{formatINR(t.units * t.price, 0)}</div>
                  {t.notes && <div className="s faint">{t.notes}</div>}
                </div>
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="Delete transaction"
                  onClick={() => void removeTxn(t.id)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          className="btn ghost"
          type="button"
          style={{ width: '100%', marginTop: 14 }}
          onClick={() => navigate('/add', { state: { instrumentId: instrument.id } })}
        >
          <Plus size={18} /> Add transaction
        </button>
      </div>
    </>
  )
}
