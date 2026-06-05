import type { Holding } from '../domain/types'
import type { ReturnMode } from '../hooks/useReturnMode'
import { InstrumentAvatar } from './InstrumentAvatar'
import { formatINR, formatPct, formatSignedINR, formatUnits, sign } from '../lib/format'

export function HoldingRow({
  holding,
  onClick,
  mode = 'xirr',
  onToggleMode,
}: {
  holding: Holding
  onClick?: () => void
  mode?: ReturnMode
  onToggleMode?: () => void
}) {
  const h = holding
  const unitLabel = h.instrument.type === 'mf' ? 'units' : 'qty'
  return (
    <button className="row tap" type="button" onClick={onClick} style={{ width: '100%', textAlign: 'left' }}>
      <InstrumentAvatar name={h.instrument.name} type={h.instrument.type} />
      <div className="main">
        <div className="title">{h.instrument.name}</div>
        <div className="subtitle">
          {formatUnits(h.units)} {unitLabel} · Avg {formatINR(h.avgCost)}
        </div>
      </div>
      <div className="end">
        <div className="v">{h.hasPrice ? formatINR(h.currentValue, 0) : '—'}</div>
        {h.hasPrice ? (
          <span
            className={`s pill ${sign(h.pnl)}`}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onToggleMode?.()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onToggleMode?.()
              }
            }}
          >
            {mode === 'absolute'
              ? formatSignedINR(h.pnl, 0)
              : h.xirr != null
                ? formatPct(h.xirr)
                : '—'}
          </span>
        ) : (
          <div className="s delta zero">No price</div>
        )}
      </div>
    </button>
  )
}
