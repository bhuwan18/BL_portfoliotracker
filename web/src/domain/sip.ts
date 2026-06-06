import dayjs from 'dayjs'
import type { Sip, SipFrequency } from './types'

export function nextDate(isoDate: string, freq: SipFrequency): string {
  const d = dayjs(isoDate)
  if (freq === 'weekly') return d.add(7, 'day').format('YYYY-MM-DD')
  if (freq === 'fortnightly') return d.add(14, 'day').format('YYYY-MM-DD')
  return d.add(1, 'month').format('YYYY-MM-DD')
}

export function nextDueDate(sip: Sip): string {
  return sip.lastRun ? nextDate(sip.lastRun, sip.frequency) : sip.startDate
}

// ISO yyyy-mm-dd strings compare lexicographically, so plain string comparison works.
// Walks the schedule from startDate; an installment count (if set) caps the total
// number of scheduled dates, so a fully-past fixed-term SIP materializes its whole
// history in one run, while an ongoing SIP (no count) keeps generating forever.
export function dueInstallments(sip: Sip, today: string = dayjs().format('YYYY-MM-DD')): string[] {
  if (!sip.active) return []
  const max = sip.installments && sip.installments > 0 ? sip.installments : Infinity
  const due: string[] = []
  let cursor = sip.startDate
  let scheduled = 0
  let guard = 0
  while (scheduled < max && cursor <= today) {
    // Skip installments already materialized (lastRun and earlier).
    if (!sip.lastRun || cursor > sip.lastRun) due.push(cursor)
    scheduled++
    cursor = nextDate(cursor, sip.frequency)
    if (++guard > 2000) break
  }
  return due
}

// The ISO date of the final scheduled installment, or null for an ongoing SIP.
export function lastInstallmentDate(sip: Sip): string | null {
  if (!sip.installments || sip.installments <= 0) return null
  let d = sip.startDate
  for (let i = 1; i < sip.installments; i++) d = nextDate(d, sip.frequency)
  return d
}

// True once a fixed-term SIP has materialized its final installment.
export function isComplete(sip: Sip): boolean {
  const last = lastInstallmentDate(sip)
  return last != null && !!sip.lastRun && sip.lastRun >= last
}

export const FREQUENCY_LABEL: Record<SipFrequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
}
