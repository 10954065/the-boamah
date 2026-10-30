import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { STORE_NAME } from "@/lib/open-graph";
import { isAllowedImageUrl, uploadedFile } from "@/server/storage";

/**
 * The picture that shows when a shop link is pasted into WhatsApp, Facebook,
 * X and the like (Open Graph image): a green panel with the shop's name and
 * the page's headline next to a photo.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = STORE_NAME;
export const OG_TYPE = "image/jpeg";

const PHOTO_SIZE = 630;
const JPEG_QUALITY = 80;
const FETCH_TIMEOUT_MS = 4000;
// Link previews are fetched once and kept by the apps; an hour keeps prices close to current.
const CACHE_CONTROL = "public, max-age=3600, s-maxage=3600";

const COLORS = { panel: "#0f3022", white: "#ffffff", gold: "#f1bd3d", goldSoft: "#f5cf6a", soft: "#abd3ba", strike: "#78b591" };

// The extended set carries the cedi sign (₵). It needs its own name, or the renderer never looks in it.
const FONT_FILES = [
  { name: "Manrope", file: "manrope-latin-800-normal.woff", weight: 800 },
  { name: "Inter", file: "inter-latin-600-normal.woff", weight: 600 },
  { name: "Inter", file: "inter-latin-800-normal.woff", weight: 800 },
  { name: "Inter Extended", file: "inter-latin-ext-600-normal.woff", weight: 600 },
  { name: "Inter Extended", file: "inter-latin-ext-800-normal.woff", weight: 800 },
] as const;
const TEXT_FONTS = "Inter, Inter Extended";

type LoadedFont = { name: string; data: Buffer; weight: 600 | 800; style: "normal" };
let fonts: Promise<LoadedFont[]> | undefined;

function loadFonts(): Promise<LoadedFont[]> {
  fonts ??= Promise.all(
    FONT_FILES.map(async ({ name, file, weight }) => ({
      name,
      data: await readFile(path.join(process.cwd(), "assets", "fonts", file)),
      weight,
      style: "normal" as const,
    })),
  );
  return fonts;
}

async function photoBytes(url: string): Promise<Buffer | null> {
  if (!isAllowedImageUrl(url)) return null;
  if (url.startsWith("/images/")) return readFile(path.join(process.cwd(), "public", url));
  if (url.startsWith("/uploads/")) {
    const file = uploadedFile(url.slice("/uploads/".length).split("/"));
    if (!file) return null;
    const folder = process.env.UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");
    return readFile(path.join(folder, file.relative));
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
}

/** A shop photo as a square JPEG the renderer can draw (it cannot read WebP). Null when there is none or it cannot be read. */
export async function photoForCard(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const bytes = await photoBytes(url);
    if (!bytes) return null;
    const jpeg = await sharp(bytes).resize(PHOTO_SIZE, PHOTO_SIZE, { fit: "cover" }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch (error) {
    console.error("[og-image] a photo could not be drawn", url, error);
    return null;
  }
}

function Mark() {
  return (
    <svg width="64" height="64" viewBox="0 0 40 40">
      <rect width="40" height="40" rx="10" fill="#174d33" />
      <path d="M12.5 17.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8.5 17.5h23l-2.5 11.6a3 3 0 0 1-2.93 2.37H13.93A3 3 0 0 1 11 29.1L8.5 17.5z" fill="#fff" />
      <path d="M15 22v5.5M20 22v5.5M25 22v5.5" stroke="#174d33" strokeWidth="2" strokeLinecap="round" />
      <path d="M22.5 12.6c.2-4.1 3.3-6.4 7.8-6.3-.2 4.2-3.3 6.5-7.8 6.3z" fill="#7cbc4b" />
    </svg>
  );
}

export interface ShopCardProps {
  /** Small line above the headline, e.g. the product's category. */
  eyebrow?: string | null;
  title: string;
  /** A line under the headline. */
  detail?: string | null;
  price?: { now: string; was: string | null } | null;
  photo: string | null;
  domain: string;
}

function titleSize(title: string): number {
  if (title.length > 60) return 44;
  if (title.length > 34) return 52;
  return 60;
}

/**
 * Draws the card and sends it as a JPEG: the renderer makes a PNG of over a
 * megabyte with a photo in it, and WhatsApp drops preview pictures much
 * bigger than 300 KB.
 */
export async function shopCard(card: ShopCardProps): Promise<Response> {
  const png = await (await drawCard(card)).arrayBuffer();
  const jpeg = await sharp(new Uint8Array(png)).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": CACHE_CONTROL } });
}

async function drawCard({ eyebrow, title, detail, price, photo, domain }: ShopCardProps): Promise<ImageResponse> {
  const loaded = await loadFonts();
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: COLORS.panel, fontFamily: TEXT_FONTS }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: photo ? OG_SIZE.width - PHOTO_SIZE : OG_SIZE.width,
            padding: "56px 56px 48px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Mark />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: "Manrope", fontSize: 34, color: COLORS.white, lineHeight: 1 }}>The Boamah&rsquo;s</span>
              <span style={{ fontSize: 18, color: COLORS.goldSoft, marginTop: 6 }}>Online Grocery Shop</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {eyebrow ? <span style={{ fontSize: 24, color: COLORS.goldSoft, marginBottom: 14 }}>{eyebrow}</span> : null}
            <span style={{ fontFamily: "Manrope", fontSize: titleSize(title), color: COLORS.white, lineHeight: 1.08, letterSpacing: -1 }}>{title}</span>
            {detail ? <span style={{ fontSize: 26, color: COLORS.soft, marginTop: 18, lineHeight: 1.35 }}>{detail}</span> : null}
            {price ? (
              <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
                <span style={{ fontSize: 54, fontWeight: 800, color: COLORS.gold, lineHeight: 1.1 }}>{price.now}</span>
                {price.was ? <span style={{ fontSize: 28, color: COLORS.strike, textDecoration: "line-through", marginTop: 4 }}>{price.was}</span> : null}
              </div>
            ) : null}
          </div>

          <span style={{ fontSize: 22, color: COLORS.soft }}>{domain}</span>
        </div>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not shown on a page
          <img src={photo} width={PHOTO_SIZE} height={PHOTO_SIZE} alt="" style={{ objectFit: "cover" }} />
        ) : null}
      </div>
    ),
    { ...OG_SIZE, fonts: loaded },
  );
}
