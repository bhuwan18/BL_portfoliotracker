// XIRR — annualized internal rate of return for irregular cash flows.
// Find r such that sum( amount_i / (1+r)^(years_i) ) = 0, where years are measured
// from the earliest flow. Newton-Raphson first, then a bisection fallback for robustness.

export interface CashFlow {
  date: Date
  amount: number // negative = money out (buy), positive = money in (sell / current value)
}

const MS_PER_YEAR = 365 * 24 * 3600 * 1000

export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null

  const t0 = Math.min(...flows.map((f) => f.date.getTime()))
  const years = (t: number) => (t - t0) / MS_PER_YEAR

  const npv = (r: number) =>
    flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, years(f.date.getTime())), 0)
  const dNpv = (r: number) =>
    flows.reduce((s, f) => {
      const y = years(f.date.getTime())
      return s - (y * f.amount) / Math.pow(1 + r, y + 1)
    }, 0)

  // Newton-Raphson
  let r = 0.1
  for (let i = 0; i < 100; i++) {
    const f = npv(r)
    const d = dNpv(r)
    if (!isFinite(f) || !isFinite(d) || d === 0) break
    let next = r - f / d
    if (!isFinite(next)) break
    if (next <= -0.9999) next = -0.9999 + 1e-7
    if (Math.abs(next - r) < 1e-8) return next
    r = next
  }

  // Bisection fallback over a wide bracket
  let lo = -0.9999
  let hi = 10
  let flo = npv(lo)
  let fhi = npv(hi)
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) {
    hi = 100
    fhi = npv(hi)
    if (!isFinite(fhi) || flo * fhi > 0) return null
  }
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2
    const fm = npv(mid)
    if (!isFinite(fm)) return null
    if (Math.abs(fm) < 1e-7 || (hi - lo) / 2 < 1e-9) return mid
    if (flo * fm < 0) {
      hi = mid
      fhi = fm
    } else {
      lo = mid
      flo = fm
    }
  }
  return (lo + hi) / 2
}
