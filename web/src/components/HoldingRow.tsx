import { ChevronRight } from 'lucide-react'
import type { Holding } from '../domain/types'
import type { ReturnMode } from '../hooks/useReturnMode'
import { formatNumber, formatPct, formatDateShort, sign } from '../lib/format'

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
  const unitLabel = h.instrument.type === 'mf' ? 'Units' : 'Qty'

  // Day's gain direction signal (non-colour cue): triangle for up/down, none at zero.
  // Gate the triangle on the *rounded* figure so a sub-rupee move that displays as "0"
  // doesn't show a contradictory up/down arrow next to a zero.
  const dayRounded = Math.round(h.dayChange)
  const daySign = dayRounded > 0 ? 'pos' : dayRounded < 0 ? 'neg' : 'zero'
  const dayTriangle = daySign === 'pos' ? '▲ ' : daySign === 'neg' ? '▼ ' : ''
  const perUnitChange = h.price - h.prevClose

  // priceAsOf is optional even when priced — omit the date token if absent.
  const asOnDate = h.priceAsOf != null ? `${formatDateShort(h.priceAsOf)} ` : ''

  return (
    <div
      className="row tap holding-card"
      role="link"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      style={{ width: '100%', textAlign: 'left' }}
    >
      <div className="holding-main">
        {/* Line 1: name (left, wraps to 2 lines) + P&L badge / no-price (right) */}
        <div className="holding-line holding-line-1">
          <div className="holding-name">{h.instrument.name}</div>
          {h.hasPrice ? (
            <button
              type="button"
              className={`gain-badge ${sign(h.pnl)} holding-toggle`}
              aria-label="Toggle return view"
              onClick={(e) => {
                e.stopPropagation()
                onToggleMode?.()
              }}
            >
              {mode === 'absolute'
                ? formatNumber(h.pnl, 0)
                : h.xirr != null
                  ? formatPct(h.xirr)
                  : '—'}
            </button>
          ) : (
            <span className="holding-noprice">No price</span>
          )}
        </div>

        {h.hasPrice && (
          <>
            {/* Line 2: per-unit day's gain (left) + total day change w/ triangle (right) */}
            <div className="holding-line">
              <div className="holding-detail">
                Day&apos;s gain {formatNumber(perUnitChange, 4)} ({formatPct(h.dayChangePct)})
              </div>
              <div className={`holding-fig ${daySign}`}>
                {dayTriangle}
                {formatNumber(h.dayChange, 0)}
              </div>
            </div>

            {/* Line 3: as-on date @ price (left) + current value (right) */}
            <div className="holding-line">
              <div className="holding-detail">
                As on {asOnDate}@ {formatNumber(h.price, 3)}
              </div>
              <div className="holding-fig">{formatNumber(h.currentValue, 0)}</div>
            </div>
          </>
        )}

        {/* Line 4: units/qty @ avg cost (left) + invested value (right) — always shown */}
        <div className="holding-line">
          <div className="holding-detail">
            {unitLabel} {formatNumber(h.units, 4)} @ {formatNumber(h.avgCost, 4)}
          </div>
          <div className="holding-fig">{formatNumber(h.investedValue, 0)}</div>
        </div>
      </div>

      <ChevronRight className="holding-chevron" size={18} aria-hidden="true" />
    </div>
  )
}
