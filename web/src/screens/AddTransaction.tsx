import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { Plus, Search } from 'lucide-react'
import { AppBar, SegmentedControl, Spinner, useToast } from '../components/ui'
import { SearchSheet } from '../components/SearchSheet'
import { InstrumentAvatar } from '../components/InstrumentAvatar'
import {
  buildInstrument,
  fetchQuote,
  priceOnDate,
  type UnifiedSearchResult,
} from '../api/instrument'
import { db } from '../db'
import { addSip, addTransaction, runDueSips } from '../db/repo'
import { useMarket } from '../store/market'
import { FREQUENCY_LABEL, lastInstallmentDate } from '../domain/sip'
import type { Instrument, Sip, SipFrequency, TxnKind } from '../domain/types'
import { formatDate, formatINR, formatUnits, todayISO } from '../lib/format'

type EntryMode = 'amount' | 'units'
// Transaction type plus the SIP plan option (mutual funds only).
type FormMode = TxnKind | 'sip'

const FREQ_OPTIONS: { value: SipFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
]

// Parse a user-entered number; empty / non-finite -> NaN (treated as invalid).
function num(s: string): number {
  if (s.trim() === '') return NaN
  return parseFloat(s)
}

// Run `fn` when Enter is pressed in a single-line input (suppress the default so
// the keypress doesn't bubble), powering the keyboard Next/Done flow on mobile.
function onEnter(fn: () => void) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      fn()
    }
  }
}

// Track how much of the layout viewport is hidden by the on-screen keyboard.
// iOS shrinks the *visual* viewport when the keyboard opens but leaves the
// *layout* viewport full-height, so a bottom-anchored button ends up behind the
// keyboard. Mirrors the pattern used in components/Sheet.tsx.
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const sync = () => {
      const hidden = window.innerHeight - (viewport.offsetTop + viewport.height)
      setInset(Math.max(0, Math.round(hidden)))
    }
    sync()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
    }
  }, [])
  return inset
}

