// Durable key/value store for share keys.
//
// On Vercel (and any serverless host) the in-memory cache in cache.ts is NOT shared
// across function invocations, so share keys must live in an external store. We use
// Upstash Redis / Vercel KV over its REST API (both are the same service — only the env
// var names differ). When no KV credentials are configured we fall back to an in-memory
// Map so `npm run dev` works with zero setup. That fallback is NOT durable across
// processes or restarts and is intended for local development only.
import { ProviderError } from './types.js'

export interface KvStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
}

// Accept both Vercel KV and Upstash env var names. Vercel's KV/Upstash marketplace
// integration injects KV_REST_API_*; a bare Upstash database exposes UPSTASH_REDIS_REST_*.
function resolveRestConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (url && token) return { url: url.replace(/\/+$/, ''), token }
  return null
}

// Upstash Redis / Vercel KV over the REST API. Commands are sent as a JSON array in the
// request body (e.g. ["SET", key, value, "EX", ttl]) so large values never end up in the URL.
class RestKvStore implements KvStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async command(args: (string | number)[]): Promise<unknown> {
    let res: Awaited<ReturnType<typeof fetch>>
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
    } catch (e) {
      throw new ProviderError(`kv unreachable: ${String((e as Error)?.message ?? e)}`, 503)
    }
    if (!res.ok) throw new ProviderError(`kv http ${res.status}`, 502)
    const json = (await res.json()) as { result?: unknown; error?: string }
    if (json.error) throw new ProviderError(`kv error: ${json.error}`, 502)
    return json.result ?? null
  }

  async get(key: string): Promise<string | null> {
    const result = await this.command(['GET', key])
    return result == null ? null : String(result)
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.command(['SET', key, value, 'EX', ttlSeconds])
  }
}

// Process-local fallback for local dev. Not durable (lost on restart, not shared across
// serverless invocations) — only used when no KV credentials are present.
class MemoryKvStore implements KvStore {
  private store = new Map<string, { value: string; expires: number }>()

  async get(key: string): Promise<string | null> {
    const e = this.store.get(key)
    if (!e) return null
    if (Date.now() > e.expires) {
      this.store.delete(key)
      return null
    }
    return e.value
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 })
  }
}

let cached: KvStore | null = null

// Lazily resolved so env vars are read at first use (matters on serverless cold starts).
export function getStore(): KvStore {
  if (cached) return cached
  const cfg = resolveRestConfig()
  cached = cfg ? new RestKvStore(cfg.url, cfg.token) : new MemoryKvStore()
  return cached
}

// True when a durable KV is configured. Surfaced via /api/health so a missing-env
// misconfiguration in production is visible (in-memory share keys won't resolve there).
export function storeIsDurable(): boolean {
  return resolveRestConfig() != null
}
