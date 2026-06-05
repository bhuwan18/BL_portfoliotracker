import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Download,
  FileSpreadsheet,
  KeyRound,
  Lock,
  Palette,
  ShieldOff,
  Trash2,
  Upload,
} from 'lucide-react'
import { db, getSetting, setSetting } from '../db'
import { usePortfolio } from '../hooks/usePortfolio'
import { AppBar, SegmentedControl, useToast } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { hashPin } from '../lib/pin'
import { applyTheme, type ThemeMode } from '../lib/theme'
import { exportBackupFile, importBackup, wipeAllData } from '../lib/backup'
import { exportExcel } from '../lib/excel'
import type { Instrument } from '../domain/types'

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function SettingsScreen() {
  const { show, node } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pinOpen, setPinOpen] = useState(false)

  const { summary } = usePortfolio()
  const transactions = useLiveQuery(() => db.transactions.toArray())
  const instruments = useLiveQuery(() => db.instruments.toArray())
  const pinHash = useLiveQuery(() => getSetting<string | null>('pinHash', null))
  const theme = useLiveQuery(() => getSetting<ThemeMode>('theme', 'system'))

  async function onBackup() {
    try {
      await exportBackupFile()
    } catch {
      show('Could not export backup.')
    }
  }

  function onRestoreClick() {
    fileInput.current?.click()
  }

  async function onRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const r = await importBackup(text, 'replace')
      show(
        `Restored ${r.instruments} instruments, ${r.transactions} transactions, ${r.sips} SIPs.`,
      )
    } catch {
      show('Not a valid My Funds backup.')
    }
  }

  async function onExcel() {
    if (!transactions || !instruments) return
    const map = new Map<string, Instrument>(instruments.map((i) => [i.id, i]))
    try {
      await exportExcel(summary.holdings, transactions, map)
    } catch {
      show('Could not export to Excel.')
    }
  }

  async function onRemovePin() {
    await setSetting('pinHash', null)
    show('App lock removed.')
  }

  async function onThemeChange(mode: ThemeMode) {
    await setSetting('theme', mode)
    applyTheme(mode)
  }

  async function onClearAll() {
    if (!window.confirm('Delete all instruments, transactions, SIPs and settings? This cannot be undone.')) {
      return
    }
    await wipeAllData()
    show('All data cleared.')
  }

  const themeValue: ThemeMode = theme ?? 'system'
  const hasPin = !!pinHash

  return (
    <>
      <AppBar title="Settings" subtitle="Backup, security & appearance" />

      <div className="screen">
        <div className="section">
          <div className="section-title">Data</div>
          <div className="list">
            <button className="setting" type="button" onClick={onBackup}>
              <span className="ic">
                <Download size={18} />
              </span>
              <span className="lbl">
                <div className="t">Backup</div>
                <div className="d">Export your data as JSON</div>
              </span>
            </button>

            <button className="setting" type="button" onClick={onRestoreClick}>
              <span className="ic">
                <Upload size={18} />
              </span>
              <span className="lbl">
                <div className="t">Restore</div>
                <div className="d">Import a backup file</div>
              </span>
            </button>

            <button className="setting" type="button" onClick={onExcel}>
              <span className="ic">
                <FileSpreadsheet size={18} />
              </span>
              <span className="lbl">
                <div className="t">Export to Excel</div>
                <div className="d">Holdings &amp; transactions (.xlsx)</div>
              </span>
            </button>
          </div>
        </div>

        <div className="section">
          <div className="section-title">Security</div>
          <div className="list">
            {!hasPin ? (
              <button className="setting" type="button" onClick={() => setPinOpen(true)}>
                <span className="ic">
                  <Lock size={18} />
                </span>
                <span className="lbl">
                  <div className="t">Set PIN</div>
                  <div className="d">Lock the app with a 4-digit PIN</div>
                </span>
              </button>
            ) : (
              <>
                <button className="setting" type="button" onClick={() => setPinOpen(true)}>
                  <span className="ic">
                    <KeyRound size={18} />
                  </span>
                  <span className="lbl">
                    <div className="t">Change PIN</div>
                    <div className="d">Set a new 4-digit PIN</div>
                  </span>
                </button>

                <button className="setting" type="button" onClick={onRemovePin}>
                  <span className="ic">
                    <ShieldOff size={18} />
                  </span>
                  <span className="lbl">
                    <div className="t">Remove PIN</div>
                    <div className="d">Turn off the app lock</div>
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="section">
          <div className="section-title">Appearance</div>
          <div className="setting">
            <span className="ic">
              <Palette size={18} />
            </span>
            <span className="lbl">
              <div className="t">Theme</div>
              <div style={{ marginTop: 10 }}>
                <SegmentedControl
                  options={THEME_OPTIONS}
                  value={themeValue}
                  onChange={onThemeChange}
                />
              </div>
            </span>
          </div>
        </div>

        <div className="section">
          <div className="section-title">Danger zone</div>
          <button className="setting" type="button" onClick={onClearAll}>
            <span className="ic" style={{ color: 'var(--neg)' }}>
              <Trash2 size={18} />
            </span>
            <span className="lbl">
              <div className="t" style={{ color: 'var(--neg)' }}>
                Clear all data
              </div>
              <div className="d">Permanently delete everything on this device</div>
            </span>
          </button>
        </div>

        <div className="section">
          <div className="section-title">About</div>
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: 16 }}>My Funds</div>
            <p className="help" style={{ marginTop: 8 }}>
              All your data stays on this device — there is no account and nothing is uploaded.
            </p>
            <p className="help" style={{ marginTop: 6 }}>
              Data: mfapi.in (NAV) and Yahoo Finance (stocks).
            </p>
          </div>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={onRestoreFile}
      />

      <PinSheet
        open={pinOpen}
        change={hasPin}
        onClose={() => setPinOpen(false)}
        onDone={() => {
          setPinOpen(false)
          show(hasPin ? 'PIN changed.' : 'App lock enabled.')
        }}
      />

      {node}
    </>
  )
}

