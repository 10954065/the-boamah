"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * Products this visitor opened recently, kept only in their own browser.
 * Prices are deliberately not stored: they could be out of date by the time
 * the list is shown.
 */
const STORAGE_KEY = "bg_recently_viewed";
const CHANGE_EVENT = "bg:recently-viewed";
const LIMIT = 12;

interface RecentProduct {
  slug: string;
  name: string;
  imageUrl: string | null;
}

const SAFE_IMAGE = /^\/(images|uploads)\/|^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//;

function readRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): RecentProduct[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry: unknown) => {
      const item = entry as Partial<RecentProduct> | null;
      if (!item || typeof item.slug !== "string" || !/^[a-z0-9-]{1,120}$/.test(item.slug) || typeof item.name !== "string") return [];
      const imageUrl = typeof item.imageUrl === "string" && SAFE_IMAGE.test(item.imageUrl) ? item.imageUrl : null;
      return [{ slug: item.slug, name: item.name.slice(0, 120), imageUrl }];
    });
  } catch {
    return [];
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Records the product being viewed. Renders nothing. */
export function TrackRecentlyViewed({ slug, name, imageUrl }: RecentProduct) {
  useEffect(() => {
    const others = parse(readRaw()).filter((item) => item.slug !== slug);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([{ slug, name, imageUrl }, ...others].slice(0, LIMIT)));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // Storage is unavailable (private browsing or full); the list is a convenience only.
    }
  }, [slug, name, imageUrl]);
  return null;
}

export function RecentlyViewed({
  excludeSlug,
  title = "Recently viewed",
  className,
}: {
  excludeSlug?: string;
  title?: string;
  className?: string;
}) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
  const items = useMemo(() => parse(raw).filter((item) => item.slug !== excludeSlug).slice(0, 8), [raw, excludeSlug]);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="recently-viewed-title" className={className}>
      <h2 id="recently-viewed-title" className="text-xl font-extrabold sm:text-2xl">
        {title}
      </h2>
      <ul className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:px-0">
        {items.map((item) => (
          <li key={item.slug} className="w-36 shrink-0 snap-start motion-safe:animate-[fade-in_0.4s_ease-out]">
            <Link
              href={`/products/${item.slug}`}
              className={cn(
                "group block rounded-xl border border-line bg-surface p-2 transition-colors duration-200 hover:border-brand-300",
              )}
            >
              <div className="relative aspect-square overflow-hidden rounded-lg bg-soft">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt=""
                    fill
                    sizes="144px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug text-ink group-hover:text-brand-700">
                {item.name}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
