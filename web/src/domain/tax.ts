// Indian capital-gains tax estimate ("if sold today"), computed independently of the
// average-cost holding engine in portfolio.ts. Capital-gains law requires FIFO lot-by-lot
// acquisition dates to determine STCG vs LTCG, which the average-cost accounting in
// computeHolding() discards (it only keeps a pooled units + cost basis). This module replays
// a holding's transactions as FIFO lots purely to answer that question — it does not feed
// back into XIRR/P&L/hero figures anywhere else in the app.
//
// Rules encoded here reflect the July 2024 Union Budget changes and are a best-effort
// ESTIMATE, not tax advice. Known simplifications (deliberate, not oversights):
// - The ₹1.25L equity LTCG exemption is applied in full per holding (the app has no
//   cross-holding/tax-year aggregation to share it correctly across a user's whole portfolio).
// - Pre-April-2023 debt-fund LTCG is shown at a flat 20% on the nominal gain — the old regime's
//   Cost Inflation Index indexation is not modeled (no backend to maintain an annual CII table).
// - No cross-bucket or cross-holding capital-loss set-off is modeled.
// - An MF with no/unrecognized category (including "Hybrid") is taxed as non-equity, even
//   though an aggressive-hybrid fund with >65% equity allocation legally gets equity treatment
//   — `Instrument.category` is a free-text string that doesn't reliably expose that allocation.
import dayjs from 'dayjs'
import type { Instrument, Transaction } from './types'

export const EQUITY_STCG_RATE_PCT = 20
export const EQUITY_LTCG_RATE_PCT = 12.5
export const EQUITY_LTCG_EXEMPTION_INR = 125000
export const EQUITY_LTCG_HOLDING_MONTHS = 12

export const DEBT_REGIME_CUTOFF_DATE = '2023-04-01'
export const DEBT_LTCG_HOLDING_MONTHS = 36
export const DEBT_LTCG_RATE_PCT = 20

export const DEFAULT_TAX_SLAB_PCT = 30

export type TaxAssetClass = 'equity' | 'other'

export type TaxRegime = 'equity_stcg' | 'equity_ltcg' | 'debt_stcg_slab' | 'debt_ltcg_grandfathered'

export interface TaxLot {
  date: string // ISO acquisition date
  units: number // remaining (unconsumed) units
  costPerUnit: number
}

export interface TaxBucket {
  regime: TaxRegime
  label: string
  units: number
  costBasis: number
  currentValue: number
  gain: number
  ratePct: number
  exemptionApplied: number
  taxableGain: number
  tax: number
}

export interface TaxEstimate {
  instrumentId: string
  assetClass: TaxAssetClass
  asOf: string
  currentPrice: number
  totalUnits: number
  totalGain: number
  totalTax: number
  buckets: TaxBucket[]
  notes: string[]
}

// Replays a holding's transactions as FIFO lots: each buy is a new lot, each sell consumes
// the oldest remaining lots first. Only surviving (unconsumed) lots are returned — sell
// price/fees don't affect remaining cost basis and this feature has no need for realized
// history, only what's still held and when it was acquired.
export function buildFifoLots(txns: Transaction[]): TaxLot[] {
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  const lots: TaxLot[] = []
  for (const t of sorted) {
    if (t.kind === 'buy') {
      if (t.units <= 0) continue
      lots.push({ date: t.date, units: t.units, costPerUnit: (t.units * t.price + t.fees) / t.units })
    } else {
      let remaining = t.units
      for (const lot of lots) {
        if (remaining <= 0) break
        const consumed = Math.min(lot.units, remaining)
        lot.units -= consumed
        remaining -= consumed
      }
    }
  }
  return lots.filter((l) => l.units > 1e-9)
}

export function classifyAssetForTax(instrument: Instrument): TaxAssetClass {
  if (instrument.type === 'stock') return 'equity'
  const category = (instrument.category ?? '').toLowerCase()
  return category.includes('equity') ? 'equity' : 'other'
}

function makeBucket(regime: TaxRegime, label: string, lots: TaxLot[], price: number, ratePct: number): TaxBucket {
  const units = lots.reduce((s, l) => s + l.units, 0)
  const costBasis = lots.reduce((s, l) => s + l.units * l.costPerUnit, 0)
  const currentValue = units * price
  const gain = currentValue - costBasis
  return {
    regime,
    label,
    units,
    costBasis,
    currentValue,
    gain,
    ratePct,
    exemptionApplied: 0,
    taxableGain: Math.max(0, gain),
    tax: Math.max(0, gain) * (ratePct / 100),
  }
}

