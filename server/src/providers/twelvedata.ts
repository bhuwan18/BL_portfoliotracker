import { ProviderError } from '../types.js'
import type { StockQuote, StockHistory, HistoryPoint } from '../types.js'

// Optional fallback. Active only when TWELVEDATA_API_KEY is set; otherwise the
// proxy stays fully keyless and relies on Yahoo alone.
// Read lazily so it works regardless of when .env / platform env vars are loaded.
function apiKey(): string {
  return process.env.TWELVEDATA_API_KEY || ''
}

export function enabled(): boolean {
  return apiKey().length > 0
}

function parse(symbol: string): { sym: string; exchange: string } {
  if (symbol.endsWith('.NS')) return { sym: symbol.slice(0, -3), exchange: 'NSE' }
  if (symbol.endsWith('.BO')) return { sym: symbol.slice(0, -3), exchange: 'BSE' }
  return { sym: symbol, exchange: '' }
}

async function tget(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new ProviderError(`twelvedata http ${res.status}`, res.status)
  const data: any = await res.json()
  if (data?.status === 'error') throw new ProviderError(`twelvedata: ${data?.message || 'error'}`, 502)
  return data
}

export async function quote(symbol: string): Promise<StockQuote> {
  const { sym, exchange } = parse(symbol)
  const ex = exchange ? `&exchange=${exchange}` : ''
  const data = await tget(
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(sym)}${ex}&apikey=${apiKey()}`,
  )
  const price = Number(data.close)
  if (!Number.isFinite(price)) throw new ProviderError('twelvedata quote: missing price', 502)
  const prevClose = Number(data.previous_close ?? price)
  return {
    symbol,
    name: String(data.name || symbol),
    price,
    prevClose: Number.isFinite(prevClose) ? prevClose : price,
    currency: String(data.currency || 'INR'),
    exchange: exchange || String(data.exchange || ''),
    time: Date.now(),
  }
}

const RANGE_SIZE: Record<string, number> = {
  '1mo': 23,
  '3mo': 66,
  '6mo': 130,
  '1y': 260,
  '2y': 520,
  '5y': 1300,
  max: 5000,
}

export async function history(symbol: string, range: string): Promise<StockHistory> {
  const { sym, exchange } = parse(symbol)
  const ex = exchange ? `&exchange=${exchange}` : ''
  const size = RANGE_SIZE[range] ?? 260
  const data = await tget(
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      sym,
    )}${ex}&interval=1day&outputsize=${size}&apikey=${apiKey()}`,
  )
  const values: any[] = Array.isArray(data?.values) ? data.values : []
  const points: HistoryPoint[] = values
    .map((v) => ({ t: new Date(v.datetime + 'T00:00:00Z').getTime(), close: Number(v.close) }))
    .filter((p) => Number.isFinite(p.close) && Number.isFinite(p.t))
    .reverse() // Twelve Data returns newest-first; we want oldest-first
  return { symbol, currency: 'INR', range, points }
}
