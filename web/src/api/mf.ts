// Mutual fund data via our proxy (/api/mf/*), which fetches api.mfapi.in server-side
// with caching + retry. NAV values arrive as strings and dates as dd-mm-yyyy.

const BASE = '/api'

export interface MfSearchResult {
  schemeCode: number
  schemeName: string
}

export interface MfNavPoint {
  date: string // ISO yyyy-mm-dd
  nav: number
}

export interface MfScheme {
  schemeCode: number
  schemeName: string
  fundHouse?: string
  category?: string
  schemeType?: string
  latestNav: number
  latestDate: string // ISO
  prevNav: number
  history: MfNavPoint[] // oldest-first
}

function toISO(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('-')
  return `${y}-${m}-${d}`
}

export async function searchMf(q: string): Promise<MfSearchResult[]> {
  try {
    const res = await fetch(`${BASE}/mf/search?q=${encodeURIComponent(q)}`)
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.map((x: any) => ({
      schemeCode: Number(x.schemeCode),
      schemeName: String(x.schemeName),
    }))
  } catch {
    return []
  }
}

export async function getMfScheme(schemeCode: number): Promise<MfScheme | null> {
  try {
    const res = await fetch(`${BASE}/mf/${schemeCode}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data?.status !== 'SUCCESS' || !Array.isArray(data.data) || data.data.length === 0) {
      return null
    }
    const raw: any[] = data.data // newest-first
    const history: MfNavPoint[] = raw
      .map((r) => ({ date: toISO(String(r.date)), nav: parseFloat(r.nav) }))
      .filter((p) => Number.isFinite(p.nav))
      .reverse() // oldest-first
    const latest = raw[0]
    const prev = raw[1] ?? raw[0]
    return {
      schemeCode,
      schemeName: String(data.meta?.scheme_name ?? ''),
      fundHouse: data.meta?.fund_house,
      category: data.meta?.scheme_category,
      schemeType: data.meta?.scheme_type,
      latestNav: parseFloat(latest.nav),
      latestDate: toISO(String(latest.date)),
      prevNav: parseFloat(prev.nav),
      history,
    }
  } catch {
    return null
  }
}

// NAV on a given date: nearest available on-or-before; falls back to earliest if the
// requested date precedes the fund's history.
export function navOn(history: MfNavPoint[], isoDate: string): number | null {
  if (history.length === 0) return null
  let nav: number | null = null
  for (const p of history) {
    if (p.date <= isoDate) nav = p.nav
    else break
  }
  return nav ?? history[0].nav
}
