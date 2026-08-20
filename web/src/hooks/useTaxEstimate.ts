import { useMemo } from 'react'
import { useInstrument, useInstrumentTxns } from './usePortfolio'
import { useTaxSlabPct } from './useTaxSlab'
import { estimateTaxIfSoldToday, type TaxEstimate } from '../domain/tax'

// currentPrice is passed in rather than resolved from the market store here so callers reuse
// the same "effective price" already driving the rest of the InstrumentDetail screen (hero
// price, perf tile, per-transaction gains) — keeping the tax figure numerically consistent
// with everything else shown for the holding.
export function useTaxEstimate(instrumentId: string | undefined, currentPrice: number): TaxEstimate | null {
  const instrument = useInstrument(instrumentId)
  const txns = useInstrumentTxns(instrumentId)
  const [debtSlabPct] = useTaxSlabPct()

  return useMemo(() => {
    if (!instrument || txns.length === 0) return null
    return estimateTaxIfSoldToday(instrument, txns, currentPrice, { debtSlabPct })
  }, [instrument, txns, currentPrice, debtSlabPct])
}
