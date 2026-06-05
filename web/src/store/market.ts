import { create } from 'zustand'
import type { Instrument, PriceSnapshot } from '../domain/types'
import { fetchQuote } from '../api/instrument'
import { db } from '../db'

interface MarketState {
  prices: Record<string, PriceSnapshot>
  refreshing: boolean
  lastRefresh: number | null
  hydrate: () => Promise<void>
  setPrice: (p: PriceSnapshot) => void
  refreshOne: (inst: Instrument) => Promise<PriceSnapshot | null>
  refresh: (instruments: Instrument[]) => Promise<void>
}

const CONCURRENCY = 5

export const useMarket = create<MarketState>((set, get) => ({
  prices: {},
  refreshing: false,
  lastRefresh: null,

  // Load last-known prices from IndexedDB so the UI shows values instantly / offline.
  async hydrate() {
    const rows = await db.prices.toArray()
    const map: Record<string, PriceSnapshot> = {}
    for (const r of rows) map[r.instrumentId] = r
    set({ prices: map })
  },

  setPrice(p) {
    set((s) => ({ prices: { ...s.prices, [p.instrumentId]: p } }))
    void db.prices.put(p).catch(() => {})
  },

  async refreshOne(inst) {
    const snap = await fetchQuote(inst)
    if (snap) get().setPrice(snap)
    return snap
  },

  async refresh(instruments) {
    if (get().refreshing || instruments.length === 0) return
    set({ refreshing: true })
    try {
      const queue = [...instruments]
      const worker = async () => {
        for (;;) {
          const inst = queue.shift()
          if (!inst) break
          try {
            const snap = await fetchQuote(inst)
            if (snap) get().setPrice(snap)
          } catch {
            /* individual failures are non-fatal */
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
      set({ lastRefresh: Date.now() })
    } finally {
      set({ refreshing: false })
    }
  },
}))
