// Tiny in-memory TTL cache. The proxy is stateless beyond this best-effort cache,
// which exists only to smooth Yahoo's IP-based rate limiting.
interface Entry {
  value: unknown
  expires: number
}

export class TtlCache {
  private store = new Map<string, Entry>()

  get<T>(key: string): T | undefined {
    const e = this.store.get(key)
    if (!e) return undefined
    if (Date.now() > e.expires) {
      this.store.delete(key)
      return undefined
    }
    return e.value as T
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expires: Date.now() + ttlMs })
  }

  /** Returns cached value if fresh; otherwise runs `fetcher`, caches, and returns it. */
  async getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(key)
    if (hit !== undefined) return hit
    const value = await fetcher()
    this.set(key, value, ttlMs)
    return value
  }
}

export const cache = new TtlCache()

// TTLs tuned for once-daily closing prices.
export const TTL = {
  search: 60 * 60 * 1000, // 1h
  quote: 5 * 60 * 1000, // 5m
  history: 6 * 60 * 60 * 1000, // 6h
}
