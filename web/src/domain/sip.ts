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
export function dueInstallments(sip: Sip, today: string = dayjs().format('YYYY-MM-DD')): string[] {
  if (!sip.active) return []
  const dates: string[] = []
  let cursor = nextDueDate(sip)
  let guard = 0
  while (cursor <= today) {
    dates.push(cursor)
    cursor = nextDate(cursor, sip.frequency)
    if (++guard > 2000) break
  }
  return dates
}

export const FREQUENCY_LABEL: Record<SipFrequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
}
