import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatPct, formatSignedINR, sign } from '../lib/format'

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />
}

export function Loading({ label }: { label?: string }) {
  return (
    <div className="center" style={{ padding: 48, flexDirection: 'column', gap: 12 }}>
      <Spinner />
      {label && <div className="faint" style={{ fontSize: 13 }}>{label}</div>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode
  title: string
  message?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      {icon && <div className="ico">{icon}</div>}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  )
}

// Signed, colour-coded money change, with optional percent and arrow.
export function Delta({
  value,
  pct,
  decimals = 2,
  arrow = false,
  className = '',
}: {
  value: number
  pct?: number
  decimals?: number
  arrow?: boolean
  className?: string
}) {
  const s = sign(value)
  return (
    <span className={`delta ${s} ${className}`}>
      {arrow && s !== 'zero' && (s === 'pos' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />)}
      {formatSignedINR(value, decimals)}
      {pct !== undefined && <span> ({formatPct(pct)})</span>}
    </span>
  )
}

// Compact percent pill, coloured by sign.
export function Pill({ pct, value, className = '' }: { pct: number; value?: number; className?: string }) {
  const s = sign(pct)
  return (
    <span className={`pill ${s} ${className}`}>
      {value !== undefined ? `${formatSignedINR(value)} · ` : ''}
      {formatPct(pct)}
    </span>
  )
}

export function StatTile({
  label,
  value,
  valueClass = '',
}: {
  label: string
  value: ReactNode
  valueClass?: string
}) {
  return (
    <div className="stat-tile">
      <div className="k">{label}</div>
      <div className={`v tnum ${valueClass}`}>{value}</div>
    </div>
  )
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accent = false,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  accent?: boolean
}) {
  return (
    <div className={`segmented ${accent ? 'accent' : ''}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function AppBar({
  title,
  subtitle,
  back = false,
  right,
}: {
  title: ReactNode
  subtitle?: string
  back?: boolean
  right?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className="appbar">
      {back && (
        <button className="icon-btn" type="button" aria-label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft size={22} />
        </button>
      )}
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      <div className="grow" />
      {right}
    </header>
  )
}

// Lightweight transient toast. Usage: const { show, node } = useToast(); ... return <>{node}...</>
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2400)
  }, [])
  const node = msg ? <div className="toast">{msg}</div> : null
  return { show, node }
}
