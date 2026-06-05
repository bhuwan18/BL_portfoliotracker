import { useState } from 'react'
import { Delete, Lock as LockIcon } from 'lucide-react'
import { verifyPin } from '../lib/pin'

// 4-digit PIN gate. The hash is compared locally — all data already lives on-device.
export function LockScreen({ pinHash, onUnlock }: { pinHash: string; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)

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
    </div>
  )
}
