"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface GalleryImage {
  id: string;
  url: string;
  alt: string;
  credit: string | null;
}

export function ProductGallery({ images, productName, badge }: { images: GalleryImage[]; productName: string; badge?: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const current = images[index];

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-lg border border-line bg-surface">
        {current ? (
          <Image src={current.url} alt={current.alt || productName} fill priority sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-subtle">
            <ImageOff className="h-10 w-10" aria-hidden="true" />
            <span className="sr-only">No image available</span>
          </div>
        )}
        {badge ? <div className="absolute left-3 top-3">{badge}</div> : null}
      </div>
      {images.length > 1 ? (
        <ul className="mt-3 flex gap-2" aria-label="Product images">
          {images.map((image, i) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className={cn(
                  "relative h-16 w-16 overflow-hidden rounded-md border-2 bg-surface transition-colors",
                  i === index ? "border-brand-600" : "border-line hover:border-ink-subtle",
                )}
              >
                <Image src={image.url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {current?.credit ? <p className="mt-2 text-[11px] text-ink-subtle">Photo: {current.credit}</p> : null}
    </div>
  );
}
