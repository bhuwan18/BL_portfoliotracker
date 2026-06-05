import type {
  Holding,
  Instrument,
  PortfolioSummary,
  PriceSnapshot,
  Transaction,
} from './types'
import { xirr, type CashFlow } from './xirr'

// Average-cost method (common for Indian retail tracking). Sells realize P/L against
// the running average cost and reduce the cost basis proportionally.
export function computeHolding(
  instrument: Instrument,
  txns: Transaction[],
  price?: PriceSnapshot,
): Holding {
  const sorted = [...txns].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
  )

  let units = 0
  let costBasis = 0
  let realized = 0

  for (const t of sorted) {
    if (t.kind === 'buy') {
      costBasis += t.units * t.price + t.fees
      units += t.units
    } else {
      const avg = units > 0 ? costBasis / units : 0
      const sellUnits = Math.min(t.units, units) // guard against overselling
      realized += sellUnits * t.price - t.fees - sellUnits * avg
      costBasis -= sellUnits * avg
      units -= sellUnits
    }
  }

  if (units < 1e-9) {
    units = 0
    costBasis = 0
  }

  const p = price?.price ?? 0
  const prev = price?.prevClose ?? p
  const hasPrice = price != null && Number.isFinite(p) && p > 0
  const currentValue = units * p
  const pnl = hasPrice ? currentValue - costBasis : 0
  const dayChange = hasPrice ? units * (p - prev) : 0
  const prevValue = currentValue - dayChange

  return {
    instrument,
    units,
    investedValue: costBasis,
    avgCost: units > 0 ? costBasis / units : 0,
    price: p,
    prevClose: prev,
    currentValue,
    pnl,
    pnlPct: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
    dayChange,
    dayChangePct: prevValue > 0 ? (dayChange / prevValue) * 100 : 0,
    realizedPnl: realized,
    priceAsOf: price?.asOf,
    hasPrice,
  }
}

export function computePortfolio(
  instruments: Instrument[],
  txnsByInstrument: Map<string, Transaction[]>,
  prices: Map<string, PriceSnapshot>,
): PortfolioSummary {
  const holdings: Holding[] = []
  for (const inst of instruments) {
    const txns = txnsByInstrument.get(inst.id)
    if (!txns || txns.length === 0) continue
    holdings.push(computeHolding(inst, txns, prices.get(inst.id)))
  }

  const held = holdings.filter((h) => h.units > 0)
  // Money aggregates use only priced holdings, so a missing price never shows a fake
  // loss. Un-priced holdings still appear in the list (marked "No price").
  const priced = held.filter((h) => h.hasPrice)
  const pricedIds = new Set(priced.map((h) => h.instrument.id))
  const invested = priced.reduce((s, h) => s + h.investedValue, 0)
  const currentValue = priced.reduce((s, h) => s + h.currentValue, 0)
  const dayChange = priced.reduce((s, h) => s + h.dayChange, 0)
  const realizedPnl = holdings.reduce((s, h) => s + h.realizedPnl, 0)
  const totalPnl = currentValue - invested
  const prevValue = currentValue - dayChange

  const byType = { stock: 0, mf: 0 }
  for (const h of priced) byType[h.instrument.type] += h.currentValue

  // XIRR over the priced holdings' cash flows + their current value as a final inflow.
  const flows: CashFlow[] = []
  for (const inst of instruments) {
    if (!pricedIds.has(inst.id)) continue
    const txns = txnsByInstrument.get(inst.id)
    if (!txns) continue
    for (const t of txns) {
      const gross = t.units * t.price
      const amount = t.kind === 'buy' ? -(gross + t.fees) : gross - t.fees
      flows.push({ date: new Date(t.date), amount })
    }
  }
  if (currentValue > 0) flows.push({ date: new Date(), amount: currentValue })
  const rate = xirr(flows)

  return {
    invested,
    currentValue,
    totalPnl,
    totalPnlPct: invested > 0 ? (totalPnl / invested) * 100 : 0,
    dayChange,
    dayChangePct: prevValue > 0 ? (dayChange / prevValue) * 100 : 0,
    realizedPnl,
    xirr: rate != null ? rate * 100 : null,
    holdings: held.sort((a, b) => b.currentValue - a.currentValue),
    byType,
  }
}
