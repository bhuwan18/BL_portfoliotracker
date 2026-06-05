import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { GripVertical } from 'lucide-react'
import type { Holding } from '../domain/types'
import type { ReturnMode } from '../hooks/useReturnMode'
import { HoldingRow } from './HoldingRow'

// Drag-to-reorder holdings list. Hand-rolled on Pointer Events so it works for touch,
// mouse and pen alike (no library). A grip handle owns the gesture so tapping the card
// still navigates. Reorder math uses each row's measured rect, so variable-height rows
// (wrapping names, "No price") shift exactly. Arrow keys on a focused handle move a row
// for keyboard users.
export function SortableHoldings({
  holdings,
  onReorder,
  onOpen,
  mode,
  onToggleMode,
}: {
  holdings: Holding[]
  onReorder: (orderedIds: string[]) => void
  onOpen: (id: string) => void
  mode: ReturnMode
  onToggleMode: () => void
}) {
  const [items, setItems] = useState<Holding[]>(holdings)
  const draggingRef = useRef(false)
  // Adopt prop changes (price refresh, added/removed holdings) except mid-drag, where
  // local state is the source of truth until the gesture commits.
  useEffect(() => {
    if (!draggingRef.current) setItems(holdings)
  }, [holdings])

  const nodeRefs = useRef(new Map<string, HTMLDivElement>())
  const [dragId, setDragId] = useState<string | null>(null)
  const [offsets, setOffsets] = useState<Map<string, number>>(new Map())

  // Live drag session, kept in a ref so move/up handlers never read stale state.
  const session = useRef<{
    id: string
    startY: number
    base: { id: string; top: number; height: number }[]
    gap: number
    order: string[]
    result: string[]
  } | null>(null)

  const commit = (next: Holding[], ids: string[]) => {
    setItems(next)
    onReorder(ids)
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return // primary button / touch / pen only
    const ids = items.map((h) => h.instrument.id)
    const base = ids.map((i) => {
      const r = nodeRefs.current.get(i)!.getBoundingClientRect()
      return { id: i, top: r.top, height: r.height }
    })
    const gap = base.length > 1 ? base[1].top - (base[0].top + base[0].height) : 0
    session.current = { id, startY: e.clientY, base, gap, order: ids, result: ids }
    draggingRef.current = true
    setDragId(id)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
    e.stopPropagation()
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = session.current
    if (!s) return
    const dy = e.clientY - s.startY
    const dragged = s.base.find((b) => b.id === s.id)!
    const draggedCenter = dragged.top + dragged.height / 2 + dy

    // Rows are in display order, so once a midpoint sits below the dragged center,
    // every later one does too — the count of those above is the insertion index.
    let toIndex = 0
    for (const b of s.base) {
      if (b.id === s.id) continue
      if (b.top + b.height / 2 < draggedCenter) toIndex++
      else break
    }

    const without = s.order.filter((i) => i !== s.id)
    const newOrder = [...without.slice(0, toIndex), s.id, ...without.slice(toIndex)]
    s.result = newOrder

    // Translate each row from its old slot to its new slot; the dragged row follows
    // the finger directly (dy). Recompute slot tops from measured heights + gap.
    const heightById = new Map(s.base.map((b) => [b.id, b.height]))
    const topById = new Map(s.base.map((b) => [b.id, b.top]))
    const newTop = new Map<string, number>()
    let acc = s.base[0].top
    for (const i of newOrder) {
      newTop.set(i, acc)
      acc += heightById.get(i)! + s.gap
    }
    const next = new Map<string, number>()
    for (const b of s.base) {
      next.set(b.id, b.id === s.id ? dy : newTop.get(b.id)! - topById.get(b.id)!)
    }
    setOffsets(next)
  }

  const handlePointerUp = () => {
    const s = session.current
    if (!s) return
    session.current = null
    draggingRef.current = false
    setDragId(null)
    setOffsets(new Map())
    if (s.result.join('|') !== s.order.join('|')) {
      const byId = new Map(items.map((h) => [h.instrument.id, h]))
      commit(
        s.result.map((i) => byId.get(i)!),
        s.result,
      )
    }
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, id: string) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const ids = items.map((h) => h.instrument.id)
    const i = ids.indexOf(id)
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1
    if (j < 0 || j >= ids.length) return
    const next = [...ids]
    ;[next[i], next[j]] = [next[j], next[i]]
    const byId = new Map(items.map((h) => [h.instrument.id, h]))
    commit(
      next.map((x) => byId.get(x)!),
      next,
    )
  }

  return (
    <div className="list">
      {items.map((h) => {
        const id = h.instrument.id
        const dy = offsets.get(id) ?? 0
        const isDragged = dragId === id
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) nodeRefs.current.set(id, el)
              else nodeRefs.current.delete(id)
            }}
            className={`sortable-item${isDragged ? ' dragging' : ''}`}
            style={{
              transform: dy ? `translateY(${dy}px)` : undefined,
              transition: isDragged ? 'none' : 'transform 160ms ease',
              zIndex: isDragged ? 2 : undefined,
            }}
          >
            <button
              type="button"
              className="drag-handle"
              aria-label={`Reorder ${h.instrument.name}. Use arrow up and down keys to move.`}
              onPointerDown={(e) => handlePointerDown(e, id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={(e) => handleKeyDown(e, id)}
            >
              <GripVertical size={18} aria-hidden="true" />
            </button>
            <div className="sortable-body">
              <HoldingRow
                holding={h}
                mode={mode}
                onToggleMode={onToggleMode}
                onClick={() => onOpen(id)}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
