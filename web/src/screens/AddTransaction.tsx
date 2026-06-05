import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { addTransaction } from '../db/repo'
import type { Instrument, TxnKind } from '../domain/types'
import { formatINR, formatUnits, todayISO } from '../lib/format'

type EntryMode = 'amount' | 'units'

// Parse a user-entered number; empty / non-finite -> NaN (treated as invalid).
function num(s: string): number {
  if (s.trim() === '') return NaN
  return parseFloat(s)
}

export function AddTransactionScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const presetId = (location.state as { instrumentId?: string } | null)?.instrumentId
  const { show, node } = useToast()

  const [searchOpen, setSearchOpen] = useState(false)
  const [building, setBuilding] = useState(!!presetId)
  const [instrument, setInstrument] = useState<Instrument | null>(null)

  const [kind, setKind] = useState<TxnKind>('buy')
  const [date, setDate] = useState(todayISO())
  const [entryMode, setEntryMode] = useState<EntryMode>('units')
  const [amount, setAmount] = useState('')
  const [unitsInput, setUnitsInput] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('')
  const [notes, setNotes] = useState('')
  const [pricing, setPricing] = useState(false)
  const [saving, setSaving] = useState(false)

  const isMf = instrument?.type === 'mf'

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
        setEntryMode('units')
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
      setEntryMode('units')
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
  const feesVal = fees.trim() === '' ? 0 : num(fees)
  const amountVal = num(amount)

  // Derive units from the active entry mode.
  const computedUnits =
    isMf && entryMode === 'amount'
      ? priceVal > 0 && Number.isFinite(amountVal)
        ? amountVal / priceVal
        : NaN
      : num(unitsInput)

  const feesClean = Number.isFinite(feesVal) ? feesVal : 0
  const validUnits = Number.isFinite(computedUnits) && computedUnits > 0
  const validPrice = Number.isFinite(priceVal) && priceVal > 0
  const canSave = !!instrument && validUnits && validPrice && !saving

  const total = validUnits && validPrice ? computedUnits * priceVal + feesClean : NaN
  const priceLabel = isMf ? 'NAV' : 'Price'

  async function handleSave() {
    if (!instrument || !validUnits || !validPrice) return
    setSaving(true)
    try {
      await addTransaction({
        instrument,
        kind,
        date,
        units: computedUnits,
        price: priceVal,
        fees: feesClean,
        notes: notes.trim() || undefined,
      })
      navigate(-1)
    } catch {
      show('Could not save transaction')
      setSaving(false)
    }
  }

  return (
    <>
      <AppBar title="Add transaction" back={true} />

      <div className="screen section">
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
                options={[
                  { value: 'buy', label: 'Buy' },
                  { value: 'sell', label: 'Sell' },
                ]}
                value={kind}
                onChange={setKind}
              />
            </div>

            <div className="field">
              <label>Date</label>
              <input
                className="input"
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>

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
                    className="input"
                    inputMode="decimal"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
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
                  className="input"
                  inputMode="decimal"
                  placeholder="0"
                  value={unitsInput}
                  onChange={(e) => setUnitsInput(e.target.value)}
                />
              </div>
            )}

            <div className="field">
              <label>{priceLabel}</label>
              <div className="input-prefix">
                <span className="pfx">{pricing ? <Spinner /> : '₹'}</span>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Fees (optional)</label>
              <div className="input-prefix">
                <span className="pfx">₹</span>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="0"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Notes (optional)</label>
              <textarea
                className="input"
                placeholder="Add a note…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="card summary-card" style={{ marginBottom: 16 }}>
              <div className="summary-row">
                <div className="summary-info">
                  <div className="summary-label">{kind === 'buy' ? 'Total cost' : 'Total proceeds'}</div>
                  <div className="summary-sub">
                    {validUnits ? formatUnits(computedUnits) : '—'} units
                    {validPrice ? ` × ${formatINR(priceVal)}` : ''}
                    {feesClean > 0 ? ` + ${formatINR(feesClean)} fees` : ''}
                  </div>
                </div>
                <div className="summary-total tnum">{Number.isFinite(total) ? formatINR(total) : '—'}</div>
              </div>
            </div>

            <button type="button" className="btn primary" disabled={!canSave} onClick={handleSave}>
              {saving ? <Spinner /> : <Plus size={18} />}
              {saving ? 'Saving…' : 'Save transaction'}
            </button>
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
