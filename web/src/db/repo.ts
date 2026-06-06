import {
  ACTIVE_PROFILE_KEY,
  DEFAULT_PROFILE_ID,
  db,
  getActiveProfileId,
  getSetting,
  setSetting,
  uid,
} from './index'
import type { Instrument, Profile, Sip, SipFrequency, Transaction, TxnKind } from '../domain/types'
import { dueInstallments, isComplete } from '../domain/sip'
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
  const profileId = await getActiveProfileId()
  const txn: Transaction = {
    id,
    instrumentId: input.instrument.id,
    profileId,
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

// Remove an instrument that no longer has any transactions or SIPs in ANY profile.
// Instruments are shared reference data, so they survive as long as any profile references
// them — that's why both counts are global (not profile-scoped).
export async function pruneInstrument(instrumentId: string): Promise<void> {
  const txnCount = await db.transactions.where('instrumentId').equals(instrumentId).count()
  if (txnCount > 0) return
  const sipCount = await db.sips.where('instrumentId').equals(instrumentId).count()
  if (sipCount === 0) await db.instruments.delete(instrumentId)
}

// Delete an entire holding within a single profile: that profile's transactions and SIPs
// for the instrument, all in one atomic transaction so a holding never half-disappears.
// The shared instrument record and its cached price are garbage-collected only once no
// transaction or SIP references the instrument in any profile (another profile may hold it).
// (A "holding" isn't a stored row; it's the instrument plus its transactions.)
export async function deleteHolding(instrumentId: string, profileId: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.sips, db.prices, db.instruments, async () => {
    await db.transactions
      .where('instrumentId')
      .equals(instrumentId)
      .filter((t) => t.profileId === profileId)
      .delete()
    await db.sips
      .where('instrumentId')
      .equals(instrumentId)
      .filter((s) => s.profileId === profileId)
      .delete()
    const txnLeft = await db.transactions.where('instrumentId').equals(instrumentId).count()
    const sipLeft = await db.sips.where('instrumentId').equals(instrumentId).count()
    if (txnLeft === 0 && sipLeft === 0) {
      await db.prices.delete(instrumentId)
      await db.instruments.delete(instrumentId)
    }
  })
}

export interface NewSipInput {
  instrument: Instrument
  amount: number
  frequency: SipFrequency
  startDate: string
  installments?: number // total planned installments; omitted = ongoing
  active?: boolean
}

export async function addSip(input: NewSipInput): Promise<string> {
  await getOrCreateInstrument(input.instrument)
  const id = uid('s_')
  const profileId = await getActiveProfileId()
  const installments =
    input.installments && input.installments > 0 ? Math.floor(input.installments) : undefined
  const sip: Sip = {
    id,
    instrumentId: input.instrument.id,
    profileId,
    amount: input.amount,
    frequency: input.frequency,
    startDate: input.startDate,
    installments,
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
        profileId: sip.profileId,
        kind: 'buy',
        date,
        units,
        price,
        fees: 0,
        notes: `SIP · ${sip.frequency}`,
        sipId: sip.id,
        createdAt: Date.now(),
      })
      sip.lastRun = date
      await db.sips.update(sip.id, { lastRun: date })
      created++
    }
    // A fixed-term SIP that has run its final installment is done — deactivate it
    // so it stops generating and reads as a closed (past) plan.
    if (isComplete(sip)) await db.sips.update(sip.id, { active: false })
  }
  return created
}

// ---- Profiles ----

// Per-profile manual holdings-order settings key (see useHoldingsOrder).
function holdingsOrderKey(profileId: string): string {
  return `holdingsOrder:${profileId}`
}

// Idempotently guarantee the invariant that at least one profile exists and `activeProfileId`
// points at a real one. Runs once at bootstrap (covers both fresh installs and DBs upgraded
// from v2, where the migration backfilled rows but created no profile row). Also migrates the
// legacy global `holdingsOrder` setting onto the default profile so existing users keep their
// manual order.
export async function ensureProfiles(): Promise<void> {
  if ((await db.profiles.count()) === 0) {
    await db.profiles.put({ id: DEFAULT_PROFILE_ID, name: 'Main', createdAt: Date.now() })
    const legacyOrder = await getSetting<string[] | null>('holdingsOrder', null)
    if (legacyOrder) await setSetting(holdingsOrderKey(DEFAULT_PROFILE_ID), legacyOrder)
  }
  const active = await getSetting<string | null>(ACTIVE_PROFILE_KEY, null)
  if (!active || !(await db.profiles.get(active))) {
    const first = await db.profiles.orderBy('createdAt').first()
    await setSetting(ACTIVE_PROFILE_KEY, first?.id ?? DEFAULT_PROFILE_ID)
  }
}

export async function createProfile(name: string): Promise<string> {
  const id = uid('p_')
  const profile: Profile = { id, name: name.trim() || 'Profile', createdAt: Date.now() }
  await db.profiles.put(profile)
  return id
}

export async function renameProfile(id: string, name: string): Promise<void> {
  await db.profiles.update(id, { name: name.trim() || 'Profile' })
}

export async function setActiveProfile(id: string): Promise<void> {
  if (await db.profiles.get(id)) await setSetting(ACTIVE_PROFILE_KEY, id)
}

// Delete a profile and all of its data. Refuses to delete the last remaining profile. Any
// instrument left with no transactions or SIPs in any profile is garbage-collected along
// with its cached price. If the deleted profile was active, the active profile is reassigned
// to the oldest survivor — done last and in-transaction so observers never see a dead id.
export async function deleteProfile(id: string): Promise<void> {
  if ((await db.profiles.count()) <= 1) throw new Error('Cannot delete the only profile.')
  await db.transaction(
    'rw',
    [db.transactions, db.sips, db.prices, db.instruments, db.profiles, db.settings],
    async () => {
      const touched = new Set<string>()
      await db.transactions
        .where('profileId')
        .equals(id)
        .each((t) => touched.add(t.instrumentId))
      await db.sips
        .where('profileId')
        .equals(id)
        .each((s) => touched.add(s.instrumentId))
      await db.transactions.where('profileId').equals(id).delete()
      await db.sips.where('profileId').equals(id).delete()
      for (const instId of touched) {
        const txnLeft = await db.transactions.where('instrumentId').equals(instId).count()
        const sipLeft = await db.sips.where('instrumentId').equals(instId).count()
        if (txnLeft === 0 && sipLeft === 0) {
          await db.prices.delete(instId)
          await db.instruments.delete(instId)
        }
      }
      await db.profiles.delete(id)
      await db.settings.delete(holdingsOrderKey(id))
      const active = await getSetting<string | null>(ACTIVE_PROFILE_KEY, null)
      if (active === id) {
        const next = await db.profiles.orderBy('createdAt').first()
        await setSetting(ACTIVE_PROFILE_KEY, next?.id ?? DEFAULT_PROFILE_ID)
      }
    },
  )
}
