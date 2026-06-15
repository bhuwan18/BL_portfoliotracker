import type { Instrument, Transaction } from './types'
import type { ChartRange } from '../api/instrument'
import { CHART_RANGES } from '../api/instrument'

// A reconstructed point on the portfolio's value-over-time curve. `value` is the
// market value of priced, held units on that day; `invested` is the average-cost basis
// of those same units. Both follow the exact accounting in domain/portfolio.ts so the
// curve's right edge equals the dashboard's current value / invested.
export interface ValuePoint {
  t: number // day key: a UTC-midnight epoch ms (see dayStamp)
  value: number
  invested: number
}

export interface PricePoint {
  t: number
  close: number
}

const DAY_MS = 24 * 3600 * 1000

// Canonical day key: the instrument's price points and the transaction dates can be built
// from different conventions (MF NAV points use local midnight, Yahoo closes use the real
// market instant, transactions are ISO YYYY-MM-DD). Reducing any timestamp to its LOCAL
// calendar day, expressed as a UTC-midnight epoch, makes every series comparable on one
// device and keeps the grid arithmetic immune to DST (UTC has no DST). It aligns with how
// api/mf.ts constructs NAV point timestamps from 'YYYY-MM-DDT00:00:00'.
export function toUtcMidnight(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

// Day key for an ISO YYYY-MM-DD transaction date — unambiguous, no timezone round-trip.
function isoToDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1)
}

// Inclusive daily grid of UTC-midnight day keys from start to end.
export function buildDailyGrid(startMs: number, endMs: number): number[] {
  const grid: number[] = []
  for (let t = startMs; t <= endMs; t += DAY_MS) grid.push(t)
  return grid
}

// Uniform-stride downsample that always keeps the first and last point — so the chart's
// green/red "first vs last" coloring stays faithful. Fixed ranges (<=366 days) pass through
// untouched; only multi-year 'max' windows get thinned.
export function downsample(points: ValuePoint[], targetPoints: number): ValuePoint[] {
  if (points.length <= targetPoints || targetPoints < 2) return points
  const stride = (points.length - 1) / (targetPoints - 1)
  const out: ValuePoint[] = []
  for (let i = 0; i < targetPoints - 1; i++) out.push(points[Math.round(i * stride)])
  out.push(points[points.length - 1])
  return out
}

// Per-instrument prepared series: transactions sorted on the same (date, createdAt) key as
// computeHolding, and price points reduced to ascending day keys (last close wins per day).
interface Prepared {
  txns: Transaction[]
  prices: PricePoint[] // ascending by day key, deduped
}

function prepare(txns: Transaction[], history: PricePoint[]): Prepared | null {
  if (txns.length === 0 || history.length === 0) return null
  const sortedTxns = [...txns].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
  )
  // Reduce price points to one (the last) per day key, ascending.
  const byDay = new Map<number, number>()
  for (const p of history) {
    if (!Number.isFinite(p.close)) continue
    byDay.set(toUtcMidnight(p.t), p.close)
  }
  if (byDay.size === 0) return null
  const prices = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, close]) => ({ t, close }))
  return { txns: sortedTxns, prices }
}

export function buildPortfolioHistory(input: {
  instruments: Instrument[]
  txnsByInstrument: Map<string, Transaction[]>
  historyByInstrument: Map<string, PricePoint[]>
  range: ChartRange
  today?: number
  targetPoints?: number
}): ValuePoint[] {
  const { instruments, txnsByInstrument, historyByInstrument, range } = input
  const targetPoints = input.targetPoints ?? 160
  const todayDay = toUtcMidnight(input.today ?? Date.now())

  // Prepare only instruments that have both transactions and price history.
  const prepared: Prepared[] = []
  let earliestTxnDay = Infinity
  for (const inst of instruments) {
    const p = prepare(txnsByInstrument.get(inst.id) ?? [], historyByInstrument.get(inst.id) ?? [])
    if (!p) continue
    prepared.push(p)
    earliestTxnDay = Math.min(earliestTxnDay, isoToDay(p.txns[0].date))
  }
  if (prepared.length === 0 || !Number.isFinite(earliestTxnDay)) return []

  // Window start: fixed ranges look back a fixed number of days; 'max' starts at the
  // earliest transaction (no point showing dead time before anyone held anything).
  const cfg = CHART_RANGES.find((r) => r.value === range)
  const fixedStart =
    cfg && cfg.days !== Infinity ? todayDay - (cfg.days - 1) * DAY_MS : earliestTxnDay
  const startDay = Math.max(fixedStart, earliestTxnDay)
  if (startDay > todayDay) return []

  const grid = buildDailyGrid(startDay, todayDay)
  const out: ValuePoint[] = grid.map((t) => ({ t, value: 0, invested: 0 }))

  // For each instrument, walk the grid once with a txn pointer (replaying the average-cost
  // loop from computeHolding incrementally) and a price pointer (forward-filling the last
  // close on or before the day). O(T + P + D) per instrument — no re-scans.
  for (const { txns, prices } of prepared) {
    let ti = 0
    let units = 0
    let costBasis = 0
    let pi = -1

    for (let d = 0; d < grid.length; d++) {
      const day = grid[d]

      while (ti < txns.length && isoToDay(txns[ti].date) <= day) {
        const t = txns[ti]
        if (t.kind === 'buy') {
          costBasis += t.units * t.price + t.fees
          units += t.units
        } else {
          const avg = units > 0 ? costBasis / units : 0
          const sellUnits = Math.min(t.units, units)
          costBasis -= sellUnits * avg
          units -= sellUnits
        }
        ti++
      }
      // Same residual clamp as computeHolding, applied each day so a sell-to-zero leaves
      // no dust lingering in invested for the rest of the window.
      if (units < 1e-9) {
        units = 0
        costBasis = 0
      }

      while (pi + 1 < prices.length && prices[pi + 1].t <= day) pi++
      const close = pi >= 0 ? prices[pi].close : null

      // Contribute only when held AND priced — mirrors computePortfolio excluding
      // un-priced holdings so a missing price never fabricates a loss.
      if (units > 0 && close != null && close > 0) {
        out[d].value += units * close
        out[d].invested += costBasis
      }
    }
  }

  // Drop a window that never had any priced, held value (e.g. all-unpriced portfolio).
  if (out.every((p) => p.value < 1e-9)) return []

  return downsample(out, targetPoints)
}
