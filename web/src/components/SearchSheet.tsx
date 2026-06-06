import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Sheet } from './Sheet'
import { EmptyState, SegmentedControl, Spinner } from './ui'
import { InstrumentAvatar } from './InstrumentAvatar'
import { unifiedSearch, type UnifiedSearchResult } from '../api/instrument'
import type { InstrumentType } from '../domain/types'

export function SearchSheet({
  open,
  onClose,
  onPick,
  title = 'Add instrument',
  defaultType = 'stock',
}: {
  open: boolean
  onClose: () => void
  onPick: (r: UnifiedSearchResult) => void
  title?: string
  defaultType?: InstrumentType
}) {
  const [type, setType] = useState<InstrumentType>(defaultType)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UnifiedSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (open) {
      setQ('')
      setResults([])
      setType(defaultType)
    }
  }, [open, defaultType])

  useEffect(() => {
    if (!open) return
    const query = q.trim()
    if (query.length < 1) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const my = ++seq.current
    const timer = setTimeout(async () => {
      const r = await unifiedSearch(query, type)
      if (my === seq.current) {
        setResults(r)
        setLoading(false)
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [q, type, open])

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <SegmentedControl
        options={[
          { value: 'stock', label: 'Stocks' },
          { value: 'mf', label: 'Mutual Funds' },
        ]}
        value={type}
        onChange={setType}
      />
      <div className="input-prefix" style={{ marginTop: 12 }}>
        <span className="pfx">
          <Search size={16} />
        </span>
        <input
          className="input"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          placeholder={type === 'stock' ? 'Search NSE / BSE stocks' : 'Search mutual funds'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ paddingLeft: 38 }}
        />
      </div>

      <div className="list" style={{ marginTop: 14, minHeight: 120 }}>
        {loading && (
          <div className="center" style={{ padding: 24 }}>
            <Spinner />
          </div>
        )}
        {!loading && q.trim().length > 0 && results.length === 0 && (
          <EmptyState title="No matches" message="Try a different name or symbol." />
        )}
        {!loading &&
          results.map((r) => (
            <button
              key={r.id}
              className="row tap search-row"
              type="button"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => onPick(r)}
            >
              <InstrumentAvatar name={r.name} type={r.type} />
              <div className="main">
                <div className="title">{r.name}</div>
                <div className="subtitle">{r.subtitle}</div>
              </div>
            </button>
          ))}
        {!loading && q.trim().length === 0 && (
          <p className="faint" style={{ textAlign: 'center', padding: '24px 10px', fontSize: 'var(--text-sm)' }}>
            Search {type === 'stock' ? 'stocks' : 'mutual funds'} to add to your portfolio.
          </p>
        )}
      </div>
    </Sheet>
  )
}
