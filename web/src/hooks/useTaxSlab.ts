import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting, setSetting } from '../db'
import { DEFAULT_TAX_SLAB_PCT } from '../domain/tax'

const TAX_SLAB_KEY = 'taxSlabPct'
const MAX_SLAB_PCT = 45

// User's income-tax slab %, used only for debt/hybrid mutual fund short-term (slab-rate)
// gains in the tax estimate — equity gains use flat statutory rates and don't need this.
export function useTaxSlabPct(): [number, (pct: number) => Promise<void>] {
  const pct = useLiveQuery(
    () => getSetting<number>(TAX_SLAB_KEY, DEFAULT_TAX_SLAB_PCT),
    [],
    DEFAULT_TAX_SLAB_PCT,
  )
  const set = async (next: number) => {
    const clamped = Math.min(MAX_SLAB_PCT, Math.max(0, next))
    await setSetting(TAX_SLAB_KEY, clamped)
  }
  return [pct, set]
}
