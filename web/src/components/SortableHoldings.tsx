import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { GripVertical, Trash2 } from 'lucide-react'
import type { Holding } from '../domain/types'
import type { ReturnMode } from '../hooks/useReturnMode'
import { HoldingRow } from './HoldingRow'

// Long-press duration (ms) before a press on a row enters edit mode, and the movement
// (px) that cancels it as a scroll/tap instead.
const LONG_PRESS_MS = 450
const LONG_PRESS_SLOP = 10

// Swipe-to-reveal (edit mode): px of horizontal travel before the gesture locks to the
// swipe axis, the width of the revealed Delete action, and how far you must drag before
// release snaps it open.
const SWIPE_SLOP = 8
const SWIPE_REVEAL = 88
const SWIPE_TRIGGER = 52

// Drag-to-reorder holdings list. Hand-rolled on Pointer Events so it works for touch,
// mouse and pen alike (no library). Reordering is an occasional action, so the grip
// handles stay hidden until `editing` is on (toggled from the header, or by long-pressing
// a row, which calls onRequestEdit). In edit mode the grip owns the drag gesture and row
// taps are inert; otherwise a tap opens the holding. Reorder math uses each row's measured
// rect, so variable-height rows (wrapping names, "No price") shift exactly. Arrow keys on a
// focused handle move a row for keyboard users. In edit mode a horizontal swipe-left on
// a row reveals a Delete action (onDelete), which the parent confirms before deleting.
export function SortableHoldings({
  holdings,
  onReorder,
  onOpen,
  onDelete,
  mode,
  onToggleMode,
  editing,
  onRequestEdit,
}: {
  holdings: Holding[]
  onReorder: (orderedIds: string[]) => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  mode: ReturnMode
  onToggleMode: () => void
  editing: boolean
  onRequestEdit: () => void
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

  // Row currently revealing its Delete action, plus the live X-offset of the row being
  // swiped right now (only one at a time). Both reset whenever edit mode turns off.
  const [openId, setOpenId] = useState<string | null>(null)
  const [swipeX, setSwipeX] = useState<{ id: string; x: number } | null>(null)
  useEffect(() => {
    if (!editing) {
      setOpenId(null)
      setSwipeX(null)
    }
  }, [editing])

  // Long-press on a row (outside edit mode) enters edit mode. We then swallow the click
  // that the same press would otherwise fire so it doesn't navigate into the holding.
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null)
  const suppressOpen = useRef(false)
  const cancelLongPress = () => {
    if (longPress.current) {
      clearTimeout(longPress.current.timer)
      longPress.current = null
    }
  }

  // Active horizontal swipe (edit mode). `axis` stays 'none' until movement passes the
  // slop, then locks to 'x' (we own it) or 'y' (let the page scroll). `start` is the
  // offset the row began at, so a swipe continues smoothly from an already-open row.
  const swipe = useRef<{
    id: string
    startX: number
    startY: number
    axis: 'none' | 'x' | 'y'
    pointerId: number
    start: number
  } | null>(null)

  const handleBodyPointerDown = (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (!editing) {
      // Outside edit mode: arm the long-press-to-edit timer.
      suppressOpen.current = false // clear any stale suppression from a prior press
      const x = e.clientX
      const y = e.clientY
      longPress.current = {
        x,
        y,
        timer: window.setTimeout(() => {
          suppressOpen.current = true
          longPress.current = null
          onRequestEdit()
        }, LONG_PRESS_MS),
      }
      return
    }
    // Edit mode: begin a potential swipe. Close any other open row first.
    if (openId && openId !== id) setOpenId(null)
    swipe.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      axis: 'none',
      pointerId: e.pointerId,
      start: openId === id ? -SWIPE_REVEAL : 0,
    }
  }

  const handleBodyPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing) {
      const lp = longPress.current
      if (!lp) return
      if (Math.abs(e.clientX - lp.x) > LONG_PRESS_SLOP || Math.abs(e.clientY - lp.y) > LONG_PRESS_SLOP) {
        cancelLongPress()
      }
      return
    }
    const s = swipe.current
    if (!s) return
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    if (s.axis === 'none') {
      if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (s.axis === 'y') {
        swipe.current = null // vertical intent — release to the page scroller
        return
      }
      e.currentTarget.setPointerCapture(s.pointerId)
    }
    if (s.axis !== 'x') return
    // Clamp: never past closed (0); a little rubber-band past the reveal width.
    const x = Math.max(-SWIPE_REVEAL - 20, Math.min(0, s.start + dx))
    setSwipeX({ id: s.id, x })
    e.preventDefault()
  }

  const handleBodyPointerUp = (id: string) => {
    if (!editing) {
      cancelLongPress()
      return
    }
    const s = swipe.current
    swipe.current = null
    const current = swipeX && swipeX.id === id ? swipeX.x : s?.start ?? 0
    setSwipeX(null)
    if (!s || s.axis !== 'x') {
      // A tap (not a swipe) on an open row closes it; otherwise leave state as-is.
      if (s && openId === id) setOpenId(null)
      return
    }
    setOpenId(current <= -SWIPE_TRIGGER ? id : null)
  }

  const handleDeleteClick = (id: string) => {
    setOpenId(null)
    setSwipeX(null)
    onDelete(id)
  }

  const handleOpen = (id: string) => {
    if (suppressOpen.current) {
      suppressOpen.current = false
      return
    }
    if (editing) return
    onOpen(id)
  }

  return (
    <div className="list holdings-list">
      {items.map((h) => {
        const id = h.instrument.id
        const dy = offsets.get(id) ?? 0
        const isDragged = dragId === id
        const swiping = swipeX?.id === id
        const tx = swiping ? swipeX.x : openId === id ? -SWIPE_REVEAL : 0
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) nodeRefs.current.set(id, el)
              else nodeRefs.current.delete(id)
            }}
            className={`sortable-item${isDragged ? ' dragging' : ''}${editing ? ' editing' : ''}`}
            style={{
              transform: dy ? `translateY(${dy}px)` : undefined,
              transition: isDragged ? 'none' : 'transform 160ms ease',
              zIndex: isDragged ? 2 : undefined,
            }}
          >
            {editing && (
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
            )}
            <div className="swipe-wrap">
              <div
                className="sortable-body"
                style={{
                  transform: tx ? `translateX(${tx}px)` : undefined,
                  transition: swiping ? 'none' : 'transform 200ms ease',
                }}
                onPointerDown={(e) => handleBodyPointerDown(e, id)}
                onPointerMove={handleBodyPointerMove}
                onPointerUp={() => handleBodyPointerUp(id)}
                onPointerCancel={() => handleBodyPointerUp(id)}
                onPointerLeave={() => !editing && cancelLongPress()}
              >
                <HoldingRow
                  holding={h}
                  mode={mode}
                  onToggleMode={onToggleMode}
                  onClick={() => handleOpen(id)}
                />
              </div>
              {editing && (
                <button
                  type="button"
                  className="swipe-delete"
                  aria-label={`Delete ${h.instrument.name}`}
                  onFocus={() => setOpenId(id)}
                  onClick={() => handleDeleteClick(id)}
                >
                  <Trash2 size={18} aria-hidden="true" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
