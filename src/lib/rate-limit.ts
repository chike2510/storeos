// Lightweight in-memory rate limiter.
// Not distributed — resets on cold start — but stops naive credit-drain scripts
// from hammering the Qwen-backed routes within a warm instance's lifetime.
// For a real production deployment, swap this for Upstash/Vercel KV based limiting.

const WINDOW_MS = 60_000
const MAX_REQUESTS = 20

const hits = new Map<string, number[]>()

export function rateLimit(identifier: string, max: number = MAX_REQUESTS): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  const existing = (hits.get(identifier) || []).filter(t => t > windowStart)

  if (existing.length >= max) {
    hits.set(identifier, existing)
    return { allowed: false, remaining: 0 }
  }

  existing.push(now)
  hits.set(identifier, existing)

  // Opportunistic cleanup so the map doesn't grow unbounded on a long-lived warm instance
  if (hits.size > 500) {
    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter(t => t > windowStart)
      if (fresh.length === 0) hits.delete(key)
      else hits.set(key, fresh)
    }
  }

  return { allowed: true, remaining: max - existing.length }
}

export function getClientId(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return 'unknown'
}
