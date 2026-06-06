import { useId } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import dayjs from 'dayjs'
import { Spinner } from './ui'
import { formatINR } from '../lib/format'

const UP = '#16c784'
const DOWN = '#f0616d'

interface Point {
  t: number
  close: number
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as Point
  return (
    <div
      style={{
        background: 'var(--elevated)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '7px 10px',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums' }}>{formatINR(p.close)}</div>
      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-dim)', marginTop: 2 }}>
        {dayjs(p.t).format('D MMM YYYY')}
      </div>
    </div>
  )
}

export function PriceChart({
  points,
  loading = false,
  height = 220,
}: {
  points: Point[]
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
        No chart data available
      </div>
    )
  }
  const first = points[0].close
  const last = points[points.length - 1].close
  const color = last >= first ? UP : DOWN
  const lows = points.map((p) => p.close)
  const min = Math.min(...lows)
  const max = Math.max(...lows)
  const pad = (max - min) * 0.08 || max * 0.02 || 1

  return (
    <div className="chart-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id={`grad${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[min - pad, max + pad]} />
          <XAxis dataKey="t" hide />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad${id})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