export function AddTransactionScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const presetId = (location.state as { instrumentId?: string } | null)?.instrumentId
  const { show, node } = useToast()
  const refreshOne = useMarket((s) => s.refreshOne)

  const [searchOpen, setSearchOpen] = useState(false)
  const [building, setBuilding] = useState(!!presetId)
  const [instrument, setInstrument] = useState<Instrument | null>(null)

  const [kind, setKind] = useState<FormMode>('buy')
  const [date, setDate] = useState(todayISO())
  const [entryMode, setEntryMode] = useState<EntryMode>('units')
  const [amount, setAmount] = useState('')
  const [unitsInput, setUnitsInput] = useState('')
  const [price, setPrice] = useState('')
  const [frequency, setFrequency] = useState<SipFrequency>('monthly')
  const [installments, setInstallments] = useState('')
  const [pricing, setPricing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Refs for keyboard Next/Done navigation between the numeric inputs.
  const amountRef = useRef<HTMLInputElement>(null)
  const unitsRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)
  const installmentsRef = useRef<HTMLInputElement>(null)

  const keyboardInset = useKeyboardInset()
  const keyboardOpen = keyboardInset > 120

  const isMf = instrument?.type === 'mf'
  const isSip = kind === 'sip'

  // SIPs are mutual-fund only; revert to Buy if the instrument is a stock.
  useEffect(() => {
    if (instrument && instrument.type !== 'mf' && kind === 'sip') setKind('buy')
  }, [instrument, kind])

  // Once an instrument is selected (and its quote has loaded), drop the cursor
  // into the first number field so the user can start typing immediately. Runs
  // once per instrument. On iOS the keyboard may not pop because the preceding
  // fetch breaks the user-gesture chain, but the keyboard Next/Done flow below
  // (which runs inside a keypress) covers the rest of the journey.
  useEffect(() => {
    if (!instrument || building) return
    const target =
      isMf && (entryMode === 'amount' || isSip) ? amountRef.current : unitsRef.current
    target?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument?.id, building])

  // Preselect the instrument when arriving from its detail page, so the user
  // can add a transaction without searching for the same symbol again.
  useEffect(() => {
    if (!presetId) return
    let cancelled = false
    setBuilding(true)
    void (async () => {
      try {
        const inst = await db.instruments.get(presetId)
        if (cancelled || !inst) return
        setInstrument(inst)
        setEntryMode(inst.type === 'mf' ? 'amount' : 'units')
        const quote = await fetchQuote(inst)
        if (!cancelled && quote && quote.price > 0) setPrice(String(quote.price))
      } catch {
        if (!cancelled) show('Could not load instrument')
      } finally {
        if (!cancelled) setBuilding(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId])

  async function handlePick(r: UnifiedSearchResult) {
    setSearchOpen(false)
    setBuilding(true)
    try {
      const inst = await buildInstrument(r)
      setInstrument(inst)
      setEntryMode(inst.type === 'mf' ? 'amount' : 'units')
      const quote = await fetchQuote(inst)
      if (quote && quote.price > 0) setPrice(String(quote.price))
    } catch {
      show('Could not load instrument')
    } finally {
      setBuilding(false)
    }
  }

  async function handleDateChange(value: string) {
    setDate(value)
    if (!instrument) return
    setPricing(true)
    try {
      const p = await priceOnDate(instrument, value)
      if (p != null && p > 0) setPrice(String(p))
    } finally {
      setPricing(false)
    }
  }

  const priceVal = num(price)
  const amountVal = num(amount)

  // Derive units from the active entry mode.
  const computedUnits =
    isMf && entryMode === 'amount'
      ? priceVal > 0 && Number.isFinite(amountVal)
        ? amountVal / priceVal
        : NaN
      : num(unitsInput)

  const validUnits = Number.isFinite(computedUnits) && computedUnits > 0
  const validPrice = Number.isFinite(priceVal) && priceVal > 0
  const validAmount = Number.isFinite(amountVal) && amountVal > 0

  // Installments are optional (blank = ongoing). When given, must be a whole number ≥ 1.
  const installmentsVal = num(installments)
  const installmentsEntered = installments.trim() !== ''
  const validInstallments =
    !installmentsEntered ||
    (Number.isFinite(installmentsVal) && installmentsVal >= 1 && Number.isInteger(installmentsVal))
  const installmentCount = installmentsEntered ? Math.floor(installmentsVal) : undefined

  const canSave =
    !!instrument &&
    !saving &&
    (isSip ? validAmount && date.length > 0 && validInstallments : validUnits && validPrice)

  const total = validUnits && validPrice ? computedUnits * priceVal : NaN
  const priceLabel = isMf ? 'NAV' : 'Price'

  // Quick-pick dates: most transactions are entered today or the day before.
  const today = todayISO()
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
  function pickDate(iso: string) {
    if (isSip) setDate(iso)
    else void handleDateChange(iso)
  }
  function submitFromKeyboard() {
    if (canSave) void handleSave()
  }

  async function handleSave() {
    if (!instrument) return
    if (kind === 'sip') {
      if (!validAmount || !date || !validInstallments) return
      setSaving(true)
      try {
        await addSip({
          instrument,
          amount: amountVal,
          frequency,
          startDate: date,
          installments: installmentCount,
        })
        await runDueSips()
        show('SIP created')
        void refreshOne(instrument)
        navigate(-1)
      } catch {
        show('Could not create SIP')
        setSaving(false)
      }
      return
    }
    if (!validUnits || !validPrice) return
    setSaving(true)
    try {
      await addTransaction({
        instrument,
        kind,
        date,
        units: computedUnits,
        price: priceVal,
      })
      void refreshOne(instrument)
      navigate(-1)
    } catch {
      show('Could not save transaction')
      setSaving(false)
    }
  }

  return (
    <>
      <AppBar title="Add transaction" back={true} />

      <div className="screen section txn-form">
        <div className="field">
          <label>Instrument</label>
          {instrument ? (
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InstrumentAvatar name={instrument.name} type={instrument.type} />
              <div className="main" style={{ minWidth: 0 }}>
                <div className="title">{instrument.name}</div>
                <div className="subtitle">{instrument.type === 'mf' ? 'Mutual Fund' : instrument.exchange || 'Stock'}</div>
              </div>
              <button
                type="button"
                className="chip-btn"
                onClick={() => setSearchOpen(true)}
              >
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn dashed"
              onClick={() => setSearchOpen(true)}
              disabled={building}
            >
              {building ? <Spinner /> : <Search size={18} />}
              {building ? 'Loading…' : 'Select instrument'}
            </button>
          )}
        </div>

        {instrument && (
          <>
            <div className="field">
              <label>Type</label>
              <SegmentedControl
                accent
                options={
                  isMf
                    ? [
                        { value: 'buy', label: 'Buy' },
                        { value: 'sell', label: 'Sell' },
                        { value: 'sip', label: 'SIP' },
                      ]
                    : [
                        { value: 'buy', label: 'Buy' },
                        { value: 'sell', label: 'Sell' },
                      ]
                }
                value={kind}
                onChange={setKind}
              />
            </div>

            <div className="field">
              <label>{isSip ? 'Start date' : 'Date'}</label>
              <div className="date-quick">
                <button
                  type="button"
                  className={`chip-btn${date === today ? ' chip-btn--active' : ''}`}
                  onClick={() => pickDate(today)}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`chip-btn${date === yesterday ? ' chip-btn--active' : ''}`}
                  onClick={() => pickDate(yesterday)}
                >
                  Yesterday
                </button>
              </div>
              <input
                className="input"
                type="date"
                value={date}
                max={isSip ? undefined : today}
                onChange={(e) =>
                  isSip ? setDate(e.target.value) : handleDateChange(e.target.value)
                }
              />
            </div>

            {isSip ? (
              <>
                <div className="field">
                  <label>Amount per installment</label>
                  <div className="input-prefix">
                    <span className="pfx">₹</span>
                    <input
                      ref={amountRef}
                      className="input"
                      inputMode="decimal"
                      enterKeyHint="next"
                      placeholder="5000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onKeyDown={onEnter(() => installmentsRef.current?.focus())}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Frequency</label>
                  <SegmentedControl options={FREQ_OPTIONS} value={frequency} onChange={setFrequency} />
                </div>

                <div className="field">
                  <label>Number of installments</label>
                  <input
                    ref={installmentsRef}
                    className="input"
                    inputMode="numeric"
                    enterKeyHint="done"
                    placeholder="Ongoing"
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                    onKeyDown={onEnter(submitFromKeyboard)}
                  />
                  <div className="help">
                    {installmentsEntered && !validInstallments
                      ? 'Enter a whole number of installments (1 or more).'
                      : 'Leave blank for an ongoing SIP. Set a count to record a past or closed plan.'}
                  </div>
                </div>

                <div className="card summary-card" style={{ marginBottom: 12 }}>
                  <div className="summary-row">
                    <div className="summary-info">
                      <div className="summary-label">SIP plan</div>
                      <div className="summary-sub">
                        {validAmount ? formatINR(amountVal) : '—'} · {FREQUENCY_LABEL[frequency]} ·{' '}
                        {installmentCount && validInstallments
                          ? `${installmentCount} installments`
                          : 'ongoing'}
                      </div>
                    </div>
                    {installmentCount && validInstallments && validAmount ? (
                      <div className="summary-total tnum">{formatINR(amountVal * installmentCount)}</div>
                    ) : null}
                  </div>
                  <div className="help" style={{ marginTop: 8 }}>
                    {installmentCount && validInstallments
                      ? `${formatDate(date)} → ${formatDate(
                          lastInstallmentDate({ startDate: date, frequency, installments: installmentCount } as Sip) ??
                            date,
                        )}. Each installment is recorded automatically using that date's NAV.`
                      : `From ${formatDate(date)}. Each installment is recorded automatically using that date's NAV.`}
                  </div>
                </div>
              </>
            ) : (
            <>
            {isMf && (
              <div className="field">
                <label>Entry mode</label>
                <SegmentedControl
                  options={[
                    { value: 'amount', label: 'By amount' },
                    { value: 'units', label: 'By units' },
                  ]}
                  value={entryMode}
                  onChange={setEntryMode}
                />
              </div>
            )}

            {isMf && entryMode === 'amount' ? (
              <div className="field">
                <label>Amount</label>
                <div className="input-prefix">
                  <span className="pfx">₹</span>
                  <input
                    ref={amountRef}
                    className="input"
                    inputMode="decimal"
                    enterKeyHint="next"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={onEnter(() => priceRef.current?.focus())}
                  />
                </div>
                {validPrice && Number.isFinite(amountVal) && amountVal > 0 && (
                  <div className="help">≈ {formatUnits(computedUnits)} units</div>
                )}
              </div>
            ) : (
              <div className="field">
                <label>Units</label>
                <input
                  ref={unitsRef}
                  className="input"
                  inputMode="decimal"
                  enterKeyHint="next"
                  placeholder="0"
                  value={unitsInput}
                  onChange={(e) => setUnitsInput(e.target.value)}
                  onKeyDown={onEnter(() => priceRef.current?.focus())}
                />
              </div>
            )}

            <div className="field">
              <label>{priceLabel}</label>
              <div className="input-prefix">
                <span className="pfx">{pricing ? <Spinner /> : '₹'}</span>
                <input
                  ref={priceRef}
                  className="input"
                  inputMode="decimal"
                  enterKeyHint="done"
                  placeholder="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  onKeyDown={onEnter(submitFromKeyboard)}
                />
              </div>
            </div>

            <div className="card summary-card" style={{ marginBottom: 12 }}>
              <div className="summary-row">
                <div className="summary-info">
                  <div className="summary-label">{kind === 'buy' ? 'Total cost' : 'Total proceeds'}</div>
                  <div className="summary-sub">
                    {validUnits ? formatUnits(computedUnits) : '—'} units
                    {validPrice ? ` × ${formatINR(priceVal)}` : ''}
                  </div>
                </div>
                <div className="summary-total tnum">{Number.isFinite(total) ? formatINR(total) : '—'}</div>
              </div>
            </div>
            </>
            )}

            <div
              className={`txn-save${keyboardOpen ? ' txn-save--floating' : ''}`}
              style={keyboardOpen ? { bottom: keyboardInset } : undefined}
            >
              <button type="button" className="btn primary" disabled={!canSave} onClick={handleSave}>
                {saving ? <Spinner /> : <Plus size={18} />}
                {saving ? 'Saving…' : isSip ? 'Create SIP' : 'Save transaction'}
              </button>
            </div>
          </>
        )}
      </div>

      <SearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={handlePick}
        title="Select instrument"
        defaultType={instrument?.type ?? 'stock'}
      />

      {node}
    </>
  )
}
