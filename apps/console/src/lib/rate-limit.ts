/** Small in-memory limiter (one server). Login: 5 tries per IP+email per 15 minutes. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function hit(key: string, limit = 5, windowMs = 15 * 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  b.count++;
  return { ok: b.count <= limit, retryAfterMs: b.resetAt - now };
}
