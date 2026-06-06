import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef } from 'react'
import { db } from '../db'
import { ensureProfiles, runDueSips } from '../db/repo'
import { useActiveProfile } from './useProfiles'
import { useMarket, pricesAreStale } from '../store/market'
import { computeHolding, computePortfolio } from '../domain/portfolio'
import type {
  Holding,
  Instrument,
  PortfolioSummary,
  PriceSnapshot,
  Transaction,
} from '../domain/types'

function groupByInstrument(txns: Transaction[]): Map<string, Transaction[]> {
  const byInst = new Map<string, Transaction[]>()
  for (const t of txns) {
    const arr = byInst.get(t.instrumentId)
    if (arr) arr.push(t)
    else byInst.set(t.instrumentId, [t])
  }
  return byInst
}

function pricesToMap(prices: Record<string, PriceSnapshot>): Map<string, PriceSnapshot> {
  return new Map(Object.entries(prices))
}

export function usePortfolio(): {
  summary: PortfolioSummary
  instruments: Instrument[]
  loading: boolean
} {
  const { activeId } = useActiveProfile()
  // Instruments are shared reference data; only transactions are profile-scoped. While the
  // active profile is still resolving (activeId === undefined) the txn query returns undefined
  // so `loading` stays true and the screen shows its spinner instead of flashing empty.
  const instruments = useLiveQuery(() => db.instruments.toArray())
  const transactions = useLiveQuery(
    () =>
      activeId === undefined
        ? Promise.resolve<Transaction[]>([])
        : db.transactions.where('profileId').equals(activeId).toArray(),
    [activeId],
  )
  const prices = useMarket((s) => s.prices)
  const loading = activeId === undefined || instruments === undefined || transactions === undefined

  const summary = useMemo(
    () =>
      computePortfolio(
        instruments ?? [],
        groupByInstrument(transactions ?? []),
        pricesToMap(prices),
      ),
    [instruments, transactions, prices],
  )

  return { summary, instruments: instruments ?? [], loading }
}

export function useInstrument(instrumentId: string | undefined): Instrument | undefined {
  return useLiveQuery(
    () => (instrumentId ? db.instruments.get(instrumentId) : undefined),
    [instrumentId],
  )
}

export function useInstrumentTxns(instrumentId: string | undefined): Transaction[] {
  const { activeId } = useActiveProfile()
  return (
    useLiveQuery(
      () =>
        instrumentId && activeId !== undefined
          ? db.transactions
              .where('instrumentId')
              .equals(instrumentId)
              .and((t) => t.profileId === activeId)
              .toArray()
          : Promise.resolve<Transaction[]>([]),
      [instrumentId, activeId],
    ) ?? []
  )
}

export function useHolding(instrumentId: string | undefined): Holding | null {
  const instrument = useInstrument(instrumentId)
  const txns = useInstrumentTxns(instrumentId)
  const price = useMarket((s) => (instrumentId ? s.prices[instrumentId] : undefined))
  return useMemo(() => {
    if (!instrument || txns.length === 0) return null
    return computeHolding(instrument, txns, price)
  }, [instrument, txns, price])
}

// Instruments worth pricing: anything currently held in the active profile.
export function useTrackedInstruments(): Instrument[] {
  const { activeId } = useActiveProfile()
  const instruments = useLiveQuery(() => db.instruments.toArray())
  const txns = useLiveQuery(
    () =>
      activeId === undefined
        ? Promise.resolve<Transaction[]>([])
        : db.transactions.where('profileId').equals(activeId).toArray(),
    [activeId],
  )
  return useMemo(() => {
    if (!instruments || txns === undefined) return []
    const ids = new Set<string>()
    for (const t of txns) ids.add(t.instrumentId)
    return instruments.filter((i) => ids.has(i.id))
  }, [instruments, txns])
}

// One-time bootstrap: hydrate cached prices, materialize due SIPs, then refresh quotes.
export function useBootstrap(): void {
  const hydrate = useMarket((s) => s.hydrate)
  const refresh = useMarket((s) => s.refresh)
  const tracked = useTrackedInstruments()
  const ran = useRef(false)
  const refreshedFor = useRef('')

  useEffect(() => {
    void (async () => {
      await hydrate()
      if (!ran.current) {
        ran.current = true
        // Profiles must exist before profile-scoped reads/writes resolve meaningfully, and
        // before SIPs materialize (each generated txn inherits its SIP's profileId).
        await ensureProfiles().catch(() => {})
        await runDueSips().catch(() => {})
      }
    })()
  }, [hydrate])

  useEffect(() => {
    if (tracked.length === 0) return
    const key = tracked.map((i) => i.id).sort().join('|')
    if (key === refreshedFor.current) return
    refreshedFor.current = key
    // Auto-refresh on load only when prices are stale (>2h since the last bulk refresh).
    // The manual button still calls refresh() directly, bypassing this gate.
    void (async () => {
      if (await pricesAreStale()) void refresh(tracked)
    })()
  }, [tracked, refresh])
}
