import { Router } from 'express'
import { cache, TTL } from '../cache.js'
import * as yahoo from '../providers/yahoo.js'
import * as td from '../providers/twelvedata.js'
import { ProviderError } from '../types.js'

const router = Router()

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 1) return res.json([])
  try {
    const results = await cache.getOrFetch(`search:${q.toLowerCase()}`, TTL.search, () =>
      yahoo.search(q),
    )
    res.json(results)
  } catch {
    // Search failures are non-fatal — return an empty list so the UI degrades gracefully.
    res.json([])
  }
})

router.get('/quote', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim()
  if (!symbol) return res.status(400).json({ error: 'symbol required' })
  try {
    const data = await cache.getOrFetch(`quote:${symbol}`, TTL.quote, async () => {
      try {
        return await yahoo.quote(symbol)
      } catch (e) {
        if (td.enabled()) return await td.quote(symbol)
        throw e
      }
    })
    res.json(data)
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 502
    res.status(status === 404 ? 404 : 502).json({ error: 'quote unavailable', detail: String((e as Error)?.message ?? e) })
  }
})

router.get('/history', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim()
  const range = String(req.query.range || '1y').trim()
  if (!symbol) return res.status(400).json({ error: 'symbol required' })
  try {
    const data = await cache.getOrFetch(`history:${symbol}:${range}`, TTL.history, async () => {
      try {
        return await yahoo.history(symbol, range)
      } catch (e) {
        if (td.enabled()) return await td.history(symbol, range)
        throw e
      }
    })
    res.json(data)
  } catch (e) {
    res.status(502).json({ error: 'history unavailable', detail: String((e as Error)?.message ?? e) })
  }
})

export default router
