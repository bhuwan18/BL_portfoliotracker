import { db } from '../db'
import type { Instrument, Setting, Sip, Transaction, WatchItem } from '../domain/types'

export interface BackupPayload {
  app: 'my-funds'
  version: number
  exportedAt: string
  data: {
    instruments: Instrument[]
    transactions: Transaction[]
    sips: Sip[]
    watchlist: WatchItem[]
    settings: Setting[]
  }
}

// The price cache and the PIN hash are intentionally excluded so a backup is
// portable and never carries a lock to another device.
export async function buildBackup(): Promise<BackupPayload> {
  const [instruments, transactions, sips, watchlist, settings] = await Promise.all([
    db.instruments.toArray(),
    db.transactions.toArray(),
    db.sips.toArray(),
    db.watchlist.toArray(),
    db.settings.toArray(),
  ])
  return {
    app: 'my-funds',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      instruments,
      transactions,
      sips,
      watchlist,
      settings: settings.filter((s) => s.key !== 'pinHash'),
    },
  }
}

export interface ImportResult {
  instruments: number
  transactions: number
  sips: number
  watchlist: number
}

// Validates and parses a backup JSON string into a typed payload. Throws on anything
// that isn't a recognizable My Funds backup.
export function parseBackup(json: string): BackupPayload {
  const parsed = JSON.parse(json) as BackupPayload
  if (parsed?.app !== 'my-funds' || !parsed.data) {
    throw new Error('Not a valid My Funds backup.')
  }
  return parsed
}

// Writes a backup payload into IndexedDB. In 'replace' mode the four data tables are
// cleared first (the price cache is left to refresh on next load). pinHash is always
// filtered out so an imported backup never carries a lock onto this device.
export async function applyBackup(
  payload: BackupPayload,
  mode: 'replace' | 'merge',
): Promise<ImportResult> {
  const { instruments, transactions, sips, watchlist, settings } = payload.data
  await db.transaction('rw', [db.instruments, db.transactions, db.sips, db.watchlist, db.settings], async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.instruments.clear(),
        db.transactions.clear(),
        db.sips.clear(),
        db.watchlist.clear(),
      ])
    }
    await db.instruments.bulkPut(instruments ?? [])
    await db.transactions.bulkPut(transactions ?? [])
    await db.sips.bulkPut(sips ?? [])
    await db.watchlist.bulkPut(watchlist ?? [])
    if (settings?.length) await db.settings.bulkPut(settings.filter((s) => s.key !== 'pinHash'))
  })
  return {
    instruments: instruments?.length ?? 0,
    transactions: transactions?.length ?? 0,
    sips: sips?.length ?? 0,
    watchlist: watchlist?.length ?? 0,
  }
}

export async function wipeAllData(): Promise<void> {
  await Promise.all([
    db.instruments.clear(),
    db.transactions.clear(),
    db.sips.clear(),
    db.watchlist.clear(),
    db.prices.clear(),
    db.settings.clear(),
  ])
}
