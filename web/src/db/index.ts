import Dexie, { type Table } from 'dexie'
import type { Instrument, PriceSnapshot, Profile, Setting, Sip, Transaction } from '../domain/types'

// Id of the always-present primary profile, and the settings key that records which profile
// is currently active. See `getActiveProfileId` and `ensureProfiles` (repo.ts).
export const DEFAULT_PROFILE_ID = 'default'
export const ACTIVE_PROFILE_KEY = 'activeProfileId'

// IndexedDB store. Booleans can't be IndexedDB keys, so `sips.active` is not indexed
// (filtered in JS instead). `prices` is a best-effort cache for offline display.
export class MyFundsDB extends Dexie {
  instruments!: Table<Instrument, string>
  transactions!: Table<Transaction, string>
  sips!: Table<Sip, string>
  prices!: Table<PriceSnapshot, string>
  settings!: Table<Setting, string>
  profiles!: Table<Profile, string>

  constructor() {
    super('my-funds')
    // v1 shipped with a `watchlist` store; v2 drops it (the feature was removed).
    this.version(1).stores({
      instruments: 'id, type, name',
      transactions: 'id, instrumentId, date, sipId',
      sips: 'id, instrumentId',
      watchlist: 'id, instrumentId',
      prices: 'instrumentId, asOf',
      settings: 'key',
    })
    this.version(2).stores({
      watchlist: null,
    })
    // v3 adds multi-profile support: a `profiles` table plus a `profileId` on transactions
    // and sips. Existing rows are backfilled to the default profile; the default profile row
    // and `activeProfileId` setting are created idempotently by `ensureProfiles()` so that
    // fresh installs (where no upgrade runs) converge to the same state.
    this.version(3)
      .stores({
        transactions: 'id, instrumentId, date, sipId, profileId',
        sips: 'id, instrumentId, profileId',
        profiles: 'id, createdAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('transactions')
          .toCollection()
          .modify((t: Transaction) => {
            t.profileId = DEFAULT_PROFILE_ID
          })
        await tx
          .table('sips')
          .toCollection()
          .modify((s: Sip) => {
            s.profileId = DEFAULT_PROFILE_ID
          })
      })
  }
}

export const db = new MyFundsDB()

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

// The currently-active portfolio profile. Falls back to the default profile id so reads are
// always valid even before `ensureProfiles()` has run.
export async function getActiveProfileId(): Promise<string> {
  return getSetting<string>(ACTIVE_PROFILE_KEY, DEFAULT_PROFILE_ID)
}
