import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ClipboardCopy,
  FileSpreadsheet,
  KeyRound,
  Lock,
  Palette,
  Pencil,
  ScanFace,
  Share2,
  ShieldOff,
  Trash2,
  User,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { db, getSetting, setSetting } from '../db'
import { usePortfolio } from '../hooks/usePortfolio'
import { useActiveProfile, useProfiles } from '../hooks/useProfiles'
import { createProfile, deleteProfile, renameProfile } from '../db/repo'
import { AppBar, SegmentedControl, Spinner, useToast } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { hashPin } from '../lib/pin'
import { enrollBiometric, isBiometricSupported } from '../lib/biometric'
import { applyTheme, type ThemeMode } from '../lib/theme'
import { wipeAllData } from '../lib/backup'
import { shareBackup, importFromCode, ShareNotFoundError, type ShareResult } from '../lib/share'
import { exportExcel } from '../lib/excel'
import type { Instrument, Profile, Transaction } from '../domain/types'

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function SettingsScreen() {
  const { show, node } = useToast()
  const [pinOpen, setPinOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [addProfileOpen, setAddProfileOpen] = useState(false)
  const [renaming, setRenaming] = useState<Profile | null>(null)

  const { summary } = usePortfolio()
  const profiles = useProfiles()
  const { activeId, setActive } = useActiveProfile()
  // Excel export uses the active profile's holdings (summary) — scope its transactions to match.
  const transactions = useLiveQuery(
    () =>
      activeId === undefined
        ? Promise.resolve<Transaction[]>([])
        : db.transactions.where('profileId').equals(activeId).toArray(),
    [activeId],
  )
  const instruments = useLiveQuery(() => db.instruments.toArray())
  const pinHash = useLiveQuery(() => getSetting<string | null>('pinHash', null))
  const biometricCredId = useLiveQuery(() => getSetting<string | null>('biometricCredId', null))
  const theme = useLiveQuery(() => getSetting<ThemeMode>('theme', 'system'))
  const [bioSupported, setBioSupported] = useState(false)
  const [bioBusy, setBioBusy] = useState(false)

  useEffect(() => {
    void isBiometricSupported().then(setBioSupported)
  }, [])

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
    // The biometric credential is only ever a PIN alternative, so removing the PIN also
    // disables Face ID — otherwise the fallback would be gone.
    await setSetting('biometricCredId', null)
    show('App lock removed.')
  }

  async function onEnableBio() {
    setBioBusy(true)
    try {
      const id = await enrollBiometric()
      await setSetting('biometricCredId', id)
      show('Face ID enabled.')
    } catch {
      show('Could not enable Face ID. Please try again.')
    } finally {
      setBioBusy(false)
    }
  }

  async function onDisableBio() {
    await setSetting('biometricCredId', null)
    show('Face ID disabled.')
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

  async function onDeleteProfile(p: Profile) {
    if (profiles.length <= 1) return
    if (
      !window.confirm(
        `Delete "${p.name}" and all of its holdings and transactions? This cannot be undone.`,
      )
    ) {
      return
    }
    // If deleting the active profile, switch to another one first so nothing points at a
    // deleted id while the delete runs.
    if (p.id === activeId) {
      const other = profiles.find((x) => x.id !== p.id)
      if (other) await setActive(other.id)
    }
    await deleteProfile(p.id)
    show('Profile deleted.')
  }

  const themeValue: ThemeMode = theme ?? 'system'
  const hasPin = !!pinHash
  const hasBio = !!biometricCredId

  return (
    <>
      <AppBar title="Settings" subtitle="Backup, security & appearance" back />

      <div className="screen">
        <div className="section">
          <div className="section-title">Profiles</div>
          <div className="list">
            {profiles.map((p) => (
              <ProfileRow
                key={p.id}
                profile={p}
                active={p.id === activeId}
                canDelete={profiles.length > 1}
                onSwitch={() => void setActive(p.id)}
                onRename={() => setRenaming(p)}
                onDelete={() => void onDeleteProfile(p)}
              />
            ))}

            {profiles.length < 2 && (
              <button className="setting" type="button" onClick={() => setAddProfileOpen(true)}>
                <span className="ic">
                  <UserPlus size={18} />
                </span>
                <span className="lbl">
                  <div className="t">Add profile</div>
                  <div className="d">Track a separate portfolio on this device</div>
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="section">
          <div className="section-title">Data</div>
          <div className="list">
            <button className="setting" type="button" onClick={() => setShareOpen(true)}>
              <span className="ic">
                <Share2 size={18} />
              </span>
              <span className="lbl">
                <div className="t">Share via key</div>
                <div className="d">Get a key to copy this profile to another device</div>
              </span>
            </button>

            <button className="setting" type="button" onClick={() => setImportOpen(true)}>
              <span className="ic">
                <KeyRound size={18} />
              </span>
              <span className="lbl">
                <div className="t">Import from key</div>
                <div className="d">Replace this profile's data using a key</div>
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

                {bioSupported ? (
                  !hasBio ? (
                    <button className="setting" type="button" onClick={onEnableBio} disabled={bioBusy}>
                      <span className="ic">
                        <ScanFace size={18} />
                      </span>
                      <span className="lbl">
                        <div className="t">Enable Face ID</div>
                        <div className="d">Unlock with Face ID instead of typing your PIN</div>
                      </span>
                    </button>
                  ) : (
                    <button className="setting" type="button" onClick={onDisableBio}>
                      <span className="ic">
                        <ScanFace size={18} />
                      </span>
                      <span className="lbl">
                        <div className="t">Disable Face ID</div>
                        <div className="d">Use only your PIN to unlock</div>
                      </span>
                    </button>
                  )
                ) : null}

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
            <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)' }}>B Funds</div>
            <p className="help" style={{ marginTop: 8 }}>
              Your data lives on this device. When you create a share key, a copy of the current
              profile is uploaded to our server in plain text so another device can import it. Keys
              stay valid for 30 days and can be reused — share them only with people you trust.
            </p>
            <p className="help" style={{ marginTop: 6 }}>
              Data: mfapi.in (NAV) and Yahoo Finance (stocks).
            </p>
          </div>
        </div>
      </div>

      <PinSheet
        open={pinOpen}
        change={hasPin}
        onClose={() => setPinOpen(false)}
        onDone={() => {
          setPinOpen(false)
          show(hasPin ? 'PIN changed.' : 'App lock enabled.')
        }}
      />

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} show={show} />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} show={show} />

      <AddProfileSheet
        open={addProfileOpen}
        onClose={() => setAddProfileOpen(false)}
        onAdded={() => show('Profile created.')}
      />
      <RenameProfileSheet
        profile={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={() => show('Profile renamed.')}
      />

      {node}
    </>
  )
}

// A profile row: tap (or Enter/Space) to make it active, with trailing rename/delete actions.
// Rendered as a div role="button" so the action buttons can nest legally inside it.
function ProfileRow({
  profile,
  active,
  canDelete,
  onSwitch,
  onRename,
  onDelete,
}: {
  profile: Profile
  active: boolean
  canDelete: boolean
  onSwitch: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="setting"
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onSwitch}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSwitch()
        }
      }}
    >
      <span className="ic" style={active ? { color: 'var(--accent)' } : undefined}>
        {active ? <UserCheck size={18} /> : <User size={18} />}
      </span>
      <span className="lbl">
        <div className="t">{profile.name}</div>
        <div className="d">{active ? 'Active profile' : 'Tap to switch'}</div>
      </span>
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label={`Rename ${profile.name}`} onClick={onRename}>
          <Pencil size={16} />
        </button>
        {canDelete && (
          <button
            type="button"
            aria-label={`Delete ${profile.name}`}
            style={{ color: 'var(--neg)' }}
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        )}
      </span>
    </div>
  )
}

