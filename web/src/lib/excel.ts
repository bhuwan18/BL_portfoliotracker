import dayjs from 'dayjs'
import type { Holding, Instrument, Transaction } from '../domain/types'

function round(n: number, d: number): number {
  if (!Number.isFinite(n)) return 0
  const m = Math.pow(10, d)
  return Math.round((n + Number.EPSILON) * m) / m
}

// Exports a two-sheet .xlsx (Holdings + Transactions) via SheetJS.
// xlsx is loaded lazily so it stays out of the initial app bundle.
export async function exportExcel(
  holdings: Holding[],
  transactions: Transaction[],
  instruments: Map<string, Instrument>,
): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const holdingRows = holdings.map((h) => ({
    Instrument: h.instrument.name,
    Type: h.instrument.type === 'mf' ? 'Mutual Fund' : 'Stock',
    Identifier: h.instrument.symbol ?? h.instrument.schemeCode ?? '',
    Units: round(h.units, 3),
    'Avg Cost': round(h.avgCost, 2),
    'LTP / NAV': round(h.price, 2),
    Invested: round(h.investedValue, 2),
    'Current Value': round(h.currentValue, 2),
    'P/L': round(h.pnl, 2),
    'P/L %': round(h.pnlPct, 2),
    "Day's Change": round(h.dayChange, 2),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(holdingRows), 'Holdings')

  const txnRows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({
      Date: t.date,
      Instrument: instruments.get(t.instrumentId)?.name ?? t.instrumentId,
      Type: t.kind === 'buy' ? 'Buy' : 'Sell',
      Units: round(t.units, 3),
      Price: round(t.price, 2),
      Fees: round(t.fees, 2),
      Amount: round(t.units * t.price + (t.kind === 'buy' ? t.fees : -t.fees), 2),
      Notes: t.notes ?? '',
    }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txnRows), 'Transactions')

  XLSX.writeFile(wb, `my-funds-${dayjs().format('YYYY-MM-DD')}.xlsx`)
}
