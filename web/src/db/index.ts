import Dexie, { type Table } from 'dexie'
import type {
  Instrument,
  PriceSnapshot,
  Setting,
  Sip,
  Transaction,
  WatchItem,
} from '../domain/types'

// IndexedDB store. Booleans can't be IndexedDB keys, so `sips.active` is not indexed
// (filtered in JS instead). `prices` is a best-effort cache for offline display.
export class MyFundsDB extends Dexie {
  instruments!: Table<Instrument, string>
  transactions!: Table<Transaction, string>
  sips!: Table<Sip, string>
  watchlist!: Table<WatchItem, string>
  prices!: Table<PriceSnapshot, string>
  settings!: Table<Setting, string>

  constructor() {
    super('my-funds')
    this.version(1).stores({
      instruments: 'id, type, name',
      transactions: 'id, instrumentId, date, sipId',
      sips: 'id, instrumentId',
      watchlist: 'id, instrumentId',
      prices: 'instrumentId, asOf',
      settings: 'key',
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
