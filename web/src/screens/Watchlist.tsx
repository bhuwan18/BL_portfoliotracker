import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, RefreshCw, Star, Trash2 } from 'lucide-react'
import { db } from '../db'
import { addToWatchlist, removeFromWatchlist } from '../db/repo'
import { useMarket } from '../store/market'
import { buildInstrument, type UnifiedSearchResult } from '../api/instrument'
import { AppBar, EmptyState, Loading, Pill, Spinner } from '../components/ui'
import { InstrumentAvatar } from '../components/InstrumentAvatar'
import { SearchSheet } from '../components/SearchSheet'
import type { Instrument } from '../domain/types'
import { formatINR } from '../lib/format'

export function WatchlistScreen() {
  const navigate = useNavigate()
  const watch = useLiveQuery(() => db.watchlist.toArray())
  const instruments = useLiveQuery(() => db.instruments.toArray())
  const prices = useMarket((s) => s.prices)
  const refreshing = useMarket((s) => s.refreshing)
  const refresh = useMarket((s) => s.refresh)
  const refreshOne = useMarket((s) => s.refreshOne)
  const [searchOpen, setSearchOpen] = useState(false)

  const loading = watch === undefined || instruments === undefined

  const watched = useMemo<Instrument[]>(() => {
    if (!watch || !instruments) return []
    const byId = new Map(instruments.map((i) => [i.id, i] as const))
    return watch
      .slice()
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((w) => byId.get(w.instrumentId))
      .filter((i): i is Instrument => i != null)
  }, [watch, instruments])

  // On mount (and whenever the set of watched instruments changes), refresh quotes.
  const refreshedFor = useRef('')
  useEffect(() => {
    if (watched.length === 0) return
    const key = watched
      .map((i) => i.id)
      .sort()
      .join('|')
    if (key === refreshedFor.current) return
    refreshedFor.current = key
    void refresh(watched)
  }, [watched, refresh])

  async function handlePick(r: UnifiedSearchResult) {
    setSearchOpen(false)
    const inst = await buildInstrument(r)
    await addToWatchlist(inst)
    void refreshOne(inst)
  }

  const addButton = (
    <button className="btn primary" type="button" onClick={() => setSearchOpen(true)}>
      <Plus size={18} /> Add to watchlist
    </button>
  )

  return (
    <>
      <AppBar
        title="Watchlist"
        right={
          <button
            className="icon-btn"
            type="button"
            aria-label="Refresh prices"
            onClick={() => refresh(watched)}
          >
            {refreshing ? <Spinner /> : <RefreshCw size={19} />}
          </button>
        }
      />

      {loading ? (
        <Loading label="Loading watchlist…" />
      ) : watched.length === 0 ? (
        <div className="screen">
          <EmptyState
            icon={<Star size={28} />}
            title="Nothing watched yet"
            message="Track stocks and mutual funds without adding a transaction. Add one to see its live price and day's change."
            action={addButton}
          />
        </div>
      ) : (
        <div className="screen section">
          <div className="list">
            {watched.map((inst) => {
              const snap = prices[inst.id]
              const subtitle =
                inst.type === 'mf'
                  ? 'Mutual Fund'
                  : [inst.exchange, inst.symbol].filter(Boolean).join(' · ') || 'Stock'
              const pct =
                snap && snap.prevClose > 0
                  ? ((snap.price - snap.prevClose) / snap.prevClose) * 100
                  : null
              return (
                <div
                  key={inst.id}
                  className="row tap"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/instrument/${encodeURIComponent(inst.id)}`)}
                >
                  <InstrumentAvatar name={inst.name} type={inst.type} />
                  <div className="main">
                    <div className="title">{inst.name}</div>
                    <div className="subtitle">{subtitle}</div>
                  </div>
                  <div className="end">
                    <div className="v">{snap ? formatINR(snap.price) : '—'}</div>
                    <div className="s">{pct != null ? <Pill pct={pct} /> : '—'}</div>
                  </div>
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label={`Remove ${inst.name} from watchlist`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void removeFromWatchlist(inst.id)
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && watched.length > 0 && (
        <div className="fab-bottom">
          <button
            className="icon-btn"
            type="button"
            aria-label="Add to watchlist"
            onClick={() => setSearchOpen(true)}
            style={{
              width: 54,
              height: 54,
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              boxShadow: '0 8px 20px var(--accent-soft), 0 6px 16px rgba(0,0,0,0.25)',
            }}
          >
            <Plus size={24} />
          </button>
        </div>
      )}

      <SearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={handlePick}
        title="Add to watchlist"
      />
    </>
  )
}
