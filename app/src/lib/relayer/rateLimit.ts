/**
 * Tiny in-memory sliding-window rate limiter, keyed by an arbitrary string
 * (typically `intent.user` or the request IP). Good enough for V1; replace
 * with Redis/Upstash before opening the relayer to the public internet.
 */

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 10;
const MAX_MAP_SIZE = 10_000;
const hits = new Map<string, number[]>();

export function rateLimit(key: string): {ok: boolean; retryAfterSec?: number} {
    const now = Date.now();

    // Cleanup: evict stale entries when map grows too large (prevents memory leak)
    if (hits.size > MAX_MAP_SIZE) {
        for (const [k, timestamps] of hits) {
            if (timestamps.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
        }
    }

    const arr = hits.get(key) ?? [];
    const recent = arr.filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) {
        const oldest = recent[0]!;
        const retryAfterMs = WINDOW_MS - (now - oldest);
        return {ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000))};
    }
    recent.push(now);
    hits.set(key, recent);
    return {ok: true};
}
