"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { uploadImage } from "@/actions/admin/catalog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { UPLOAD_SIZES } from "@/lib/upload-sizes";

export interface UploadedImage {
  url: string;
  alt: string;
}

interface ImageUploaderProps {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  folder: "products" | "categories" | "banners";
  max?: number;
  label?: string;
}

/** Uploads to server storage (validated server-side) and manages order/alt text. */
export function ImageUploader({ images, onChange, folder, max = 8, label = "Images" }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const size = UPLOAD_SIZES[folder];

  const upload = (file: File) =>
    startTransition(async () => {
      const data = new FormData();
      data.set("file", file);
      data.set("folder", folder);
      const result = await uploadImage(data);
      if (result.ok) onChange([...images, { url: result.data.url, alt: "" }]);
      else toast.error(result.error);
    });

  const move = (index: number, delta: number) => {
    const next = [...images];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    onChange(next);
  };

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-ink">{label}</legend>
      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image, index) => (
            <li key={`${image.url}-${index}`} className="space-y-1.5 rounded-md border border-line p-2">
              <div className="relative aspect-square overflow-hidden rounded bg-soft">
                <Image src={image.url} alt={image.alt || "Uploaded image"} fill sizes="160px" className="object-cover" />
                {index === 0 && max > 1 ? <span className="absolute left-1 top-1 rounded bg-brand-700 px-1.5 text-[10px] font-semibold text-white">Main</span> : null}
              </div>
              <label className="sr-only" htmlFor={`alt-${folder}-${index}`}>
                Alt text for image {index + 1}
              </label>
              <Input
                id={`alt-${folder}-${index}`}
                value={image.alt}
                placeholder="Describe the image"
                className="h-8 text-xs"
                onChange={(event) => onChange(images.map((img, i) => (i === index ? { ...img, alt: event.target.value } : img)))}
              />
              <div className="flex justify-between">
                <Button type="button" size="icon-sm" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move image earlier">
                  <ArrowLeft />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => onChange(images.filter((_, i) => i !== index))} aria-label="Remove image" className="text-danger">
                  <Trash2 />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" disabled={index === images.length - 1} onClick={() => move(index, 1)} aria-label="Move image later">
                  <ArrowRight />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {images.length < max ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file);
              event.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
            {pending ? <Spinner label="Uploading" /> : <ImagePlus />} Upload image
          </Button>
          <p className="text-xs text-ink-subtle">
            JPEG, PNG or WebP, up to 5 MB. Saved at {size.width} by {size.height} pixels{size.fit === "contain" ? ", with the whole picture on white" : ", trimmed to fit"}.
          </p>
        </>
      ) : null}
    </fieldset>
  );
}
