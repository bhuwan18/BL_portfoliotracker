import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { AppBar, EmptyState, Loading, SegmentedControl, useToast } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { SearchSheet } from '../components/SearchSheet'
import { InstrumentAvatar } from '../components/InstrumentAvatar'
import { db } from '../db/index'
import { addSip, deleteSip, runDueSips, setSipActive } from '../db/repo'
import { buildInstrument, type UnifiedSearchResult } from '../api/instrument'
import { FREQUENCY_LABEL, nextDueDate } from '../domain/sip'
import { formatDate, formatINR, todayISO } from '../lib/format'
import type { Instrument, SipFrequency } from '../domain/types'

export function SipScreen() {
  const sips = useLiveQuery(() => db.sips.toArray())
  const instruments = useLiveQuery(() => db.instruments.toArray())
  const { show, node } = useToast()

  const [searchOpen, setSearchOpen] = useState(false)
  const [pending, setPending] = useState<Instrument | null>(null)

  const loading = sips === undefined || instruments === undefined
  const byId = new Map((instruments ?? []).map((i) => [i.id, i]))

  async function onPick(result: UnifiedSearchResult) {
    const instrument = await buildInstrument(result)
    setSearchOpen(false)
    setPending(instrument)
  }

  async function onConfirm(input: {
    amount: number
    frequency: SipFrequency
    startDate: string
  }) {
    if (!pending) return
    await addSip({ instrument: pending, ...input })
    await runDueSips()
    setPending(null)
    show('SIP created')
  }

  async function onDelete(id: string) {
    if (!window.confirm('Delete this SIP? Existing transactions will be kept.')) return
    await deleteSip(id, false)
  }

  const newSipButton = (
    <button className="btn primary" type="button" onClick={() => setSearchOpen(true)}>
      <Plus size={18} /> New SIP
    </button>
  )

  return (
    <>
      <AppBar title="SIPs" back={true} />

      {loading ? (
        <Loading label="Loading SIPs…" />
      ) : sips.length === 0 ? (
        <div className="screen">
          <EmptyState
            icon={<CalendarClock size={28} />}
            title="No SIPs yet"
            message="Set up a recurring investment in a mutual fund and we'll record each installment automatically."
            action={newSipButton}
          />
        </div>
      ) : (
        <div className="screen section">
          <div className="list">
            {sips.map((sip) => {
              const inst = byId.get(sip.instrumentId)
              const name = inst?.name ?? 'Unknown'
              return (
                <div key={sip.id} className="row">
                  <InstrumentAvatar name={name} type={inst?.type ?? 'mf'} />
                  <div className="main">
                    <div className="title">{name}</div>
                    <div className="subtitle">
                      {formatINR(sip.amount)} · {FREQUENCY_LABEL[sip.frequency]} · Next{' '}
                      {formatDate(nextDueDate(sip))}
                    </div>
                  </div>
                  <button
                    className={sip.active ? 'switch on' : 'switch'}
                    type="button"
                    aria-label={sip.active ? 'Pause SIP' : 'Resume SIP'}
                    onClick={() => setSipActive(sip.id, !sip.active)}
                  />
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label="Delete SIP"
                    onClick={() => onDelete(sip.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 18 }}>{newSipButton}</div>
        </div>
      )}

      <SearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={onPick}
        title="New SIP"
        defaultType="mf"
      />

      {pending && (
        <SipForm instrument={pending} onClose={() => setPending(null)} onConfirm={onConfirm} />
      )}

      {node}
    </>
  )
}

function SipForm({
  instrument,
  onClose,
  onConfirm,
}: {
  instrument: Instrument
  onClose: () => void
  onConfirm: (input: { amount: number; frequency: SipFrequency; startDate: string }) => void
}) {
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<SipFrequency>('monthly')
  const [startDate, setStartDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)

  const amountNum = Number(amount)
  const valid = Number.isFinite(amountNum) && amountNum > 0 && startDate.length > 0

  async function confirm() {
    if (!valid || saving) return
    setSaving(true)
    await onConfirm({ amount: amountNum, frequency, startDate })
  }

  return (
    <Sheet open={true} onClose={onClose} title="New SIP">
      <div className="row" style={{ marginBottom: 18 }}>
        <InstrumentAvatar name={instrument.name} type={instrument.type} />
        <div className="main">
          <div className="title">{instrument.name}</div>
          {instrument.category && <div className="subtitle">{instrument.category}</div>}
        </div>
      </div>

      <div className="field">
        <label htmlFor="sip-amount">Amount per installment</label>
        <div className="input-prefix">
          <span className="pfx">₹</span>
          <input
            id="sip-amount"
            className="input"
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="5000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label>Frequency</label>
        <SegmentedControl
          options={[
            { value: 'weekly', label: 'Weekly' },
            { value: 'fortnightly', label: 'Fortnightly' },
            { value: 'monthly', label: 'Monthly' },
          ]}
          value={frequency}
          onChange={setFrequency}
        />
      </div>

      <div className="field">
        <label htmlFor="sip-start">Start date</label>
        <input
          id="sip-start"
          className="input"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>

      <button className="btn primary" type="button" disabled={!valid || saving} onClick={confirm}>
        {saving ? 'Saving…' : 'Create SIP'}
      </button>
    </Sheet>
  )
}
