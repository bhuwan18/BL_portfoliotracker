// Normalized shapes returned by the proxy (provider-agnostic).
export interface StockSearchResult {
  symbol: string // e.g. "RELIANCE.NS" | "TCS.BO"
  name: string
  exchange: string // "NSE" | "BSE" | ...
  type: 'stock' | 'etf'
}

export interface StockQuote {
  symbol: string
  name: string
  price: number
  prevClose: number
  currency: string
  exchange: string
  time: number // epoch ms of the quote
}

export interface HistoryPoint {
  t: number // epoch ms
  close: number
}

export interface StockHistory {
  symbol: string
  currency: string
  range: string
  points: HistoryPoint[]
}

export class ProviderError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.status = status
    this.name = 'ProviderError'
  }
}
