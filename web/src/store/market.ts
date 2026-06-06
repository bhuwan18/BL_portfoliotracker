import { create } from 'zustand'
import type { Instrument, PriceSnapshot } from '../domain/types'
import { fetchQuote } from '../api/instrument'
import { db, getSetting, setSetting } from '../db'

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

export const LAST_REFRESH_KEY = 'lastPriceRefresh'
export const PRICE_STALE_MS = 2 * 60 * 60 * 1000 // 2 hours

// Stale when we've never bulk-refreshed, or the last bulk refresh is older than the window.
// Reads the persisted timestamp directly (not the store's hydrated `lastRefresh`) so it's
// immune to the race between hydrate() and the bootstrap effect that gates on it.
export async function pricesAreStale(): Promise<boolean> {
  const last = await getSetting<number | null>(LAST_REFRESH_KEY, null)
  return last == null || Date.now() - last > PRICE_STALE_MS
}

export const useMarket = create<MarketState>((set, get) => ({
  prices: {},
  refreshing: false,
  lastRefresh: null,

  // Load last-known prices from IndexedDB so the UI shows values instantly / offline.
  async hydrate() {
    const rows = await db.prices.toArray()
    const map: Record<string, PriceSnapshot> = {}
    for (const r of rows) map[r.instrumentId] = r
    const lastRefresh = await getSetting<number | null>(LAST_REFRESH_KEY, null)
    set({ prices: map, lastRefresh })
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
      const now = Date.now()
      set({ lastRefresh: now })
      void setSetting(LAST_REFRESH_KEY, now)
    } finally {
      set({ refreshing: false })
    }
  },
}))
