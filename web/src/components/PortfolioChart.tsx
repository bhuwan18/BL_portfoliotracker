import { useId } from 'react'
import { Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import dayjs from 'dayjs'
import { Spinner } from './ui'
import { formatINR, formatPct } from '../lib/format'
import type { ValuePoint } from '../domain/portfolioHistory'

const UP = '#16c784'
const DOWN = '#f0616d'
const INVESTED = 'var(--text-dim)'

export type TrendView = 'value' | 'pct'

interface Row {
  t: number
  value: number
  invested: number
  pct: number
}

function ValueTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload as Row
  return (
    <div className="chart-tip">
      <div className="chart-tip-v tnum">{formatINR(r.value)}</div>
      <div className="chart-tip-sub tnum">Invested {formatINR(r.invested)}</div>
      <div className="chart-tip-date">{dayjs(r.t).format('D MMM YYYY')}</div>
    </div>
  )
}

function PctTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload as Row
  return (
    <div className="chart-tip">
      <div className="chart-tip-v tnum" style={{ color: r.pct >= 0 ? UP : DOWN }}>
        {formatPct(r.pct)}
      </div>
      <div className="chart-tip-date">{dayjs(r.t).format('D MMM YYYY')}</div>
    </div>
  )
}

export function PortfolioChart({
  points,
  view,
  loading = false,
  height = 160,
}: {
  points: ValuePoint[]
  view: TrendView
  loading?: boolean
  height?: number
}) {
  const id = useId().replace(/[:]/g, '')
  if (loading) {
    return (
      <div className="chart-wrap center" style={{ height }}>
        <Spinner />
      </div>
    )
  }
  if (!points || points.length < 2) {
    return (
      <div className="chart-wrap center faint" style={{ height, fontSize: 'var(--text-sm)' }}>
        Not enough history to chart yet
      </div>
    )
  }

  const rows: Row[] = points.map((p) => ({
    t: p.t,
    value: p.value,
    invested: p.invested,
    pct: p.invested > 0 ? (p.value / p.invested - 1) * 100 : 0,
  }))

  if (view === 'pct') {
    const first = rows[0].pct
    const last = rows[rows.length - 1].pct
    const color = last >= first ? UP : DOWN
    const vals = rows.map((r) => r.pct)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = (max - min) * 0.08 || Math.abs(max) * 0.1 || 1
    return (
      <div className="chart-wrap" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 6, right: 2, bottom: 0, left: 2 }}>
            <defs>
              <linearGradient id={`pgrad${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[min - pad, max + pad]} />
            <XAxis dataKey="t" hide />
            <Tooltip content={<PctTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="pct"
              stroke={color}
              strokeWidth={2}
              fill={`url(#pgrad${id})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // value view: market value area + invested cost-basis reference line.
  const first = rows[0].value
  const last = rows[rows.length - 1].value
  const color = last >= first ? UP : DOWN
  const vals = rows.flatMap((r) => [r.value, r.invested])
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const pad = (max - min) * 0.08 || max * 0.02 || 1
  return (
    <div className="chart-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 6, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id={`vgrad${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[min - pad, max + pad]} />
          <XAxis dataKey="t" hide />
          <Tooltip content={<ValueTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#vgrad${id})`}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="invested"
            stroke={INVESTED}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
