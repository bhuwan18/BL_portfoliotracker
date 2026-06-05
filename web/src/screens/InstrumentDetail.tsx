import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import { AppBar, Delta, EmptyState, Pill } from '../components/ui'
import { PriceChart } from '../components/PriceChart'
import { InstrumentAvatar } from '../components/InstrumentAvatar'
import { EditTransactionSheet } from '../components/EditTransactionSheet'
import { useHolding, useInstrument, useInstrumentTxns } from '../hooks/usePortfolio'
import { useMarket } from '../store/market'
import { db } from '../db'
import { deleteSip, deleteTransaction, pruneInstrument, setSipActive } from '../db/repo'
import { CHART_RANGES, fetchHistory, type ChartRange } from '../api/instrument'
import { FREQUENCY_LABEL, nextDueDate } from '../domain/sip'
import type { Transaction } from '../domain/types'
import { formatDate, formatDateShort, formatINR, formatNumber, formatSignedNumber, formatUnits, sign } from '../lib/format'

export function InstrumentDetailScreen() {
  const navigate = useNavigate()
  const { id = '' } = useParams<'id'>()

  const instrument = useInstrument(id)
  const holding = useHolding(id)
  const txns = useInstrumentTxns(id)
  const snapshot = useMarket((s) => s.prices[id])
  const refreshOne = useMarket((s) => s.refreshOne)
  const sips = useLiveQuery(
    () => (id ? db.sips.where('instrumentId').equals(id).toArray() : []),
    [id],
  )

  const [range, setRange] = useState<ChartRange>('1y')
  const [points, setPoints] = useState<{ t: number; close: number }[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [editing, setEditing] = useState<Transaction | null>(null)

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
  const asOf = snapshot?.asOf ?? holding?.priceAsOf
  const dayChange = snapshot ? snapshot.price - snapshot.prevClose : 0
  const dayChangePct = snapshot && snapshot.prevClose ? (dayChange / snapshot.prevClose) * 100 : 0

  const sortedTxns = [...txns].sort((a, b) => b.date.localeCompare(a.date))

  async function removeTxn(txnId: string) {
    await deleteTransaction(txnId)
    await pruneInstrument(instrument!.id)
  }

  async function removeSip(sipId: string) {
    if (!window.confirm('Delete this SIP? Existing transactions will be kept.')) return
    await deleteSip(sipId, false)
  }

  return (
    <>
      <AppBar title={instrument.name} subtitle={instrument.category} back />

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

      {isMf && sips && sips.length > 0 && (
        <div className="screen section">
          <div className="section-title">SIP</div>
          <div className="list">
            {sips.map((sip) => (
              <div key={sip.id} className="row">
                <div className="main">
                  <div className="title">
                    {formatINR(sip.amount)} · {FREQUENCY_LABEL[sip.frequency]}
                  </div>
                  <div className="subtitle">
                    {sip.active ? `Next ${formatDate(nextDueDate(sip))}` : 'Paused'}
                  </div>
                </div>
                <button
                  className={sip.active ? 'switch on' : 'switch'}
                  type="button"
                  aria-label={sip.active ? 'Pause SIP' : 'Resume SIP'}
                  onClick={() => void setSipActive(sip.id, !sip.active)}
                />
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="Delete SIP"
                  onClick={() => void removeSip(sip.id)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="screen section">
        <div className="section-title">Transactions</div>
        {sortedTxns.length === 0 ? (
          <EmptyState title="No transactions" message="Add a buy or sell to start tracking this instrument." />
        ) : (
          <div className="list">
            {sortedTxns.map((t) => {
              const amount = t.units * t.price // invested (buy) / proceeds (sell)
              const currentVal = t.units * price
              const gain = currentVal - amount
              // Per-lot performance only makes sense for held buy lots with a live price.
              const showPerf = hasPrice && t.kind === 'buy'
              return (
                <div
                  key={t.id}
                  className="row tap txn-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit transaction ${formatDate(t.date)}`}
                  onClick={() => setEditing(t)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setEditing(t)
                    }
                  }}
                >
                  <div className="main">
                    <div className="title">
                      {formatDate(t.date)}
                      {t.kind === 'sell' && <span className="badge-type sell">Sell</span>}
                    </div>
                    {showPerf && asOf != null && (
                      <div className="subtitle">
                        As on {formatDateShort(asOf)} @ {formatNumber(price, 2)}
                      </div>
                    )}
                    <div className="subtitle">
                      {isMf ? 'Units' : 'Qty'} {formatUnits(t.units)} @ {formatNumber(t.price, 2)}
                    </div>
                    {t.notes && <div className="subtitle faint">{t.notes}</div>}
                  </div>
                  <div className="end">
                    {showPerf ? (
                      <>
                        <span className={`gain-badge ${sign(gain)}`}>{formatSignedNumber(gain, 0)}</span>
                        <div className="v">{formatNumber(currentVal, 0)}</div>
                        <div className="s faint">{formatNumber(amount, 0)}</div>
                      </>
                    ) : (
                      <div className="v">{formatNumber(amount, 0)}</div>
                    )}
                  </div>
                  <ChevronRight size={16} className="txn-chevron" aria-hidden="true" />
                </div>
              )
            })}
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

      <EditTransactionSheet
        txn={editing}
        instrument={instrument}
        onClose={() => setEditing(null)}
        onDelete={removeTxn}
      />
    </>
  )
}
