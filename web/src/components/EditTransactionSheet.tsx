import { useEffect, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { Sheet } from './Sheet'
import { SegmentedControl, Spinner, useToast } from './ui'
import { updateTransaction } from '../db/repo'
import type { Instrument, Transaction, TxnKind } from '../domain/types'
import { formatINR, formatUnits, todayISO } from '../lib/format'

// Parse a user-entered number; empty / non-finite -> NaN (treated as invalid).
function num(s: string): number {
  if (s.trim() === '') return NaN
  return parseFloat(s)
}

// Bottom-sheet editor for an existing transaction. Open when `txn` is non-null.
// Edits date / type / units / price in place via updateTransaction; the instrument,
// fees, notes, and any sipId are left untouched (portfolio math recomputes).
export function EditTransactionSheet({
  txn,
  instrument,
  onClose,
  onDelete,
}: {
  txn: Transaction | null
  instrument: Instrument | null
  onClose: () => void
  onDelete: (id: string) => void | Promise<void>
}) {
  const { show, node } = useToast()
  const isMf = instrument?.type === 'mf'

  const [kind, setKind] = useState<TxnKind>('buy')
  const [date, setDate] = useState(todayISO())
  const [units, setUnits] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Inline-validation: only surface an error once the user has left the field.
  const [touched, setTouched] = useState<{ units?: boolean; price?: boolean }>({})
  // Two-step in-sheet delete confirmation (avoids a jarring native confirm()).
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Re-seed the form whenever a different transaction is opened.
  useEffect(() => {
    if (!txn) return
    setKind(txn.kind)
    setDate(txn.date)
    setUnits(String(txn.units))
    setPrice(String(txn.price))
    setSaving(false)
    setDeleting(false)
    setTouched({})
    setConfirmingDelete(false)
  }, [txn])

  const unitsVal = num(units)
  const priceVal = num(price)
  const validUnits = Number.isFinite(unitsVal) && unitsVal > 0
  const validPrice = Number.isFinite(priceVal) && priceVal > 0
  const canSave = !!txn && !saving && validUnits && validPrice

  const showUnitsErr = !!touched.units && !validUnits
  const showPriceErr = !!touched.price && !validPrice

  const total = validUnits && validPrice ? unitsVal * priceVal : NaN
  const priceLabel = isMf ? 'NAV' : 'Price'
  const qtyLabel = isMf ? 'Units' : 'Qty'

  // Has the user changed anything since the sheet opened? Used to guard dismissal.
  const dirty =
    !!txn &&
    (kind !== txn.kind ||
      date !== txn.date ||
      units !== String(txn.units) ||
      price !== String(txn.price))

  // Guard the scrim/X/Escape dismiss paths against losing unsaved edits.
  function requestClose() {
    if (saving || deleting) return
    if (dirty && !window.confirm('Discard your changes?')) return
    onClose()
  }

  async function handleSave() {
    if (!txn || !validUnits || !validPrice) return
    setSaving(true)
    try {
      // fees / notes (incl. SIP labels) and sipId are intentionally omitted so
      // Dexie's shallow update leaves any existing values untouched.
      await updateTransaction(txn.id, {
        kind,
        date,
        units: unitsVal,
        price: priceVal,
      })
      onClose()
    } catch {
      show('Could not save changes')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!txn || deleting) return
    setDeleting(true)
    try {
      await onDelete(txn.id)
      onClose()
    } catch {
      show('Could not delete transaction')
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  return (
    <>
      <Sheet open={!!txn} onClose={requestClose} title="Edit transaction" bodyClassName="txn-form">
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
          <label htmlFor="edit-date">Date</label>
          <input
            id="edit-date"
            className="input"
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="edit-units">{qtyLabel}</label>
          <input
            id="edit-units"
            className="input"
            inputMode="decimal"
            placeholder="0"
            value={units}
            aria-invalid={showUnitsErr || undefined}
            aria-describedby={showUnitsErr ? 'edit-units-err' : undefined}
            onChange={(e) => setUnits(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, units: true }))}
          />
          {showUnitsErr && (
            <div className="help err" id="edit-units-err">
              Enter {isMf ? 'units' : 'a quantity'} greater than 0.
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="edit-price">{priceLabel}</label>
          <div className="input-prefix">
            <span className="pfx">₹</span>
            <input
              id="edit-price"
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={price}
              aria-invalid={showPriceErr || undefined}
              aria-describedby={showPriceErr ? 'edit-price-err' : undefined}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, price: true }))}
            />
          </div>
          {showPriceErr && (
            <div className="help err" id="edit-price-err">
              Enter a {isMf ? 'NAV' : 'price'} greater than 0.
            </div>
          )}
        </div>

        <div className="card summary-card" style={{ marginBottom: 12 }}>
          <div className="summary-row">
            <div className="summary-info">
              <div className="summary-label">{kind === 'buy' ? 'Total cost' : 'Total proceeds'}</div>
              <div className="summary-sub">
                {validUnits ? formatUnits(unitsVal) : '—'} units
                {validPrice ? ` × ${formatINR(priceVal)}` : ''}
              </div>
            </div>
            <div className="summary-total tnum">{Number.isFinite(total) ? formatINR(total) : '—'}</div>
          </div>
        </div>

        <button
          type="button"
          className="btn primary"
          disabled={!canSave || deleting}
          onClick={handleSave}
        >
          {saving ? <Spinner /> : <Check size={18} />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>

        <div className="sheet-danger">
          {confirmingDelete ? (
            <>
              <div className="danger-prompt">Delete this transaction? This can't be undone.</div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={deleting}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </button>
                <button type="button" className="btn danger" disabled={deleting} onClick={handleDelete}>
                  {deleting ? <Spinner /> : <Trash2 size={18} />}
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn danger"
              disabled={saving || deleting}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 size={18} />
              Delete transaction
            </button>
          )}
        </div>
      </Sheet>
      {node}
    </>
  )
}
