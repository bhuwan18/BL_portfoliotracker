import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting, setSetting } from '../db'

// Unified "return lens" shared by the portfolio hero pill and every holding row.
// 'xirr' shows annualized XIRR; 'absolute' shows the plain gain/loss (₹ on rows, % on the hero).
export type ReturnMode = 'xirr' | 'absolute'

export function useReturnMode(): [ReturnMode, () => void] {
  const mode = useLiveQuery(
    () => getSetting<ReturnMode>('returnMode', 'xirr'),
    [],
    'xirr' as ReturnMode,
  )
  // Re-read the current value on toggle so the flip is correct even before the live query resolves.
  const toggle = async () => {
    const cur = await getSetting<ReturnMode>('returnMode', 'xirr')
    await setSetting('returnMode', cur === 'xirr' ? 'absolute' : 'xirr')
  }
  return [mode, toggle]
}
