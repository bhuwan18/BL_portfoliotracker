import { ProviderError } from '../types.js'
import type { StockSearchResult, StockQuote, StockHistory, HistoryPoint } from '../types.js'

// Yahoo's edge returns HTTP 429 to empty / non-browser User-Agents, so we must
// present a realistic browser UA. These v8/v1 endpoints need no crumb/cookie.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function yget(url: string): Promise<any> {
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  } catch (e) {
    throw new ProviderError(`yahoo network error: ${String((e as Error)?.message ?? e)}`, 502)
  }
  if (!res.ok) throw new ProviderError(`yahoo http ${res.status}`, res.status)
  return res.json()
}

function exchDisplay(symbol: string, fallback: string): string {
  if (symbol.endsWith('.NS')) return 'NSE'
  if (symbol.endsWith('.BO')) return 'BSE'
  return fallback || ''
}

export async function search(q: string): Promise<StockSearchResult[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    q,
  )}&quotesCount=20&newsCount=0`
  const data = await yget(url)
  const quotes: any[] = Array.isArray(data?.quotes) ? data.quotes : []
  const out: StockSearchResult[] = quotes
    .filter((x) => x?.symbol && (x.quoteType === 'EQUITY' || x.quoteType === 'ETF'))
    .map((x) => ({
      symbol: String(x.symbol),
      name: String(x.shortname || x.longname || x.symbol),
      exchange: exchDisplay(String(x.symbol), String(x.exchDisp || x.exchange || '')),
      type: x.quoteType === 'ETF' ? ('etf' as const) : ('stock' as const),
    }))
  // Prefer Indian listings (.NS / .BO) at the top of the list.
  out.sort((a, b) => indianRank(a.symbol) - indianRank(b.symbol))
  return out
}

function indianRank(symbol: string): number {
  if (symbol.endsWith('.NS')) return 0
  if (symbol.endsWith('.BO')) return 1
  return 2
}

export async function quote(symbol: string): Promise<StockQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=5d&interval=1d`
  const data = await yget(url)
  const result = data?.chart?.result?.[0]
  if (!result) {
    const desc = data?.chart?.error?.description || 'no result'
    throw new ProviderError(`yahoo quote: ${desc}`, 404)
  }
  const meta = result.meta || {}
  const price = Number(meta.regularMarketPrice)
  if (!Number.isFinite(price)) throw new ProviderError('yahoo quote: missing price', 502)
  const prevClose = Number(meta.previousClose ?? meta.chartPreviousClose ?? price)
  return {
    symbol: String(meta.symbol || symbol),
    name: String(meta.longName || meta.shortName || symbol),
    price,
    prevClose: Number.isFinite(prevClose) ? prevClose : price,
    currency: String(meta.currency || 'INR'),
    exchange: exchDisplay(symbol, String(meta.fullExchangeName || meta.exchangeName || '')),
    time: meta.regularMarketTime ? Number(meta.regularMarketTime) * 1000 : Date.now(),
  }
}

export async function history(symbol: string, range: string): Promise<StockHistory> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${encodeURIComponent(range)}&interval=1d`
  const data = await yget(url)
  const result = data?.chart?.result?.[0]
  if (!result) {
    const desc = data?.chart?.error?.description || 'no result'
    throw new ProviderError(`yahoo history: ${desc}`, 404)
  }
  const ts: number[] = result.timestamp || []
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || []
  const points: HistoryPoint[] = []
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i]
    if (c == null || !Number.isFinite(c)) continue
    points.push({ t: ts[i] * 1000, close: Number(c) })
  }
  return {
    symbol: String(result.meta?.symbol || symbol),
    currency: String(result.meta?.currency || 'INR'),
    range,
    points,
  }
}
