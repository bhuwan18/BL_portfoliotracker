import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { getStore } from '../store.js'

// Share keys carry a user's full portfolio so it can be replicated onto another device.
// The payload is stored UNENCRYPTED (the code is a bearer token: anyone holding it can
// read the data), keyed by a short random code, and expires after 30 days.
const router = Router()

const TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days
const KEY_PREFIX = 'share:'
const MAX_BYTES = 6 * 1024 * 1024 // 6 MB — safely under the KV ~10 MB request cap
const CODE_LEN = 8

// Crockford base32 minus ambiguous characters (0/O, 1/I/L, U). 30 symbols → ~39 bits
// over 8 chars, which makes blind enumeration impractical.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_RE = /^[2-9A-HJ-NP-TV-Z]{8}$/

const normalize = (raw: string): string => raw.toUpperCase().replace(/[-\s]/g, '')

// Unbiased random code via rejection sampling. 240 = floor(256 / 30) * 30, so bytes
// >= 240 are discarded to avoid modulo bias across the 30-symbol alphabet.
function generateCode(): string {
  let out = ''
  while (out.length < CODE_LEN) {
    const bytes = randomBytes(CODE_LEN)
    for (let i = 0; i < bytes.length && out.length < CODE_LEN; i++) {
      const b = bytes[i]
      if (b < 240) out += ALPHABET[b % 30]
    }
  }
  return out
}

const formatCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`

router.post('/', async (req, res) => {
  const body = req.body as Record<string, unknown> | null | undefined
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    body.app !== 'my-funds' ||
    typeof body.data !== 'object' ||
    body.data === null
  ) {
    return res.status(400).json({ error: 'invalid payload' })
  }

  const serialized = JSON.stringify(body)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) {
    return res.status(413).json({ error: 'payload too large' })
  }

  const code = generateCode()
  try {
    await getStore().set(KEY_PREFIX + code, serialized, TTL_SECONDS)
  } catch (e) {
    const status = (e as { status?: number }).status === 502 ? 502 : 503
    return res
      .status(status)
      .json({ error: 'storage unavailable', detail: String((e as Error)?.message ?? e) })
  }

  res.json({
    code: formatCode(code),
    expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
  })
})

router.get('/:code', async (req, res) => {
  const code = normalize(String(req.params.code || ''))
  // A bad-shape code is treated as not-found (no info leak about valid code format).
  if (!CODE_RE.test(code)) return res.status(404).json({ error: 'not found' })

  let serialized: string | null
  try {
    serialized = await getStore().get(KEY_PREFIX + code)
  } catch (e) {
    return res
      .status(503)
      .json({ error: 'storage unavailable', detail: String((e as Error)?.message ?? e) })
  }
  // Missing and expired are indistinguishable here — both are "not found".
  if (serialized == null) return res.status(404).json({ error: 'not found' })

  try {
    res.json(JSON.parse(serialized))
  } catch {
    res.status(502).json({ error: 'corrupt payload' })
  }
})

export default router
