import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting, setSetting } from '../db'
import type { ChartRange } from '../api/instrument'
import type { TrendView } from '../components/PortfolioChart'

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

// Trend chart: whether the collapsible value-over-time section is open, plus its view
// (₹ value vs return %) and range. All persisted so the choice sticks across sessions.
export function useTrendExpanded(): [boolean, () => void] {
  const open = useLiveQuery(() => getSetting<boolean>('heroTrendOpen', false), [], false)
  const toggle = async () => {
    const cur = await getSetting<boolean>('heroTrendOpen', false)
    await setSetting('heroTrendOpen', !cur)
  }
  return [open, toggle]
}

export function useTrendView(): [TrendView, (next: TrendView) => void] {
  const view = useLiveQuery(
    () => getSetting<TrendView>('heroTrendView', 'value'),
    [],
    'value' as TrendView,
  )
  const set = (next: TrendView) => void setSetting('heroTrendView', next)
  return [view, set]
}

// Subset of ChartRange exposed in the hero (1M/6M/1Y/All). It's a subset so a TrendRange is
// always assignable to the ChartRange that usePortfolioHistory / fetchHistory expect.
export type TrendRange = Extract<ChartRange, '1mo' | '6mo' | '1y' | 'max'>

export function useTrendRange(): [TrendRange, (next: TrendRange) => void] {
  const range = useLiveQuery(
    () => getSetting<TrendRange>('heroTrendRange', '1y'),
    [],
    '1y' as TrendRange,
  )
  const set = (next: TrendRange) => void setSetting('heroTrendRange', next)
  return [range, set]
}
