import { ProviderError } from '../types.js'

// api.mfapi.in is CORS-open and could be called from the browser, but routing it
// through the proxy adds caching + retry, which matters on flaky/corporate networks
// where the direct connection intermittently times out.
const BASE = 'https://api.mfapi.in'

async function mfget(path: string, attempts = 3): Promise<any> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new ProviderError(`mfapi http ${res.status}`, res.status)
      return await res.json()
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw new ProviderError(`mfapi unreachable: ${String((lastErr as Error)?.message ?? lastErr)}`, 502)
}

export interface MfSearchItem {
  schemeCode: number
  schemeName: string
}

export async function search(q: string): Promise<MfSearchItem[]> {
  const data = await mfget(`/mf/search?q=${encodeURIComponent(q)}`)
  if (!Array.isArray(data)) return []
  return data.map((x: any) => ({ schemeCode: Number(x.schemeCode), schemeName: String(x.schemeName) }))
}

// Returns the raw mfapi scheme payload ({ meta, data, status }); the web client
// parses it (NAV strings, dd-mm-yyyy dates) exactly as it would the direct response.
export async function scheme(code: string): Promise<any> {
  return mfget(`/mf/${encodeURIComponent(code)}`)
}
