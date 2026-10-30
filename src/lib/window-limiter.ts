/**
 * A fixed-window counter kept in memory, for checks that run on every request
 * (src/proxy.ts) where a database round trip would be too slow. It resets
 * when the server restarts, and each server instance counts on its own; the
 * shop runs one instance.
 */
export interface WindowLimiter {
  /** Whether this key has used up its tries in the current window. */
  blocked(key: string, now: number): boolean;
  /** Counts one try for the key. */
  hit(key: string, now: number): void;
}

export function createWindowLimiter(options: { max: number; windowMs: number; maxKeys?: number }): WindowLimiter {
  const maxKeys = options.maxKeys ?? 10_000;
  const windows = new Map<string, { count: number; resetAt: number }>();

  const current = (key: string, now: number) => {
    const entry = windows.get(key);
    return entry && entry.resetAt > now ? entry : null;
  };

  const prune = (now: number) => {
    for (const [key, entry] of windows) if (entry.resetAt <= now) windows.delete(key);
    // Still full: drop the oldest keys rather than grow without bound.
    for (const key of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(key);
    }
  };

  return {
    blocked: (key, now) => (current(key, now)?.count ?? 0) >= options.max,
    hit: (key, now) => {
      const entry = current(key, now);
      if (entry) {
        windows.set(key, { count: entry.count + 1, resetAt: entry.resetAt });
        return;
      }
      if (windows.size >= maxKeys) prune(now);
      windows.set(key, { count: 1, resetAt: now + options.windowMs });
    },
  };
}
