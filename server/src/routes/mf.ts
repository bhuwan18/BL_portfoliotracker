import { Router } from 'express'
import { cache, TTL } from '../cache.js'
import * as mfapi from '../providers/mfapi.js'

const router = Router()

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 1) return res.json([])
  try {
    // Fuzzy search over the locally-cached master list. Only successful results are
    // cached — if the master index can't be built yet (e.g. cold start / mfapi
    // unreachable) this throws, and we fall back to the literal upstream search
    // *uncached*, so the next identical query retries once the index is warm.
    const results = await cache.getOrFetch(`mf:search:${q.toLowerCase()}`, TTL.search, () =>
      mfapi.searchMaster(q),
    )
    res.json(results)
  } catch {
    try {
      res.json(await mfapi.search(q))
    } catch {
      res.json([])
    }
  }
})

router.get('/:code', async (req, res) => {
  const code = String(req.params.code || '').trim()
  if (!/^\d+$/.test(code)) return res.status(400).json({ error: 'invalid scheme code' })
  try {
    // NAVs refresh a few times per day; cache for 30 min.
    const data = await cache.getOrFetch(`mf:scheme:${code}`, 30 * 60 * 1000, () => mfapi.scheme(code))
    res.json(data)
  } catch (e) {
    res.status(502).json({ error: 'mf data unavailable', detail: String((e as Error)?.message ?? e) })
  }
})

export default router
