import type { InstrumentType } from '../domain/types'

const COLORS = [
  '#e2574c',
  '#e08e0b',
  '#0c9f6e',
  '#2f80ed',
  '#8b5cf6',
  '#d6336c',
  '#0ca6c4',
  '#c2410c',
  '#16a34a',
  '#7c3aed',
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/)
  if (!parts[0]) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function InstrumentAvatar({
  name,
  type,
  size = 42,
}: {
  name: string
  type: InstrumentType
  size?: number
}) {
  const color = COLORS[hash(name) % COLORS.length]
  return (
    <div
      className={`avatar ${type === 'mf' ? 'mf' : ''}`}
      style={{ background: color, width: size, height: size, fontSize: size * 0.33 }}
    >
      {initials(name)}
    </div>
  )
}
