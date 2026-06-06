import { useEffect, useRef, useState } from 'react'
import { Delete, Lock as LockIcon, ScanFace } from 'lucide-react'
import { verifyPin } from '../lib/pin'
import { isBiometricSupported, verifyBiometric } from '../lib/biometric'

// 4-digit PIN gate. The hash is compared locally — all data already lives on-device.
// When a biometric credential is enrolled, Face ID / Touch ID is offered as an alternative
// unlock (auto-attempted on mount + via a button); the PIN keypad is always the fallback.
export function LockScreen({
  pinHash,
  biometricCredId,
  onUnlock,
}: {
  pinHash: string
  biometricCredId: string | null
  onUnlock: () => void
}) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioBusy, setBioBusy] = useState(false)
  const triedAuto = useRef(false)

  async function runBiometric() {
    if (!biometricCredId || bioBusy) return
    setBioBusy(true)
    const ok = await verifyBiometric(biometricCredId)
    setBioBusy(false)
    if (ok) onUnlock()
    // On failure/cancel the keypad remains usable — no error state needed.
  }

  useEffect(() => {
    let active = true
    if (!biometricCredId) {
      setBioAvailable(false)
      return
    }
    void isBiometricSupported().then((supported) => {
      if (!active) return
      setBioAvailable(supported)
      // Best-effort auto-prompt once. iOS may reject get() without a user gesture, in which
      // case verifyBiometric resolves false and the user taps the button instead.
      if (supported && !triedAuto.current) {
        triedAuto.current = true
        void runBiometric()
      }
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricCredId])

  async function input(d: string) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setErr(false)
    if (next.length === 4) {
      const ok = await verifyPin(next, pinHash)
      if (ok) {
        onUnlock()
      } else {
        setErr(true)
        setTimeout(() => {
          setPin('')
          setErr(false)
        }, 500)
      }
    }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']

  return (
    <div className="lock">
      <div className="brand">
        <LockIcon size={30} />
      </div>
      <h2>Enter PIN</h2>
      <div className="hint">Unlock My Funds</div>
      <div className={`pin-dots ${err ? 'err' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`d ${i < pin.length ? 'f' : ''}`} />
        ))}
      </div>
      <div className="keypad">
        {keys.map((k, i) =>
          k === '' ? (
            <button key={i} className="flat" type="button" disabled />
          ) : k === 'back' ? (
            <button key={i} className="flat" type="button" aria-label="Delete" onClick={() => setPin((p) => p.slice(0, -1))}>
              <Delete size={24} />
            </button>
          ) : (
            <button key={i} type="button" onClick={() => input(k)}>
              {k}
            </button>
          ),
        )}
      </div>
      {biometricCredId && bioAvailable ? (
        <button className="btn ghost bio-unlock" type="button" onClick={runBiometric} disabled={bioBusy}>
          <ScanFace size={18} />
          Unlock with Face ID
        </button>
      ) : null}
    </div>
  )
}
