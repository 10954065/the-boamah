"use client";

import Image from "next/image";
import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { HeroProduct } from "@/lib/catalog-types";
import { canRotate, HERO_TILE_COUNT, rotate, startRotation, upcoming, type RotationState } from "@/lib/hero-rotation";
import { cn } from "@/lib/utils";

const SWAP_EVERY_MS = 2800;
const TILE_SIZES = "(min-width: 1280px) 230px, 18vw";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

interface GridView {
  rotation: RotationState;
  /** What each tile showed before its last swap, kept underneath while the new photo turns in. */
  previous: (number | null)[];
}

interface HeroProductGridProps {
  products: HeroProduct[];
  className?: string;
}

/**
 * The hero's product mosaic, built from the live catalogue. One tile at a time
 * turns over to the next product, so every product (new ones first) gets a
 * turn. Pauses on hover, keyboard focus, a hidden tab, or the pause button,
 * and stays still for visitors who prefer reduced motion.
 */
export function HeroProductGrid({ products, className }: HeroProductGridProps) {
  const prefersStill = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
  const [userChoice, setUserChoice] = useState<"play" | "pause" | null>(null);
  const [held, setHeld] = useState(false);
  const [view, setView] = useState<GridView>(() => {
    const rotation = startRotation(products.length, HERO_TILE_COUNT);
    return { rotation, previous: rotation.tiles.map(() => null) };
  });

  const rotates = canRotate(products.length, HERO_TILE_COUNT);
  const playing = userChoice ? userChoice === "play" : !prefersStill;
  const running = rotates && playing && !held;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setView((current) => {
        const { state, tile } = rotate(current.rotation, products.length);
        if (tile === null) return current;
        return { rotation: state, previous: current.previous.map((p, i) => (i === tile ? current.rotation.tiles[i]! : p)) };
      });
    }, SWAP_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [running, products.length]);

  const next = upcoming(view.rotation, products.length);
  const preload = next !== null ? products[next] : undefined;

  return (
    <div
      role="group"
      aria-label="Products in the shop"
      className={cn("relative h-full", className)}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      <ul className="grid h-full grid-cols-3 grid-rows-2 gap-1.5 bg-brand-900">
        {view.rotation.tiles.map((productIndex, tile) => {
          const product = products[productIndex]!;
          const before = view.previous[tile];
          const underneath = before !== null && before !== undefined ? products[before] : undefined;
          return (
            <li key={tile} className="relative overflow-hidden bg-brand-800">
              <Link href={`/products/${product.slug}`} className="group absolute inset-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-gold-400">
                {underneath ? (
                  <Image src={underneath.imageUrl} alt="" fill sizes={TILE_SIZES} className="object-cover" aria-hidden="true" />
                ) : null}
                <Image
                  key={product.slug}
                  src={product.imageUrl}
                  alt={product.imageAlt}
                  fill
                  sizes={TILE_SIZES}
                  className={cn("object-cover transition-transform duration-700 group-hover:scale-105", underneath && "tile-in")}
                />
                {product.isNew ? (
                  <span className="absolute left-2 top-2 rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-brand-900 shadow">
                    New
                  </span>
                ) : null}
                <span className="absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-brand-900/90 to-transparent px-3 pb-2.5 pt-8 text-xs font-semibold leading-snug text-white opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                  {product.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {preload ? (
        // Fetch the next photo before its turn so it never appears half loaded.
        <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
          <Image src={preload.imageUrl} alt="" fill sizes={TILE_SIZES} />
        </div>
      ) : null}

      {rotates ? (
        <button
          type="button"
          onClick={() => setUserChoice(playing ? "pause" : "play")}
          aria-label={playing ? "Pause the product slideshow" : "Play the product slideshow"}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-brand-900/60 text-white ring-1 ring-white/25 backdrop-blur transition-colors hover:bg-brand-900/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  );
}