function PinSheet({
  open,
  change,
  onClose,
  onDone,
}: {
  open: boolean
  change: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [first, setFirst] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function reset() {
    setStep('enter')
    setFirst('')
    setValue('')
    setError('')
  }

  function close() {
    reset()
    onClose()
  }

  function onChange(raw: string) {
    setValue(raw.replace(/\D/g, '').slice(0, 4))
    setError('')
  }

  async function onNext() {
    if (value.length !== 4) {
      setError('Enter a 4-digit PIN.')
      return
    }
    if (step === 'enter') {
      setFirst(value)
      setValue('')
      setStep('confirm')
      return
    }
    if (value !== first) {
      setError('PINs do not match. Try again.')
      setFirst('')
      setValue('')
      setStep('enter')
      return
    }
    await setSetting('pinHash', await hashPin(value))
    reset()
    onDone()
  }

  return (
    <Sheet open={open} onClose={close} title={change ? 'Change PIN' : 'Set PIN'}>
      <div className="field">
        <label>{step === 'enter' ? 'Enter a 4-digit PIN' : 'Confirm your PIN'}</label>
        <input
          className="input tnum"
          inputMode="numeric"
          maxLength={4}
          type="password"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••"
        />
        {error ? (
          <div className="help" style={{ color: 'var(--neg)' }}>
            {error}
          </div>
        ) : (
          <div className="help">This PIN locks the app on this device.</div>
        )}
      </div>

      <div className="btn-row">
        <button className="btn ghost" type="button" onClick={close}>
          Cancel
        </button>
        <button className="btn primary" type="button" onClick={onNext} disabled={value.length !== 4}>
          {step === 'enter' ? 'Next' : 'Save'}
        </button>
      </div>
    </Sheet>
  )
}
