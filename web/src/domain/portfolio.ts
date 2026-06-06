import type {
  Holding,
  Instrument,
  PortfolioSummary,
  PriceSnapshot,
  Transaction,
} from './types'
import { xirr, type CashFlow } from './xirr'

// "As of now" date for the terminal XIRR inflow, snapped to UTC midnight of today's local
// calendar date so it sits on the same day-granularity grid as transaction dates (ISO
// YYYY-MM-DD, parsed to UTC midnight). Stamping it at the live sub-day instant instead would
// annualize a same-day buy over a few hours — yielding absurd (billions-of-percent) rates —
// and, for users east of UTC in the early morning, could place "now" before today's buy and
// invert the sign. With this, a same-day buy spans zero time and XIRR cleanly returns null.
function todayAsOf(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

// Realized cash flows for one instrument's transaction history, using the SAME average-cost
// accounting and oversell clamp (Math.min) as computeHolding — so a sell recorded for more
// units than are held can't inject a phantom inflow into XIRR. Buys are negative (gross +
// fees), sells positive (clamped units * price − fees). Callers append the terminal current
// value themselves. Sharing this between computeHolding and computePortfolio keeps the
// per-holding and portfolio XIRR cash flows provably consistent.
function transactionCashFlows(txns: Transaction[]): CashFlow[] {
  const sorted = [...txns].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
  )
  let units = 0
  let costBasis = 0
  const flows: CashFlow[] = []
  for (const t of sorted) {
    if (t.kind === 'buy') {
      costBasis += t.units * t.price + t.fees
      units += t.units
      flows.push({ date: new Date(t.date), amount: -(t.units * t.price + t.fees) })
    } else {
      const sellUnits = Math.min(t.units, units) // guard against overselling
      const avg = units > 0 ? costBasis / units : 0
      flows.push({ date: new Date(t.date), amount: sellUnits * t.price - t.fees })
      costBasis -= sellUnits * avg
      units -= sellUnits
    }
  }
  return flows
}

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

  // Per-holding XIRR: this holding's own realized cash flows + current value as a final
  // inflow stamped on the same day grid as the transactions (see todayAsOf).
  const flows = transactionCashFlows(sorted)
  if (hasPrice && currentValue > 0) flows.push({ date: todayAsOf(), amount: currentValue })
  const rate = xirr(flows)

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
    xirr: rate != null ? rate * 100 : null,
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
  const invested = priced.reduce((s, h) => s + h.investedValue, 0)
  const currentValue = priced.reduce((s, h) => s + h.currentValue, 0)
  const dayChange = priced.reduce((s, h) => s + h.dayChange, 0)
  const realizedPnl = holdings.reduce((s, h) => s + h.realizedPnl, 0)
  const totalPnl = currentValue - invested
  const prevValue = currentValue - dayChange

  const byType = { stock: 0, mf: 0 }
  for (const h of priced) byType[h.instrument.type] += h.currentValue

  // XIRR over every position's realized cash flows plus the current value of what's
  // still held. CLOSED positions (units === 0) are included: their buys and sells are
  // realized money that belongs in the money-weighted return, and dropping them would
  // contradict the realized P&L shown right next to the XIRR. The only positions left
  // out are held-but-unpriced ones — we can't value them, and counting their buys with
  // no offsetting current value would fabricate a loss (same reason they're excluded
  // from the money aggregates above).
  const xirrIds = new Set(
    holdings.filter((h) => h.units === 0 || h.hasPrice).map((h) => h.instrument.id),
  )
  const flows: CashFlow[] = []
  for (const h of holdings) {
    if (!xirrIds.has(h.instrument.id)) continue
    const txns = txnsByInstrument.get(h.instrument.id)
    if (!txns) continue
    flows.push(...transactionCashFlows(txns))
  }
  if (currentValue > 0) flows.push({ date: todayAsOf(), amount: currentValue })
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
