import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
}) {
  // Track the visual viewport so the sheet floats above the on-screen keyboard.
  // iOS shrinks the *visual* viewport when the keyboard opens but leaves the
  // *layout* viewport (what `position: fixed` uses) full-height — so a
  // bottom-anchored sheet ends up rendered behind the keyboard. Sizing the
  // scrim to the visual viewport keeps the sheet (and its focused input)
  // visible just above the keyboard.
  const [vv, setVv] = useState<{ top: number; height: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'

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
    }
  }, [open, onClose])

  if (!open) return null

  // Pin the scrim to the visible region (above the keyboard). Falls back to the
  // full-viewport `inset: 0` from CSS when the API is unavailable (e.g. desktop).
  const scrimStyle: CSSProperties | undefined = vv
    ? { top: vv.top, height: vv.height, bottom: 'auto' }
    : undefined

  return (
    <div className="scrim" style={scrimStyle} onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        {title !== undefined && (
          <div className="sheet-head">
            <h3>{title}</h3>
            <button className="icon-btn" type="button" aria-label="Close" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
