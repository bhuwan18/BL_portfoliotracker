import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting, setSetting } from '../db'

// Two persisted display toggles for the portfolio hero, kept in settings so the choice
// sticks across navigation and sessions (the hero remounts whenever Portfolio does).

// Today tile: percentage move vs absolute ₹ gain.
export type DayMode = 'pct' | 'abs'

export function useDayMode(): [DayMode, () => void] {
  const mode = useLiveQuery(
    () => getSetting<DayMode>('heroDayMode', 'pct'),
    [],
    'pct' as DayMode,
  )
  const toggle = async () => {
    const cur = await getSetting<DayMode>('heroDayMode', 'pct')
    await setSetting('heroDayMode', cur === 'pct' ? 'abs' : 'pct')
  }
  return [mode, toggle]
}

// Overall tile: which XIRR sleeve to show — blended ('all'), equity ('stock') or MF ('mf').
export type IrrSleeve = 'all' | 'stock' | 'mf'

export function useIrrSleeve(): [IrrSleeve, (next: IrrSleeve) => void] {
  const sleeve = useLiveQuery(
    () => getSetting<IrrSleeve>('heroIrrSleeve', 'all'),
    [],
    'all' as IrrSleeve,
  )
  const set = (next: IrrSleeve) => void setSetting('heroIrrSleeve', next)
  return [sleeve, set]
}
