import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Short-lived, in-memory cache for storefront reads that are the same for
 * every shopper: the catalogue, categories, banners, settings and ratings.
 * Pages are still rendered per request (the cart count is personal), but they
 * stop repeating the same database queries.
 *
 * - Entries live for STOREFRONT_CACHE_SECONDS (60 in production, off in
 *   development and tests, where data is changed outside the admin).
 * - Admin changes clear everything at once through refreshStorefront().
 * - Concurrent requests for a missing entry share one database round trip.
 * - Failed loads are never kept.
 *
 * Each server process has its own copy. With several instances (e.g. on
 * Vercel), another instance can show an admin change up to one TTL later.
 * Checkout and the cart never read from here; prices and stock are always
 * checked against the database when an order is placed.
 */

const DEFAULT_PRODUCTION_SECONDS = 60;
const MAX_ENTRIES = 1000;

interface Entry {
  value: Promise<unknown>;
  expiresAt: number;
}

// On globalThis so that pages, server actions and route handlers, which Next.js
// may bundle separately, share one cache and one invalidation.
const globalForCache = globalThis as unknown as { storefrontCache?: Map<string, Entry> };
const entries = (globalForCache.storefrontCache ??= new Map<string, Entry>());

export function storefrontCacheSeconds(): number {
  const raw = process.env.STOREFRONT_CACHE_SECONDS;
  if (raw !== undefined && raw.trim() !== "") {
    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  }
  return process.env.NODE_ENV === "production" ? DEFAULT_PRODUCTION_SECONDS : 0;
}

/** Returns the cached result for `key`, or runs `load` and keeps its result for the TTL. */
export function storefrontCached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const ttlMs = storefrontCacheSeconds() * 1000;
  if (ttlMs <= 0) return load();

  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expiresAt > now) {
    // Re-insert so the Map's order stays least-recently-used first.
    entries.delete(key);
    entries.set(key, hit);
    return hit.value as Promise<T>;
  }

  const value = load();
  const entry: Entry = { value, expiresAt: now + ttlMs };
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
  value.catch(() => {
    if (entries.get(key) === entry) entries.delete(key);
  });
  return value;
}

/** Drops every cached storefront read, so the next visit sees the database as it is now. */
export function invalidateStorefront(): void {
  entries.clear();
}

/** After an admin change shoppers can see: clear the cache and re-render open pages. */
export function refreshStorefront(): void {
  invalidateStorefront();
  revalidatePath("/", "layout");
}
