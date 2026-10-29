import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const SIGNATURES: { type: "image/jpeg" | "image/png" | "image/webp"; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

/** Detects the real image type from the file's bytes (never trusts the extension or declared MIME type). */
export function detectImageType(bytes: Uint8Array): { type: string; ext: string } | null {
  const match = SIGNATURES.find((signature) => bytes.length >= 12 && signature.test(bytes));
  return match ? { type: match.type, ext: match.ext } : null;
}

export const UPLOAD_FOLDERS = ["products", "categories", "banners"] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

const UPLOADED_NAME = /^\d{10,}-[0-9a-f]{16}\.(jpg|png|webp)$/;
const CONTENT_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Checks a requested /uploads/<folder>/<file> path against the names
 * storeImage generates, so nothing else on the disk can be served.
 */
export function uploadedFile(segments: readonly string[]): { relative: string; contentType: string } | null {
  if (segments.length !== 2) return null;
  const [folder, name] = segments as [string, string];
  if (!(UPLOAD_FOLDERS as readonly string[]).includes(folder)) return null;
  const match = UPLOADED_NAME.exec(name);
  if (!match) return null;
  return { relative: `${folder}/${name}`, contentType: CONTENT_TYPES[match[1]!]! };
}

/**
 * Stores an uploaded image and returns its public URL. In order of preference:
 * Vercel Blob (BLOB_READ_WRITE_TOKEN), a persistent disk such as a Railway
 * volume (UPLOAD_DIR, served by /uploads/[...path]), or the local
 * public/uploads folder (development only).
 */
export async function storeImage(file: File, folder: UploadFolder): Promise<string> {
  if (file.size === 0) throw new UploadError("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("Images must be 5 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected) throw new UploadError("Please upload a JPEG, PNG or WebP image.");

  const name = `${folder}/${Date.now()}-${randomBytes(8).toString("hex")}.${detected.ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(name, Buffer.from(bytes), { access: "public", contentType: detected.type, addRandomSuffix: false });
    return blob.url;
  }
  const uploadDir = process.env.UPLOAD_DIR;
  if (!uploadDir && process.env.NODE_ENV === "production") {
    throw new UploadError("File storage is not configured. Set BLOB_READ_WRITE_TOKEN or UPLOAD_DIR.");
  }
  const target = path.join(uploadDir || path.join(process.cwd(), "public", "uploads"), name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return `/uploads/${name}`;
}

/** Image URLs the storefront can render (local files or our Blob store). */
export function isAllowedImageUrl(url: string): boolean {
  if (url.startsWith("/images/") || url.startsWith("/uploads/")) return !url.includes("..");
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}
