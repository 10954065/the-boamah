/**
 * Where the in-shop till lives: its own subdomain in production
 * (pos.<shop domain>, or POS_HOST), and plain /pos on localhost. The same
 * rule is applied in next.config.ts, which routes that subdomain to /pos.
 */
export function posHost(): string {
  const explicit = process.env.POS_HOST?.trim().toLowerCase();
  if (explicit) return explicit;
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").host;
    if (!host || host.startsWith("localhost") || host.startsWith("127.")) return "";
    return `pos.${host.replace(/^www\./, "")}`;
  } catch {
    return "";
  }
}

/** Absolute origin of the till subdomain, or "" when the till is served at /pos on this host. */
export function posOrigin(): string {
  const host = posHost();
  return host ? `https://${host}` : "";
}

/** Link to a till page, e.g. posUrl("/pos") -> https://pos.example.com/pos (or /pos locally). */
export function posUrl(path: `/pos${string}`): string {
  return `${posOrigin()}${path}`;
}
