import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { useActiveProfile } from './useProfiles'
import { fetchHistory, type ChartRange } from '../api/instrument'
import {
  buildPortfolioHistory,
  type PricePoint,
  type ValuePoint,
} from '../domain/portfolioHistory'
import type { Instrument, Transaction } from '../domain/types'

const CONCURRENCY = 5

// Historical price/NAV series are reference data (independent of which profile you're
// viewing), so we cache the full 'max' series per instrument for the whole session. Range
// toggles then re-slice purely in buildPortfolioHistory and trigger ZERO refetches.
const historyCache = new Map<string, PricePoint[] | null>()
const inflight = new Map<string, Promise<PricePoint[] | null>>()

async function getMaxHistory(inst: Instrument): Promise<PricePoint[] | null> {
  if (historyCache.has(inst.id)) return historyCache.get(inst.id)!
  const pending = inflight.get(inst.id)
  if (pending) return pending
  const p = fetchHistory(inst, 'max')
    .then((h) => {
      const pts = h ? h.points : null
      historyCache.set(inst.id, pts)
      inflight.delete(inst.id)
      return pts
    })
    .catch(() => {
      historyCache.set(inst.id, null)
      inflight.delete(inst.id)
      return null
    })
  inflight.set(inst.id, p)
  return p
}

function groupByInstrument(txns: Transaction[]): Map<string, Transaction[]> {
  const byInst = new Map<string, Transaction[]>()
  for (const t of txns) {
    const arr = byInst.get(t.instrumentId)
    if (arr) arr.push(t)
    else byInst.set(t.instrumentId, [t])
  }
  return byInst
}

// Portfolio value over time for the active profile. Fetches each held instrument's full
// price history once per session (bounded to 5 concurrent fetches), then derives every
// range client-side. `loading` is true until that first fetch pass settles.
export function usePortfolioHistory(range: ChartRange): {
  points: ValuePoint[]
  loading: boolean
} {
  const { activeId } = useActiveProfile()
  const instruments = useLiveQuery(() => db.instruments.toArray())
  const transactions = useLiveQuery(
    () =>
      activeId === undefined
        ? Promise.resolve<Transaction[]>([])
        : db.transactions.where('profileId').equals(activeId).toArray(),
    [activeId],
  )

  const txnsByInstrument = useMemo(
    () => groupByInstrument(transactions ?? []),
    [transactions],
  )

  // Instruments that have transactions in this profile (held or since-sold — their history
  // shapes the curve either way).
  const tracked = useMemo(() => {
    if (!instruments) return []
    return instruments.filter((i) => txnsByInstrument.has(i.id))
  }, [instruments, txnsByInstrument])

  const idsKey = useMemo(() => tracked.map((i) => i.id).sort().join('|'), [tracked])

  const [histories, setHistories] = useState<Map<string, PricePoint[]>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (instruments === undefined || transactions === undefined) return
    if (tracked.length === 0) {
      setHistories(new Map())
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const queue = [...tracked]
    const collected = new Map<string, PricePoint[]>()
    const worker = async () => {
      for (;;) {
        const inst = queue.shift()
        if (!inst) break
        const pts = await getMaxHistory(inst)
        if (pts) collected.set(inst.id, pts)
      }
    }
    void Promise.all(Array.from({ length: CONCURRENCY }, worker)).then(() => {
      if (cancelled) return
      setHistories(collected)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // Keyed on the instrument SET (not range): fetching happens once per set, range toggles
    // are pure recomputes below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, instruments === undefined, transactions === undefined])

  const points = useMemo(
    () =>
      buildPortfolioHistory({
        instruments: tracked,
        txnsByInstrument,
        historyByInstrument: histories,
        range,
      }),
    [tracked, txnsByInstrument, histories, range],
  )

  return { points, loading }
}
