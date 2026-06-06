import { db, getActiveProfileId } from '../db'
import type { Instrument, Setting, Sip, Transaction } from '../domain/types'

export interface BackupPayload {
  app: 'my-funds'
  version: number
  exportedAt: string
  profileName?: string // name of the profile this backup was taken from (informational)
  data: {
    instruments: Instrument[]
    transactions: Transaction[]
    sips: Sip[]
    settings: Setting[]
  }
}

// Settings that must never travel in a backup:
// - pinHash / biometricCredId: device-bound; would carry a lock to another device.
// - activeProfileId: device-local pointer into the local profiles table.
// - holdingsOrder:*: per-profile cosmetic ordering keyed by this device's profile ids.
const DEVICE_BOUND_KEYS = ['pinHash', 'biometricCredId', 'activeProfileId']
function isPortableSetting(key: string): boolean {
  return !DEVICE_BOUND_KEYS.includes(key) && !key.startsWith('holdingsOrder')
}

// Serializes the ACTIVE profile only: its transactions and SIPs, the instruments they
// reference (shared reference data), and the portable settings. The price cache and the
// device-bound/profile-local settings are intentionally excluded so a backup is portable and
// never carries a lock or the other profile's data to another device.
export async function buildBackup(): Promise<BackupPayload> {
  const profileId = await getActiveProfileId()
  const [transactions, sips, settings, profile] = await Promise.all([
    db.transactions.where('profileId').equals(profileId).toArray(),
    db.sips.where('profileId').equals(profileId).toArray(),
    db.settings.toArray(),
    db.profiles.get(profileId),
  ])
  const referencedIds = new Set<string>()
  for (const t of transactions) referencedIds.add(t.instrumentId)
  for (const s of sips) referencedIds.add(s.instrumentId)
  const instruments = (await db.instruments.bulkGet([...referencedIds])).filter(
    (i): i is Instrument => !!i,
  )
  return {
    app: 'my-funds',
    version: 2,
    exportedAt: new Date().toISOString(),
    profileName: profile?.name,
    data: {
      instruments,
      transactions,
      sips,
      settings: settings.filter((s) => isPortableSetting(s.key)),
    },
  }
}

export interface ImportResult {
  instruments: number
  transactions: number
  sips: number
}

// Validates and parses a backup JSON string into a typed payload. Throws on anything
// that isn't a recognizable B Funds backup.
export function parseBackup(json: string): BackupPayload {
  const parsed = JSON.parse(json) as BackupPayload
  if (parsed?.app !== 'my-funds' || !parsed.data) {
    throw new Error('Not a valid B Funds backup.')
  }
  return parsed
}

// Writes a backup payload into the ACTIVE profile, replacing that profile's data. Only the
// active profile's transactions and SIPs are cleared (other profiles are untouched), and the
// incoming transactions/SIPs are re-tagged to the active profile so they land here regardless
// of which profile they were exported from. Instruments are shared reference data and are
// upserted (never cleared). The device-bound/profile-local settings are always filtered out so
// an imported backup never carries a lock or another device's profile pointers. Older payloads
// (v1) carrying no `profileId` on rows — or a `watchlist` array — are handled: profileId is set
// on import, watchlist is ignored.
export async function applyBackup(payload: BackupPayload): Promise<ImportResult> {
  const { instruments, transactions, sips, settings } = payload.data
  const target = await getActiveProfileId()
  await db.transaction('rw', [db.transactions, db.sips, db.instruments, db.settings], async () => {
    await db.transactions.where('profileId').equals(target).delete()
    await db.sips.where('profileId').equals(target).delete()
    await db.instruments.bulkPut(instruments ?? [])
    await db.transactions.bulkPut((transactions ?? []).map((t) => ({ ...t, profileId: target })))
    await db.sips.bulkPut((sips ?? []).map((s) => ({ ...s, profileId: target })))
    if (settings?.length) {
      await db.settings.bulkPut(settings.filter((s) => isPortableSetting(s.key)))
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
    db.profiles.clear(),
  ])
}
