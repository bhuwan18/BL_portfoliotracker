import dayjs from 'dayjs'
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

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function exportBackupFile(): Promise<void> {
  const payload = await buildBackup()
  downloadText(`my-funds-backup-${dayjs().format('YYYY-MM-DD')}.json`, JSON.stringify(payload, null, 2))
}

export interface ImportResult {
  instruments: number
  transactions: number
  sips: number
  watchlist: number
}

export async function importBackup(json: string, mode: 'replace' | 'merge'): Promise<ImportResult> {
  const parsed = JSON.parse(json) as BackupPayload
  if (parsed?.app !== 'my-funds' || !parsed.data) {
    throw new Error('Not a valid My Funds backup file.')
  }
  const { instruments, transactions, sips, watchlist, settings } = parsed.data
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
