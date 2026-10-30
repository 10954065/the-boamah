"use client";

import { useEffect } from "react";
import { getImageProps } from "next/image";
import type { TillCatalogResponse } from "./till-api";

/**
 * What lets the till open and sell with no internet: a service worker
 * (public/pos-sw.js) keeps the till page, its build files and product photos
 * on the device, and the page keeps the last product list it loaded.
 * Cache names match those in public/pos-sw.js.
 */

const WORKER_URL = "/pos-sw.js";
const WORKER_SCOPE = "/pos";
/** The till page as last loaded; it names the signed-in cashier, so it is removed at sign out. */
const PAGE_CACHE = "boamah-till-page";
/** The product list as last loaded; also removed at sign out. */
const DATA_CACHE = "boamah-till-data";
const CATALOG_KEY = "/api/pos/catalog";

/** Photo size on the till; product-grid.tsx and sale-check.tsx both use it, so one saved file serves both offline. */
export const TILE_IMAGE_SIZES = "160px";
/** Photos fetched ahead of time, a few at once so sales are not held up. */
const MAX_WARM_IMAGES = 1000;
const IMAGE_BATCH = 4;

function workersSupported(): boolean {
  return process.env.NODE_ENV === "production" && typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/** Registers the till's service worker. Development builds change every second, so only production uses it. */
export function TillServiceWorker(): null {
  useEffect(() => {
    if (!workersSupported()) return;
    navigator.serviceWorker.register(WORKER_URL, { scope: WORKER_SCOPE }).catch((error: unknown) => {
      console.error("[till] the offline helper could not be installed", error);
    });
  }, []);
  return null;
}

/**
 * Asks the service worker to keep the build files this page loaded, and the
 * page itself when it did not pass through the worker (the first visit, or
 * arriving from the sign in page without a full page load).
 */
export function warmTill(): void {
  if (!workersSupported()) return;
  // How this document was loaded, not whether the helper runs now: it may have started since.
  const firstDocument = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const savedOnLoad = firstDocument !== undefined && firstDocument.workerStart > 0 && new URL(firstDocument.name).pathname === WORKER_SCOPE;
  const assets = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => url.startsWith(`${location.origin}/_next/static/`));
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({ type: "warm", page: !savedOnLoad, assets });
  });
}

/** Removes the saved till page and product list, so the next person cannot open this cashier's till offline. */
export async function clearTillCaches(): Promise<void> {
  try {
    await Promise.all([caches.delete(PAGE_CACHE), caches.delete(DATA_CACHE)]);
  } catch {
    // No cache storage here: nothing was saved.
  }
}

export async function readSavedCatalog(): Promise<TillCatalogResponse | null> {
  try {
    const response = await (await caches.open(DATA_CACHE)).match(CATALOG_KEY);
    const data = (await response?.json()) as Partial<TillCatalogResponse> | undefined;
    return Array.isArray(data?.items) && typeof data.loadedAt === "string" ? (data as TillCatalogResponse) : null;
  } catch {
    return null;
  }
}

export async function saveCatalog(data: TillCatalogResponse): Promise<void> {
  try {
    const cache = await caches.open(DATA_CACHE);
    await cache.put(CATALOG_KEY, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
  } catch {
    // Storage full or unavailable: the till still has the list in memory.
  }
}

const warmed = new Set<string>();

function loadPhoto(src: string): Promise<void> {
  warmed.add(src);
  const { props } = getImageProps({ src, alt: "", fill: true, sizes: TILE_IMAGE_SIZES });
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    // The same sizes as the tiles, so the browser picks the same file the tile will ask for.
    if (props.sizes) image.sizes = props.sizes;
    if (props.srcSet) image.srcset = props.srcSet;
    image.src = props.src;
  });
}

/** Fetches product photos ahead of time so the service worker has them when the internet drops. */
export async function warmImages(sources: readonly string[]): Promise<void> {
  if (!workersSupported() || navigator.serviceWorker.controller === null) return;
  const todo = [...new Set(sources)].filter((src) => !warmed.has(src)).slice(0, MAX_WARM_IMAGES);
  for (let start = 0; start < todo.length; start += IMAGE_BATCH) {
    if (!navigator.onLine) return;
    await Promise.all(todo.slice(start, start + IMAGE_BATCH).map(loadPhoto));
  }
}
