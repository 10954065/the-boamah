import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const { invalidateStorefront, refreshStorefront, storefrontCached, storefrontCacheSeconds } = await import("@/server/storefront-cache");

const counter = () => {
  let calls = 0;
  return { load: async () => ++calls, calls: () => calls };
};

beforeEach(() => {
  invalidateStorefront();
  revalidatePath.mockClear();
  vi.stubEnv("STOREFRONT_CACHE_SECONDS", "60");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("storefront cache settings", () => {
  test("is on for 60 seconds in production and off elsewhere unless configured", () => {
    vi.stubEnv("STOREFRONT_CACHE_SECONDS", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(storefrontCacheSeconds()).toBe(60);
    vi.stubEnv("NODE_ENV", "development");
    expect(storefrontCacheSeconds()).toBe(0);
    vi.stubEnv("STOREFRONT_CACHE_SECONDS", "15");
    expect(storefrontCacheSeconds()).toBe(15);
  });

  test("treats zero, negative and unreadable values as off", () => {
    for (const value of ["0", "-5", "soon"]) {
      vi.stubEnv("STOREFRONT_CACHE_SECONDS", value);
      expect(storefrontCacheSeconds()).toBe(0);
    }
  });

  test("loads every time when it is off", async () => {
    vi.stubEnv("STOREFRONT_CACHE_SECONDS", "0");
    const { load, calls } = counter();
    await storefrontCached("k", load);
    await storefrontCached("k", load);
    expect(calls()).toBe(2);
  });
});

describe("storefront cache", () => {
  test("reuses a result until it expires, then loads again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    const { load, calls } = counter();

    expect(await storefrontCached("categories", load)).toBe(1);
    vi.setSystemTime(new Date("2026-10-29T12:00:59Z"));
    expect(await storefrontCached("categories", load)).toBe(1);
    vi.setSystemTime(new Date("2026-10-29T12:01:01Z"));
    expect(await storefrontCached("categories", load)).toBe(2);
    expect(calls()).toBe(2);
  });

  test("keeps separate entries per key", async () => {
    const { load, calls } = counter();
    await storefrontCached("product:rice", load);
    await storefrontCached("product:oil", load);
    await storefrontCached("product:rice", load);
    expect(calls()).toBe(2);
  });

  test("shares one load between requests that arrive together", async () => {
    let release: (value: string) => void = () => {};
    const load = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const first = storefrontCached("home", load);
    const second = storefrontCached("home", load);
    release("ready");
    expect(await Promise.all([first, second])).toEqual(["ready", "ready"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("does not keep a failed load", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("database down")).mockResolvedValueOnce("ok");
    await expect(storefrontCached("settings", load)).rejects.toThrow("database down");
    expect(await storefrontCached("settings", load)).toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("an admin change clears everything and re-renders open pages", async () => {
    const { load, calls } = counter();
    await storefrontCached("a", load);
    await storefrontCached("b", load);
    refreshStorefront();
    await storefrontCached("a", load);
    await storefrontCached("b", load);
    expect(calls()).toBe(4);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  test("drops the least recently used entry beyond 1000", async () => {
    const { load, calls } = counter();
    await storefrontCached("search:0", load);
    for (let i = 1; i <= 1000; i++) await storefrontCached(`search:${i}`, async () => i);
    expect(calls()).toBe(1);
    await storefrontCached("search:0", load);
    expect(calls()).toBe(2);
    // search:1 was used before the others and was evicted when search:0 came back.
    let reloaded = false;
    await storefrontCached("search:1", async () => (reloaded = true));
    expect(reloaded).toBe(true);
  });
});
