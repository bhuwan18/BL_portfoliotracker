import { db, uid } from './index'
import type { Instrument, Sip, SipFrequency, Transaction, TxnKind } from '../domain/types'
import { dueInstallments } from '../domain/sip'
import { priceOnDate } from '../api/instrument'

export async function getOrCreateInstrument(inst: Instrument): Promise<Instrument> {
  const existing = await db.instruments.get(inst.id)
  if (existing) return existing
  await db.instruments.put(inst)
  return inst
}

export interface NewTxnInput {
  instrument: Instrument
  kind: TxnKind
  date: string
  units: number
  price: number
  fees?: number
  notes?: string
}

export async function addTransaction(input: NewTxnInput): Promise<string> {
  await getOrCreateInstrument(input.instrument)
  const id = uid('t_')
  const txn: Transaction = {
    id,
    instrumentId: input.instrument.id,
    kind: input.kind,
    date: input.date,
    units: input.units,
    price: input.price,
    fees: input.fees ?? 0,
    notes: input.notes,
    createdAt: Date.now(),
  }
  await db.transactions.add(txn)
  return id
}

export async function updateTransaction(id: string, patch: Partial<Transaction>): Promise<void> {
  await db.transactions.update(id, patch)
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id)
}

// Remove an instrument that no longer has any transactions or watchlist entry.
export async function pruneInstrument(instrumentId: string): Promise<void> {
  const txnCount = await db.transactions.where('instrumentId').equals(instrumentId).count()
  const watched = await db.watchlist.get(instrumentId)
  if (txnCount === 0 && !watched) await db.instruments.delete(instrumentId)
}

export async function addToWatchlist(inst: Instrument): Promise<void> {
  await getOrCreateInstrument(inst)
  await db.watchlist.put({ id: inst.id, instrumentId: inst.id, addedAt: Date.now() })
}

export async function removeFromWatchlist(instrumentId: string): Promise<void> {
  await db.watchlist.delete(instrumentId)
  await pruneInstrument(instrumentId)
}

export interface NewSipInput {
  instrument: Instrument
  amount: number
  frequency: SipFrequency
  startDate: string
  active?: boolean
}

export async function addSip(input: NewSipInput): Promise<string> {
  await getOrCreateInstrument(input.instrument)
  const id = uid('s_')
  const sip: Sip = {
    id,
    instrumentId: input.instrument.id,
    amount: input.amount,
    frequency: input.frequency,
    startDate: input.startDate,
    active: input.active ?? true,
    createdAt: Date.now(),
  }
  await db.sips.add(sip)
  return id
}

export async function setSipActive(id: string, active: boolean): Promise<void> {
  await db.sips.update(id, { active })
}

export async function deleteSip(id: string, removeTxns = false): Promise<void> {
  if (removeTxns) {
    await db.transactions.where('sipId').equals(id).delete()
  }
  await db.sips.delete(id)
}

// Materialize any SIP installments due since the last run, pricing each at that
// date's NAV/close. Returns the number of transactions created.
export async function runDueSips(): Promise<number> {
  const sips = (await db.sips.toArray()).filter((s) => s.active)
  let created = 0
  for (const sip of sips) {
    const due = dueInstallments(sip)
    if (due.length === 0) continue
    const inst = await db.instruments.get(sip.instrumentId)
    if (!inst) continue
    for (const date of due) {
      const price = await priceOnDate(inst, date)
      if (price == null || !(price > 0)) break // retry from this date on next run
      const units = sip.amount / price
      await db.transactions.add({
        id: uid('t_'),
        instrumentId: inst.id,
        kind: 'buy',
        date,
        units,
        price,
        fees: 0,
        notes: `SIP · ${sip.frequency}`,
        sipId: sip.id,
        createdAt: Date.now(),
      })
      await db.sips.update(sip.id, { lastRun: date })
      created++
    }
  }
  return created
}
