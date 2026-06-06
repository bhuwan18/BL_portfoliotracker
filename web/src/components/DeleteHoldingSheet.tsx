import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Sheet } from './Sheet'
import { Spinner, useToast } from './ui'
import { deleteHolding } from '../db/repo'
import { useActiveProfile } from '../hooks/useProfiles'
import type { Holding } from '../domain/types'

// Confirmation sheet for deleting a whole holding from the dashboard (swipe-left action).
// Open when `holding` is non-null. Deletion wipes every transaction + SIP for the
// instrument, so we spell that out and require an explicit confirm tap.
export function DeleteHoldingSheet({
  holding,
  onClose,
}: {
  holding: Holding | null
  onClose: () => void
}) {
  const { show, node } = useToast()
  const { activeId } = useActiveProfile()
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (holding) setDeleting(false)
  }, [holding])

  async function handleDelete() {
    if (!holding || deleting || activeId === undefined) return
    setDeleting(true)
    try {
      await deleteHolding(holding.instrument.id, activeId)
      onClose()
    } catch {
      show('Could not delete holding')
      setDeleting(false)
    }
  }

  return (
    <>
      <Sheet open={!!holding} onClose={() => !deleting && onClose()} title="Delete holding">
        <div className="sheet-danger" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          <div className="danger-prompt">
            Delete <strong>{holding?.instrument.name}</strong>? This removes the holding and all of
            its transactions{holding?.instrument.type === 'mf' ? ' and SIPs' : ''}. This can&apos;t
            be undone.
          </div>
          <div className="btn-row">
            <button type="button" className="btn ghost" disabled={deleting} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn danger" disabled={deleting} onClick={handleDelete}>
              {deleting ? <Spinner /> : <Trash2 size={18} />}
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Sheet>
      {node}
    </>
  )
}
