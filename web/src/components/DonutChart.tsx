import type { ReactNode } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

export interface DonutSlice {
  name: string
  value: number
  color: string
}

export function DonutChart({
  data,
  size = 150,
  center,
}: {
  data: DonutSlice[]
  size?: number
  center?: ReactNode
}) {
  const slices = data.filter((d) => d.value > 0)
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={size * 0.33}
            outerRadius={size * 0.49}
            paddingAngle={slices.length > 1 ? 2 : 0}
            stroke="none"
            isAnimationActive={false}
          >
            {slices.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {center && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {center}
        </div>
      )}
    </div>
  )
}