function AddProfileSheet({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  function close() {
    setName('')
    setBusy(false)
    onClose()
  }

  async function onSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    const id = await createProfile(trimmed)
    onAdded(id)
    close()
  }

  return (
    <Sheet open={open} onClose={close} title="Add profile">
      <div className="field">
        <label>Profile name</label>
        <input
          className="input"
          type="text"
          autoFocus
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Family"
        />
        <div className="help">Each profile keeps its own holdings and transactions.</div>
      </div>
      <div className="btn-row">
        <button className="btn ghost" type="button" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" type="button" onClick={onSave} disabled={busy || !name.trim()}>
          {busy ? <Spinner /> : 'Create'}
        </button>
      </div>
    </Sheet>
  )
}

function RenameProfileSheet({
  profile,
  onClose,
  onRenamed,
}: {
  profile: Profile | null
  onClose: () => void
  onRenamed: () => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  // Re-seed the input whenever a different profile is opened for rename.
  useEffect(() => {
    if (profile) setName(profile.name)
  }, [profile])

  function close() {
    setBusy(false)
    onClose()
  }

  async function onSave() {
    const trimmed = name.trim()
    if (!trimmed || !profile) return
    setBusy(true)
    await renameProfile(profile.id, trimmed)
    onRenamed()
    close()
  }

  return (
    <Sheet open={!!profile} onClose={close} title="Rename profile">
      <div className="field">
        <label>Profile name</label>
        <input
          className="input"
          type="text"
          autoFocus
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Profile name"
        />
      </div>
      <div className="btn-row">
        <button className="btn ghost" type="button" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" type="button" onClick={onSave} disabled={busy || !name.trim()}>
          {busy ? <Spinner /> : 'Save'}
        </button>
      </div>
    </Sheet>
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

function ShareSheet({
  open,
  onClose,
  show,
}: {
  open: boolean
  onClose: () => void
  show: (m: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ShareResult | null>(null)
  const [error, setError] = useState('')

  // Generate a fresh key each time the sheet opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setResult(null)
    setError('')
    setLoading(true)
    void (async () => {
      try {
        const r = await shareBackup()
        if (!cancelled) setResult(r)
      } catch {
        if (!cancelled) setError('Could not create a share key. Check your connection and try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  async function onCopy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.code)
      show('Key copied.')
    } catch {
      show('Could not copy. Select the key and copy it manually.')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Share via key">
      {loading ? (
        <div className="center" style={{ padding: 24 }}>
          <Spinner />
        </div>
      ) : error ? (
        <div className="field">
          <div className="help" style={{ color: 'var(--neg)' }}>
            {error}
          </div>
          <div className="btn-row">
            <button className="btn ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : result ? (
        <>
          <div className="field">
            <label>Your key</label>
            <div
              className="input tnum"
              style={{ userSelect: 'all', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}
            >
              {result.code}
            </div>
            <div className="help">
              Enter this key on another device under "Import from key" to copy this profile there.
              It stays valid for 30 days and can be used more than once. Anyone with this key can
              read your data, so share it only with people you trust.
            </div>
          </div>
          <div className="btn-row">
            <button className="btn ghost" type="button" onClick={onClose}>
              Done
            </button>
            <button className="btn primary" type="button" onClick={onCopy}>
              <ClipboardCopy size={16} /> Copy key
            </button>
          </div>
        </>
      ) : null}
    </Sheet>
  )
}

function ImportSheet({
  open,
  onClose,
  show,
}: {
  open: boolean
  onClose: () => void
  show: (m: string) => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function close() {
    setCode('')
    setError('')
    setBusy(false)
    onClose()
  }

  async function onImport() {
    if (!code.trim()) {
      setError('Enter a key.')
      return
    }
    if (
      !window.confirm(
        'This will ERASE the data in your current profile and replace it with the shared data. This cannot be undone. Continue?',
      )
    ) {
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await importFromCode(code)
      show(`Imported ${r.instruments} instruments, ${r.transactions} transactions, ${r.sips} SIPs.`)
      // Full reload so the app re-bootstraps cleanly: re-hydrate prices, re-run due SIPs,
      // and refresh quotes for exactly the imported instruments.
      setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      setBusy(false)
      if (e instanceof ShareNotFoundError) {
        setError('That key was not found. It may have expired.')
      } else {
        setError('Could not import. Check your connection and the key, then try again.')
      }
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Import from key">
      <div className="field">
        <label>Enter the key</label>
        <input
          className="input"
          type="text"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setError('')
          }}
          placeholder="Paste your key"
        />
        {error ? (
          <div className="help" style={{ color: 'var(--neg)' }}>
            {error}
          </div>
        ) : (
          <div className="help">This replaces the data in your current profile with the shared data.</div>
        )}
      </div>

      <div className="btn-row">
        <button className="btn ghost" type="button" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn primary"
          type="button"
          onClick={onImport}
          disabled={busy || !code.trim()}
        >
          {busy ? <Spinner /> : 'Import'}
        </button>
      </div>
    </Sheet>
  )
}
