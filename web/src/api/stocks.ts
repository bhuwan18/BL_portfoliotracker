// Stock data via our own proxy (/api/stocks/*), which talks to Yahoo Finance.

export interface StockSearchResult {
  symbol: string
  name: string
  exchange: string
  type: 'stock' | 'etf'
}

export interface StockQuote {
  symbol: string
  name: string
  price: number
  prevClose: number
  currency: string
  exchange: string
  time: number
}

export interface StockHistoryPoint {
  t: number
  close: number
}

export interface StockHistory {
  symbol: string
  currency: string
  range: string
  points: StockHistoryPoint[]
}

export async function searchStocks(q: string): Promise<StockSearchResult[]> {
  try {
    const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`)
    if (!res.ok) return []
    return (await res.json()) as StockSearchResult[]
  } catch {
    return []
  }
}

export async function getStockQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const res = await fetch(`/api/stocks/quote?symbol=${encodeURIComponent(symbol)}`)
    if (!res.ok) return null
    return (await res.json()) as StockQuote
  } catch {
    return null
  }
}

export async function getStockHistory(symbol: string, range: string): Promise<StockHistory | null> {
  try {
    const res = await fetch(
      `/api/stocks/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`,
    )
    if (!res.ok) return null
    return (await res.json()) as StockHistory
  } catch {
    return null
  }
}
