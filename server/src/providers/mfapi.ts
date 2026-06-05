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

// Literal upstream search (api.mfapi.in/mf/search). Kept as a fallback for when the
// local master index can't be built; the primary path is searchMaster() below.
export async function search(q: string): Promise<MfSearchItem[]> {
  const data = await mfget(`/mf/search?q=${encodeURIComponent(q)}`)
  if (!Array.isArray(data)) return []
  return data.map((x: any) => ({ schemeCode: Number(x.schemeCode), schemeName: String(x.schemeName) }))
}

// ---------------------------------------------------------------------------
// Master scheme list + local fuzzy search
//
// api.mfapi.in/mf returns the FULL scheme universe (~37k entries) as
// {schemeCode, schemeName, ...}. We fetch it once, build a normalized in-memory
// index, and search locally — so a keystroke is a few-ms array scan instead of a
// network round-trip. The upstream /mf/search is also literal (reordered/partial
// words miss); a token-AND match over the master list is genuinely fuzzy.
// ---------------------------------------------------------------------------

interface IndexEntry {
  schemeCode: number
  schemeName: string
  lc: string // lowercased name
  cat: string // lowercased name with non-alphanumerics stripped ("Bluechip" ~ "blue chip")
  toks: string[] // lowercased word tokens, for whole-word match scoring ("50" ≠ "500")
}

const MASTER_TTL_MS = 24 * 60 * 60 * 1000 // refresh the universe daily

let masterIndex: IndexEntry[] | null = null
let builtAt = 0
let refreshing: Promise<IndexEntry[]> | null = null

async function masterList(): Promise<any[]> {
  const data = await mfget('/mf')
  return Array.isArray(data) ? data : []
}

function buildIndex(raw: any[]): IndexEntry[] {
  const out: IndexEntry[] = []
  for (const x of raw) {
    const schemeName = String(x?.schemeName ?? '')
    const schemeCode = Number(x?.schemeCode)
    if (!schemeName || !Number.isFinite(schemeCode)) continue
    const lc = schemeName.toLowerCase()
    out.push({
      schemeCode,
      schemeName,
      lc,
      cat: lc.replace(/[^a-z0-9]/g, ''),
      toks: lc.split(/[^a-z0-9]+/).filter(Boolean),
    })
  }
  return out
}

async function refreshIndex(): Promise<IndexEntry[]> {
  const idx = buildIndex(await masterList())
  masterIndex = idx
  builtAt = Date.now()
  return idx
}

// Returns the index, building it on first use. When the cached index is stale it
// is returned immediately while a single background refresh runs (stale-while-
// revalidate) — keystrokes never block on the 5.7MB fetch except on a cold start.
async function getIndex(): Promise<IndexEntry[]> {
  if (!masterIndex) {
    if (!refreshing) refreshing = refreshIndex().finally(() => (refreshing = null))
    return refreshing
  }
  if (Date.now() - builtAt > MASTER_TTL_MS && !refreshing) {
    refreshing = refreshIndex().finally(() => (refreshing = null))
    // don't await — serve the stale index now
  }
  return masterIndex
}

// Score a matched entry so the most on-point plans rank first. Tunable heuristic.
function score(e: IndexEntry, ql: string, qcat: string, tokens: string[]): number {
  let s = 0
  // Whole-word matches are the strongest signal: a token that *equals* a word in the
  // name (not just a substring) wins, so "50" prefers "Nifty 50" over "Nifty 500".
  let whole = 0
  for (const t of tokens) if (e.toks.includes(t)) whole++
  s += whole * 200
  if (e.lc.startsWith(ql)) s += 1000
  else if (e.cat.startsWith(qcat)) s += 600
  else if (e.cat.includes(qcat)) s += 300
  const pos = e.lc.indexOf(tokens[0])
  if (pos >= 0) s += Math.max(0, 100 - pos) // earlier first-token hit ranks higher
  s -= e.lc.length * 0.5 // prefer concise, on-point names over verbose legacy ones
  return s
}

// Warm the master index ahead of the first search (called at server boot for the
// single-process deployment, so the ~one-time cold fetch happens at startup rather
// than on the user's first keystroke). Errors are swallowed — search lazy-loads anyway.
export async function warmMaster(): Promise<void> {
  try {
    await getIndex()
  } catch {
    /* lazy-loads on first search instead */
  }
}

// Fuzzy match over the master list: order-insensitive, partial-word, and
// space-insensitive. Each query token must be a substring of the *despaced* name
// (lc with non-alphanumerics removed), so "smallcap" matches "Small Cap",
// "blue chip" matches "Bluechip", and interspersed/reordered words still match.
export async function searchMaster(q: string, limit = 30): Promise<MfSearchItem[]> {
  const ql = q.toLowerCase().trim()
  if (!ql) return []
  const tokens = ql.split(/[^a-z0-9]+/).filter(Boolean)
  if (tokens.length === 0) return []
  const qcat = ql.replace(/[^a-z0-9]/g, '')

  const idx = await getIndex()
  // Score each match once, then sort — cheaper and clearer than re-scoring in the comparator.
  const hits = idx
    .filter((e) => tokens.every((t) => e.cat.includes(t)))
    .map((e) => ({ e, s: score(e, ql, qcat, tokens) }))
  hits.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.e.schemeCode - b.e.schemeCode))
  return hits.slice(0, limit).map(({ e }) => ({ schemeCode: e.schemeCode, schemeName: e.schemeName }))
}

// Returns the raw mfapi scheme payload ({ meta, data, status }); the web client
// parses it (NAV strings, dd-mm-yyyy dates) exactly as it would the direct response.
export async function scheme(code: string): Promise<any> {
  return mfget(`/mf/${encodeURIComponent(code)}`)
}
