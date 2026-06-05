import dayjs from 'dayjs'

const inrCache = new Map<number, Intl.NumberFormat>()
function inr(decimals: number): Intl.NumberFormat {
  let f = inrCache.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    inrCache.set(decimals, f)
  }
  return f
}

export function formatINR(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '₹0'
  return inr(decimals).format(n)
}

// Indian lakh/crore compact form for large hero figures.
export function formatINRCompact(n: number): string {
  if (!Number.isFinite(n)) return '₹0'
  const sign = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`
  return formatINR(n, a % 1 === 0 ? 0 : 2)
}

export function formatSignedINR(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '₹0'
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${formatINR(Math.abs(n), decimals)}`
}

export function formatNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '0'
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals }).format(n)
}

export function formatUnits(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n)
}

export function formatPct(n: number, withSign = true): string {
  if (!Number.isFinite(n)) return '0.00%'
  const sign = withSign && n > 0 ? '+' : withSign && n < 0 ? '−' : ''
  return `${sign}${Math.abs(n).toFixed(2)}%`
}

export type Sign = 'pos' | 'neg' | 'zero'
export function sign(n: number): Sign {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return 'zero'
  return n > 0 ? 'pos' : 'neg'
}

export function formatDate(iso: string): string {
  return dayjs(iso).format('D MMM YYYY')
}

// Compact DD/MM/YY for the "As on" price-date line in transaction rows.
export function formatDateShort(ms: number): string {
  return dayjs(ms).format('DD/MM/YY')
}

export function formatDateTime(ms: number): string {
  return dayjs(ms).format('D MMM YYYY, h:mm A')
}

export function todayISO(): string {
  return dayjs().format('YYYY-MM-DD')
}
