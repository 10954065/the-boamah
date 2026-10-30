import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Staff pages (the admin and the till) are hidden behind private links. Each
 * link is an HMAC of STAFF_GATE_KEY, so it is not in the code and changes when
 * the key does. Opening a link gives the device a signed pass cookie; without
 * it the staff pages, their sign-in forms and the sign-in API answer like a
 * page that does not exist. Signing in and permissions still apply on top.
 * See src/proxy.ts.
 */
export type GateScope = "admin" | "till";

/** What a request needs: one pass, either pass (locally both live on one address), no entry at all, or nothing. */
export type GateRule = GateScope | "either" | "closed" | null;

export const GATE_COOKIE: Record<GateScope, string> = { admin: "bm_staff_pass", till: "bm_till_pass" };
export const GATE_PASS_SECONDS = 90 * 24 * 60 * 60;
/** A pass older than a day is renewed on the next staff visit, so devices in use never run out. */
const RENEW_AFTER_SECONDS = 24 * 60 * 60;
const MIN_KEY_LENGTH = 32;
const SLUG_LENGTH = 32;

/** Paths shaped like a private link: one segment of 32 link-safe characters. */
export const ENTRY_PATH = /^\/[A-Za-z0-9_-]{32}$/;

/** Where each private link leads once the pass is given. */
export const GATE_HOME: Record<GateScope, string> = { admin: "/admin", till: "/pos" };

/** The sign-in API is gated too, so the forms cannot be skipped by calling it directly. */
const GATED_AUTH_API = ["/api/auth/sign-in", "/api/auth/sign-up", "/api/auth/request-password-reset", "/api/auth/forget-password"];
const STAFF_AUTH_PAGES = new Set(["/login", "/forgot-password"]);
/** Files the till's own address serves to everyone: page assets and the offline helper. */
const TILL_HOST_OPEN = /^\/(?:_next\/|images\/|uploads\/|pos-sw\.js$|pos-manifest\.webmanifest$|icon\.svg$|favicon\.ico$|robots\.txt$|pos-robots\.txt$)/;

export function gateKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.STAFF_GATE_KEY?.trim() ?? "";
  return key.length >= MIN_KEY_LENGTH ? key : null;
}

function sign(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("base64url");
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function entrySlug(key: string, scope: GateScope): string {
  return sign(key, `entry:${scope}`).slice(0, SLUG_LENGTH);
}

export function issuePass(key: string, scope: GateScope, nowSeconds: number): string {
  const expires = nowSeconds + GATE_PASS_SECONDS;
  return `${expires}.${sign(key, `pass:${scope}:${expires}`)}`;
}

export type PassState = "valid" | "renew" | "invalid";

export function checkPass(key: string, scope: GateScope, value: string | undefined, nowSeconds: number): PassState {
  const match = value ? /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value) : null;
  if (!match) return "invalid";
  const expires = Number(match[1]);
  if (expires <= nowSeconds || expires > nowSeconds + GATE_PASS_SECONDS) return "invalid";
  if (!sameText(match[2]!, sign(key, `pass:${scope}:${expires}`))) return "invalid";
  return expires - nowSeconds < GATE_PASS_SECONDS - RENEW_AFTER_SECONDS ? "renew" : "valid";
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Which pass a request needs. `tillHost` is the till's own address, or ""
 * when the till is served at /pos on the shop's address (locally).
 */
export function gateRule(host: string, pathname: string, tillHost: string): GateRule {
  const onTillHost = tillHost !== "" && host === tillHost;
  if (GATED_AUTH_API.some((prefix) => isUnder(pathname, prefix))) return onTillHost ? "till" : tillHost ? "admin" : "either";
  if (isUnder(pathname, "/api")) return null;
  if (onTillHost) return TILL_HOST_OPEN.test(pathname) ? null : "till";
  // The till only opens on its own address once it has one.
  if (isUnder(pathname, "/pos")) return tillHost ? "closed" : "till";
  if (isUnder(pathname, "/admin")) return "admin";
  if (STAFF_AUTH_PAGES.has(pathname)) return tillHost ? "admin" : "either";
  return null;
}

/** Which private link a path is, on this address, or null when it is not one. */
export function entryScope(key: string, host: string, pathname: string, tillHost: string): GateScope | null {
  if (!ENTRY_PATH.test(pathname)) return null;
  const slug = pathname.slice(1);
  const onTillHost = tillHost !== "" && host === tillHost;
  if (onTillHost) return sameText(slug, entrySlug(key, "till")) ? "till" : null;
  if (sameText(slug, entrySlug(key, "admin"))) return "admin";
  if (!tillHost && sameText(slug, entrySlug(key, "till"))) return "till";
  return null;
}
