import { NextResponse, type NextRequest } from "next/server";
import { clientIpFrom } from "@/lib/client-ip";
import { posHost } from "@/lib/pos-host";
import {
  checkPass,
  ENTRY_PATH,
  entryScope,
  GATE_COOKIE,
  GATE_HOME,
  GATE_PASS_SECONDS,
  gateKey,
  gateRule,
  issuePass,
  type GateScope,
} from "@/lib/staff-gate";
import { createWindowLimiter } from "@/lib/window-limiter";

/**
 * Keeps the admin and the till hidden behind their private links (see
 * src/lib/staff-gate.ts). Pages and server actions still check the signed-in
 * user and their permissions themselves; this only decides who may see the
 * staff pages exist at all.
 */

const isProduction = process.env.NODE_ENV === "production";
/**
 * Wrong private links a visitor may try before they stop being answered for a
 * while. The right link always works: it cannot be guessed, and a stranger on
 * the same shared address must not be able to lock staff out.
 */
const WRONG_LINK_LIMIT = 10;
const WRONG_LINK_WINDOW_SECONDS = 15 * 60;
const wrongLinks = createWindowLimiter({ max: WRONG_LINK_LIMIT, windowMs: WRONG_LINK_WINDOW_SECONDS * 1000 });
let warnedNoKey = false;

/** The shop's normal "page not found", so a staff address looks like any other missing page. */
function notFound(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) return new NextResponse(null, { status: 404 });
  return NextResponse.rewrite(new URL("/_not-found-page", request.url));
}

function withPass(response: NextResponse, key: string, scope: GateScope, nowSeconds: number): NextResponse {
  response.cookies.set(GATE_COOKIE[scope], issuePass(key, scope, nowSeconds), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: GATE_PASS_SECONDS,
  });
  return response;
}

/** Opens a private link: gives this device the pass and sends it on to the staff page. */
function enter(request: NextRequest, key: string, host: string, tillHost: string, nowSeconds: number): NextResponse {
  const scope = entryScope(key, host, request.nextUrl.pathname, tillHost);
  if (!scope) {
    const ip = clientIpFrom(request.headers);
    const nowMs = nowSeconds * 1000;
    if (wrongLinks.blocked(ip, nowMs)) {
      return new NextResponse("Too many requests. Please try again later.", { status: 429, headers: { "Retry-After": String(WRONG_LINK_WINDOW_SECONDS) } });
    }
    wrongLinks.hit(ip, nowMs);
    return notFound(request);
  }
  const destination = request.nextUrl.clone();
  destination.pathname = GATE_HOME[scope];
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return withPass(response, key, scope, nowSeconds);
}

export function proxy(request: NextRequest): NextResponse {
  const key = gateKey();
  // Locally the gate stays open until a key is set; in production a missing key closes the staff pages.
  if (!key && !isProduction) return NextResponse.next();
  if (!key && !warnedNoKey) {
    warnedNoKey = true;
    console.error("STAFF_GATE_KEY is missing or shorter than 32 characters, so the admin, the till and staff sign-in are closed.");
  }

  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const tillHost = posHost();
  const { pathname } = request.nextUrl;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (key && ENTRY_PATH.test(pathname)) return enter(request, key, host, tillHost, nowSeconds);

  const rule = gateRule(host, pathname, tillHost);
  if (rule === null) return NextResponse.next();
  if (rule === "closed" || !key) return notFound(request);

  const scopes: GateScope[] = rule === "either" ? ["admin", "till"] : [rule];
  for (const scope of scopes) {
    const state = checkPass(key, scope, request.cookies.get(GATE_COOKIE[scope])?.value, nowSeconds);
    if (state === "valid") return NextResponse.next();
    if (state === "renew") return withPass(NextResponse.next(), key, scope, nowSeconds);
  }
  return notFound(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|images/|uploads/|favicon\\.ico).*)"],
};
