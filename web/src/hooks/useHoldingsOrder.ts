import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting, setSetting } from '../db'
import type { Holding } from '../domain/types'

// User's manual holdings order, persisted as an array of instrument ids in settings.
// Absent (null) => fall back to the default value-desc sort from computePortfolio.
const KEY = 'holdingsOrder'

// Apply a saved manual order on top of the default-sorted holdings. Ids present in
// `order` lead, in saved sequence; holdings new since the last manual sort aren't in
// `order`, so they keep their incoming (value-desc) order and are appended after.
export function orderHoldings(holdings: Holding[], order: string[] | null): Holding[] {
  if (!order || order.length === 0) return holdings
  const rank = new Map(order.map((id, i) => [id, i]))
  const known: Holding[] = []
  const fresh: Holding[] = []
  for (const h of holdings) {
    if (rank.has(h.instrument.id)) known.push(h)
    else fresh.push(h)
  }
  known.sort((a, b) => rank.get(a.instrument.id)! - rank.get(b.instrument.id)!)
  return [...known, ...fresh]
}

export function useHoldingsOrder(): {
  order: string[] | null
  isCustom: boolean
  save: (ids: string[]) => Promise<void>
  reset: () => Promise<void>
} {
  const order = useLiveQuery(() => getSetting<string[] | null>(KEY, null), [], null)
  const save = (ids: string[]) => setSetting(KEY, ids)
  const reset = () => setSetting(KEY, null)
  return { order: order ?? null, isCustom: (order?.length ?? 0) > 0, save, reset }
}
