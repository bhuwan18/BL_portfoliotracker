import { db } from '../db'
import type { Instrument, Setting, Sip, Transaction } from '../domain/types'

export interface BackupPayload {
  app: 'my-funds'
  version: number
  exportedAt: string
  data: {
    instruments: Instrument[]
    transactions: Transaction[]
    sips: Sip[]
    settings: Setting[]
  }
}

// Settings that are device-bound and must never travel in a backup: the PIN hash and the
// biometric (Face ID) credential id. Both are meaningless on another device and would only
// carry a lock across — so a backup stays portable.
const DEVICE_BOUND_KEYS = ['pinHash', 'biometricCredId']

// The price cache and the device-bound security settings are intentionally excluded so a
// backup is portable and never carries a lock to another device.
export async function buildBackup(): Promise<BackupPayload> {
  const [instruments, transactions, sips, settings] = await Promise.all([
    db.instruments.toArray(),
    db.transactions.toArray(),
    db.sips.toArray(),
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
      settings: settings.filter((s) => !DEVICE_BOUND_KEYS.includes(s.key)),
    },
  }
}

export interface ImportResult {
  instruments: number
  transactions: number
  sips: number
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

// Writes a backup payload into IndexedDB. In 'replace' mode the data tables are
// cleared first (the price cache is left to refresh on next load). The device-bound
// security settings (pinHash, biometricCredId) are always filtered out so an imported
// backup never carries a lock onto this device. Older payloads may still carry a
// `watchlist` array — it is simply ignored.
export async function applyBackup(
  payload: BackupPayload,
  mode: 'replace' | 'merge',
): Promise<ImportResult> {
  const { instruments, transactions, sips, settings } = payload.data
  await db.transaction('rw', [db.instruments, db.transactions, db.sips, db.settings], async () => {
    if (mode === 'replace') {
      await Promise.all([db.instruments.clear(), db.transactions.clear(), db.sips.clear()])
    }
    await db.instruments.bulkPut(instruments ?? [])
    await db.transactions.bulkPut(transactions ?? [])
    await db.sips.bulkPut(sips ?? [])
    if (settings?.length) {
      await db.settings.bulkPut(settings.filter((s) => !DEVICE_BOUND_KEYS.includes(s.key)))
    }
  })
  return {
    instruments: instruments?.length ?? 0,
    transactions: transactions?.length ?? 0,
    sips: sips?.length ?? 0,
  }
}

export async function wipeAllData(): Promise<void> {
  await Promise.all([
    db.instruments.clear(),
    db.transactions.clear(),
    db.sips.clear(),
    db.prices.clear(),
    db.settings.clear(),
  ])
}
