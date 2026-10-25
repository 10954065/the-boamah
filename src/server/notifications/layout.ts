import "server-only";
import type { StoreSettings } from "@/generated/prisma/client";
import { siteUrl } from "@/lib/utils";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface LayoutInput {
  settings: StoreSettings;
  preheader: string;
  heading: string;
  /** Pre-escaped HTML body. */
  bodyHtml: string;
  bodyText: string;
  cta?: { label: string; url: string };
}

/**
 * Branded, table-based email shell (renders consistently across clients).
 * All dynamic values passed in must already be escaped with escapeHtml.
 */
export function renderLayout({ settings, preheader, heading, bodyHtml, bodyText, cta }: LayoutInput): { html: string; text: string } {
  const storeName = escapeHtml(settings.storeName);
  const contactBits = [settings.contactPhone, settings.contactEmail].filter(Boolean).map((v) => escapeHtml(String(v)));
  const ctaHtml = cta
    ? `<tr><td style="padding:8px 0 24px"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#174d33;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px;font-size:15px">${escapeHtml(cta.label)}</a></td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;background:#f4f2ec;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1d2320">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ec;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e3db;border-radius:10px">
<tr><td style="padding:22px 28px;border-bottom:1px solid #e6e3db">
<a href="${escapeHtml(siteUrl("/"))}" style="text-decoration:none;color:#174d33;font-weight:800;font-size:18px">${storeName}</a>
</td></tr>
<tr><td style="padding:28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:12px;color:#0f3022">${escapeHtml(heading)}</td></tr>
<tr><td style="font-size:15px;line-height:24px;color:#3b423e;padding-bottom:16px">${bodyHtml}</td></tr>
${ctaHtml}
</table>
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e6e3db;font-size:12px;line-height:18px;color:#858c87">
${storeName}${contactBits.length ? `<br>${contactBits.join(" · ")}` : ""}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    settings.storeName,
    "",
    heading,
    "",
    bodyText,
    cta ? `\n${cta.label}: ${cta.url}` : "",
    "",
    [settings.contactPhone, settings.contactEmail].filter(Boolean).join(" · "),
  ]
    .join("\n")
    .trim();

  return { html, text };
}