function buildEquityEstimate(lots: TaxLot[], price: number, today: string): { buckets: TaxBucket[]; notes: string[] } {
  const stcgLots: TaxLot[] = []
  const ltcgLots: TaxLot[] = []
  for (const lot of lots) {
    const ltcgCutoff = dayjs(lot.date).add(EQUITY_LTCG_HOLDING_MONTHS, 'month').format('YYYY-MM-DD')
    ;(today > ltcgCutoff ? ltcgLots : stcgLots).push(lot)
  }

  const buckets: TaxBucket[] = []
  const notes: string[] = []

  if (stcgLots.length > 0) {
    buckets.push(makeBucket('equity_stcg', `Short-term (≤${EQUITY_LTCG_HOLDING_MONTHS} months)`, stcgLots, price, EQUITY_STCG_RATE_PCT))
  }
  if (ltcgLots.length > 0) {
    const bucket = makeBucket('equity_ltcg', `Long-term (>${EQUITY_LTCG_HOLDING_MONTHS} months)`, ltcgLots, price, EQUITY_LTCG_RATE_PCT)
    if (bucket.gain > 0) {
      bucket.exemptionApplied = Math.min(bucket.gain, EQUITY_LTCG_EXEMPTION_INR)
      bucket.taxableGain = Math.max(0, bucket.gain - bucket.exemptionApplied)
      bucket.tax = bucket.taxableGain * (bucket.ratePct / 100)
      notes.push(
        `Assumes the full ₹1.25 lakh annual LTCG exemption is available to this holding. That exemption is shared across all your equity long-term gains for the financial year — if you have other equity LTCG elsewhere, your actual tax may be higher.`,
      )
    }
    buckets.push(bucket)
  }

  return { buckets, notes }
}

function buildDebtEstimate(
  lots: TaxLot[],
  price: number,
  today: string,
  debtSlabPct: number,
): { buckets: TaxBucket[]; notes: string[] } {
  const slabLots: TaxLot[] = []
  const grandfatheredLots: TaxLot[] = []
  for (const lot of lots) {
    if (lot.date >= DEBT_REGIME_CUTOFF_DATE) {
      slabLots.push(lot)
      continue
    }
    const ltcgCutoff = dayjs(lot.date).add(DEBT_LTCG_HOLDING_MONTHS, 'month').format('YYYY-MM-DD')
    ;(today > ltcgCutoff ? grandfatheredLots : slabLots).push(lot)
  }

  const buckets: TaxBucket[] = []
  const notes: string[] = []

  if (slabLots.length > 0) {
    buckets.push(makeBucket('debt_stcg_slab', 'Taxed at your slab rate', slabLots, price, debtSlabPct))
  }
  if (grandfatheredLots.length > 0) {
    buckets.push(
      makeBucket(
        'debt_ltcg_grandfathered',
        `Long-term (>${DEBT_LTCG_HOLDING_MONTHS} months, acquired before Apr 2023)`,
        grandfatheredLots,
        price,
        DEBT_LTCG_RATE_PCT,
      ),
    )
    notes.push(
      'Shown at a flat 20% on the nominal gain — the old regime’s cost-inflation indexation is not applied here, so your actual tax on these units may be lower.',
    )
  }

  return { buckets, notes }
}

export function estimateTaxIfSoldToday(
  instrument: Instrument,
  txns: Transaction[],
  currentPrice: number,
  opts: { debtSlabPct: number; today?: string },
): TaxEstimate | null {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null
  const lots = buildFifoLots(txns)
  if (lots.length === 0) return null

  const today = opts.today ?? dayjs().format('YYYY-MM-DD')
  const assetClass = classifyAssetForTax(instrument)
  const { buckets, notes } =
    assetClass === 'equity'
      ? buildEquityEstimate(lots, currentPrice, today)
      : buildDebtEstimate(lots, currentPrice, today, opts.debtSlabPct)

  if (buckets.length === 0) return null

  return {
    instrumentId: instrument.id,
    assetClass,
    asOf: today,
    currentPrice,
    totalUnits: buckets.reduce((s, b) => s + b.units, 0),
    totalGain: buckets.reduce((s, b) => s + b.gain, 0),
    totalTax: buckets.reduce((s, b) => s + b.tax, 0),
    buckets,
    notes,
  }
}
