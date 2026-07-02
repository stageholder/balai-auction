import "server-only";

/**
 * A minimal in-memory sliding-window rate limiter for unauthenticated actions.
 * Best-effort only: state is per server instance, so it throttles casual abuse
 * and accidental double-submits, not a determined distributed attacker. For
 * hard guarantees, move this to a shared store (e.g. Upstash/Redis).
 */
const hits = new Map<string, number[]>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= limit) {
    const retryAfterMs = recent[0]! + windowMs - now;
    hits.set(key, recent);
    return { ok: false, retryAfterMs };
  }

  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map can't grow without bound.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      const live = v.filter((t) => t > cutoff);
      if (live.length === 0) hits.delete(k);
      else hits.set(k, live);
    }
  }

  return { ok: true, retryAfterMs: 0 };
}
