import type { Instrument, InstrumentType, PriceSnapshot } from '../domain/types'
import { getStockHistory, getStockQuote, searchStocks } from './stocks'
import { getMfScheme, navOn, searchMf, type MfScheme } from './mf'

export interface UnifiedSearchResult {
  id: string
  type: InstrumentType
  name: string
  symbol?: string
  schemeCode?: number
  exchange?: string
  subtitle: string
}

export const stockId = (symbol: string) => `stock:${symbol}`
export const mfId = (code: number) => `mf:${code}`

export type ChartRange = '1mo' | '3mo' | '6mo' | '1y' | 'max'

export const CHART_RANGES: { value: ChartRange; label: string; days: number }[] = [
  { value: '1mo', label: '1M', days: 31 },
  { value: '3mo', label: '3M', days: 92 },
  { value: '6mo', label: '6M', days: 183 },
  { value: '1y', label: '1Y', days: 366 },
  { value: 'max', label: 'Max', days: Infinity },
]

export async function unifiedSearch(
  q: string,
  type: InstrumentType,
): Promise<UnifiedSearchResult[]> {
  const query = q.trim()
  if (query.length < 1) return []
  if (type === 'stock') {
    const results = await searchStocks(query)
    return results.map((s) => ({
      id: stockId(s.symbol),
      type: 'stock',
      name: s.name,
      symbol: s.symbol,
      exchange: s.exchange,
      subtitle: [s.exchange, s.symbol].filter(Boolean).join(' · '),
    }))
  }
  const results = await searchMf(query)
  return results.slice(0, 50).map((s) => ({
    id: mfId(s.schemeCode),
    type: 'mf',
    name: s.schemeName,
    schemeCode: s.schemeCode,
    subtitle: `Mutual Fund · ${s.schemeCode}`,
  }))
}

export async function buildInstrument(r: UnifiedSearchResult): Promise<Instrument> {
  if (r.type === 'stock') {
    return {
      id: r.id,
      type: 'stock',
      name: r.name,
      symbol: r.symbol,
      exchange: r.exchange,
      currency: 'INR',
      createdAt: Date.now(),
    }
  }
  const scheme = await getMfScheme(r.schemeCode!)
  return {
    id: r.id,
    type: 'mf',
    name: scheme?.schemeName || r.name,
    schemeCode: r.schemeCode,
    category: scheme?.category,
    currency: 'INR',
    createdAt: Date.now(),
  }
}

export async function fetchQuote(inst: Instrument): Promise<PriceSnapshot | null> {
  if (inst.type === 'stock' && inst.symbol) {
    const q = await getStockQuote(inst.symbol)
    if (!q) return null
    return {
      instrumentId: inst.id,
      price: q.price,
      prevClose: q.prevClose,
      asOf: q.time,
      name: q.name,
      currency: q.currency,
    }
  }
  if (inst.type === 'mf' && inst.schemeCode != null) {
    const s = await getMfScheme(inst.schemeCode)
    if (!s) return null
    return {
      instrumentId: inst.id,
      price: s.latestNav,
      prevClose: s.prevNav,
      asOf: Date.now(),
      name: s.schemeName,
      currency: 'INR',
    }
  }
  return null
}

export interface UnifiedHistory {
  points: { t: number; close: number }[]
  currency: string
}

function filterByRange(points: { t: number; close: number }[], range: ChartRange) {
  const cfg = CHART_RANGES.find((r) => r.value === range)
  if (!cfg || cfg.days === Infinity) return points
  const cutoff = Date.now() - cfg.days * 24 * 3600 * 1000
  return points.filter((p) => p.t >= cutoff)
}

export async function fetchHistory(
  inst: Instrument,
  range: ChartRange,
): Promise<UnifiedHistory | null> {
  if (inst.type === 'stock' && inst.symbol) {
    const h = await getStockHistory(inst.symbol, range)
    if (!h) return null
    return { points: h.points, currency: h.currency }
  }
  if (inst.type === 'mf' && inst.schemeCode != null) {
    const s = await getMfScheme(inst.schemeCode)
    if (!s) return null
    const pts = s.history.map((p) => ({ t: new Date(p.date + 'T00:00:00').getTime(), close: p.nav }))
    return { points: filterByRange(pts, range), currency: 'INR' }
  }
  return null
}

// Price on a specific past date — used when materializing SIP installments or
// auto-filling the price field for a back-dated transaction.
export async function priceOnDate(inst: Instrument, isoDate: string): Promise<number | null> {
  if (inst.type === 'mf' && inst.schemeCode != null) {
    const s = await getMfScheme(inst.schemeCode)
    if (!s) return null
    return navOn(s.history, isoDate)
  }
  if (inst.type === 'stock' && inst.symbol) {
    const h = await getStockHistory(inst.symbol, 'max')
    if (!h || h.points.length === 0) return null
    const target = new Date(isoDate + 'T23:59:59').getTime()
    let close: number | null = null
    for (const p of h.points) {
      if (p.t <= target) close = p.close
      else break
    }
    return close ?? h.points[h.points.length - 1].close
  }
  return null
}

export type { MfScheme }
