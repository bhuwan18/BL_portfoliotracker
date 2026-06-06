// XIRR — annualized internal rate of return for irregular cash flows.
// Find r such that sum( amount_i / (1+r)^(years_i) ) = 0, where years are measured
// from the earliest flow.
//
// A portfolio's combined cash flows routinely change sign more than once: any sell or
// rebalance interleaved with buys, or a fully-closed position's buy+sell pair, makes the
// NPV(r) polynomial have MULTIPLE real roots. An unconstrained Newton-Raphson step will
// happily run off to an economically meaningless root in the thousands-of-percent range
// (this is what produced a "10000%" portfolio XIRR). So we don't trust an arbitrary root:
// we scan r upward from just above −100% and return the SMALLEST real root — the
// money-weighted return a human would recognize — then refine it with bisection.

export interface CashFlow {
  date: Date
  amount: number // negative = money out (buy), positive = money in (sell / current value)
}

const MS_PER_YEAR = 365 * 24 * 3600 * 1000
const MIN_RATE = -0.9999 // just above a total (−100%) loss
const MAX_RATE = 100 // 10000% — above this an annualized rate is not meaningful

export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null
  // Need both an inflow and an outflow, else there is no rate to solve for.
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null

  const t0 = Math.min(...flows.map((f) => f.date.getTime()))
  const years = (t: number) => (t - t0) / MS_PER_YEAR
  const npv = (r: number) =>
    flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, years(f.date.getTime())), 0)

  // Walk r upward looking for the first sign change and bisect that bracket. Scanning
  // low→high means we lock onto the lowest root and never a spurious high one. Resolution
  // is fine where real returns live and coarsens as r grows, so the sweep stays cheap.
  let prevR = MIN_RATE
  let prevF = npv(MIN_RATE)
  if (!Number.isFinite(prevF)) return null
  if (Math.abs(prevF) < 1e-9) return MIN_RATE

  let step = 0.005
  for (let r = MIN_RATE + step; r <= MAX_RATE; r += step) {
    const f = npv(r)
    if (!Number.isFinite(f)) return null
    if (prevF * f < 0) return bisect(npv, prevR, r, prevF)
    if (f === 0) return r
    prevR = r
    prevF = f
    if (r >= 10) step = 0.5
    else if (r >= 1) step = 0.05
  }
  return null // no meaningful root below MAX_RATE
}

// Bisection within a known sign-changing bracket [lo, hi]; converges to the root.
function bisect(npv: (r: number) => number, lo: number, hi: number, flo: number): number {
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fm = npv(mid)
    if (!Number.isFinite(fm)) break
    if (Math.abs(fm) < 1e-9 || (hi - lo) / 2 < 1e-12) return mid
    if (flo * fm < 0) hi = mid
    else {
      lo = mid
      flo = fm
    }
  }
  return (lo + hi) / 2
}
