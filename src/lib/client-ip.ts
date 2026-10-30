/**
 * The visitor's IP address from proxy headers. Railway's edge (like Vercel's)
 * sets X-Real-IP itself and replaces any copy the visitor sends, while the
 * first X-Forwarded-For entry is whatever the visitor typed, so X-Real-IP
 * wins. Rate limits key on this.
 */
export function clientIpFrom(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** The same order for Better Auth's own rate limits (src/server/auth.ts). */
export const CLIENT_IP_HEADERS = ["x-real-ip", "x-forwarded-for"];
