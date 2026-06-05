import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Sheet({
  open,
  onClose,
  title,
  children,
  bodyClassName,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  bodyClassName?: string
}) {
  // Track the visual viewport so the sheet floats above the on-screen keyboard.
  // iOS shrinks the *visual* viewport when the keyboard opens but leaves the
  // *layout* viewport (what `position: fixed` uses) full-height — so a
  // bottom-anchored sheet ends up rendered behind the keyboard. Sizing the
  // scrim to the visual viewport keeps the sheet (and its focused input)
  // visible just above the keyboard.
  const [vv, setVv] = useState<{ top: number; height: number } | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    // Remember what had focus so we can restore it when the sheet closes
    // (keeps keyboard/screen-reader users anchored to the triggering control).
    const prevFocus = document.activeElement as HTMLElement | null

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'

    // Move focus into the dialog itself (not the first input) so the modal
    // captures screen-reader focus without popping the keyboard on open.
    sheetRef.current?.focus()

    const viewport = window.visualViewport
    const sync = () => {
      if (viewport) setVv({ top: viewport.offsetTop, height: viewport.height })
    }
    sync()
    viewport?.addEventListener('resize', sync)
    viewport?.addEventListener('scroll', sync)

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      viewport?.removeEventListener('resize', sync)
      viewport?.removeEventListener('scroll', sync)
      prevFocus?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  // Keep Tab focus cycling within the sheet while it's open (focus trap).
  const onTrapKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const root = sheetRef.current
    if (!root) return
    const items = root.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey) {
      if (active === first || active === root) {
        e.preventDefault()
        last.focus()
      }
    } else if (active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Pin the scrim to the visible region (above the keyboard). Falls back to the
  // full-viewport `inset: 0` from CSS when the API is unavailable (e.g. desktop).
  const scrimStyle: CSSProperties | undefined = vv
    ? { top: vv.top, height: vv.height, bottom: 'auto' }
    : undefined

  return (
    <div className="scrim" style={scrimStyle} onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        tabIndex={-1}
        onKeyDown={onTrapKey}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grabber" />
        {title !== undefined && (
          <div className="sheet-head">
            <h3 id={titleId}>{title}</h3>
            <button className="icon-btn" type="button" aria-label="Close" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        )}
        <div className={bodyClassName ? `sheet-body ${bodyClassName}` : 'sheet-body'}>{children}</div>
      </div>
    </div>
  )
}
