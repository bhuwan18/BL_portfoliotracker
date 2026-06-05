import type { Holding } from '../domain/types'
import { InstrumentAvatar } from './InstrumentAvatar'
import { formatINR, formatPct, formatUnits, sign } from '../lib/format'

export function HoldingRow({ holding, onClick }: { holding: Holding; onClick?: () => void }) {
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
        <div className={`s delta ${sign(h.pnl)}`}>
          {h.hasPrice ? formatPct(h.pnlPct) : 'No price'}
        </div>
      </div>
    </button>
  )
}
