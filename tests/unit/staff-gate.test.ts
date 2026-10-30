import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clientIpFrom } from "@/lib/client-ip";
import { checkPass, ENTRY_PATH, entryScope, entrySlug, GATE_COOKIE, GATE_PASS_SECONDS, gateKey, gateRule, issuePass } from "@/lib/staff-gate";
import { createWindowLimiter } from "@/lib/window-limiter";
import { proxy } from "@/proxy";

const KEY = "a-test-key-that-is-long-enough-for-the-gate";
const OTHER_KEY = "another-test-key-that-is-long-enough-too";
const NOW = 1_800_000_000;
const SHOP = "shop.example";
const TILL = "till.example";

describe("private links", () => {
  test("are the same every time, look like a link and differ per scope and key", () => {
    const admin = entrySlug(KEY, "admin");
    expect(entrySlug(KEY, "admin")).toBe(admin);
    expect(ENTRY_PATH.test(`/${admin}`)).toBe(true);
    expect(entrySlug(KEY, "till")).not.toBe(admin);
    expect(entrySlug(OTHER_KEY, "admin")).not.toBe(admin);
  });

  test("a key shorter than 32 characters is not accepted", () => {
    expect(gateKey({ STAFF_GATE_KEY: "short" })).toBeNull();
    expect(gateKey({})).toBeNull();
    expect(gateKey({ STAFF_GATE_KEY: `  ${KEY}  ` })).toBe(KEY);
  });

  test("each link only opens on its own address once the till has one", () => {
    const admin = `/${entrySlug(KEY, "admin")}`;
    const till = `/${entrySlug(KEY, "till")}`;
    expect(entryScope(KEY, SHOP, admin, TILL)).toBe("admin");
    expect(entryScope(KEY, TILL, till, TILL)).toBe("till");
    expect(entryScope(KEY, SHOP, till, TILL)).toBeNull();
    expect(entryScope(KEY, TILL, admin, TILL)).toBeNull();
    // Locally both live on one address.
    expect(entryScope(KEY, "localhost", till, "")).toBe("till");
    expect(entryScope(KEY, "localhost", admin, "")).toBe("admin");
    expect(entryScope(KEY, SHOP, `/${"x".repeat(32)}`, TILL)).toBeNull();
  });
});

describe("passes", () => {
  test("a fresh pass is valid for its scope only", () => {
    const pass = issuePass(KEY, "admin", NOW);
    expect(checkPass(KEY, "admin", pass, NOW)).toBe("valid");
    expect(checkPass(KEY, "till", pass, NOW)).toBe("invalid");
    expect(checkPass(OTHER_KEY, "admin", pass, NOW)).toBe("invalid");
  });

  test("a changed, missing or badly formed pass is refused", () => {
    const pass = issuePass(KEY, "admin", NOW);
    const [expires, signature] = pass.split(".");
    expect(checkPass(KEY, "admin", undefined, NOW)).toBe("invalid");
    expect(checkPass(KEY, "admin", "", NOW)).toBe("invalid");
    expect(checkPass(KEY, "admin", "nonsense", NOW)).toBe("invalid");
    expect(checkPass(KEY, "admin", `${Number(expires) + 1}.${signature}`, NOW)).toBe("invalid");
    expect(checkPass(KEY, "admin", `${expires}.${"A".repeat(43)}`, NOW)).toBe("invalid");
  });

  test("a pass ends after 90 days and is renewed once it is a day old", () => {
    const pass = issuePass(KEY, "till", NOW);
    expect(checkPass(KEY, "till", pass, NOW + 60 * 60)).toBe("valid");
    expect(checkPass(KEY, "till", pass, NOW + 2 * 24 * 60 * 60)).toBe("renew");
    expect(checkPass(KEY, "till", pass, NOW + GATE_PASS_SECONDS)).toBe("invalid");
  });

  test("a pass from too far in the future is refused", () => {
    const pass = issuePass(KEY, "admin", NOW + GATE_PASS_SECONDS);
    expect(checkPass(KEY, "admin", pass, NOW)).toBe("invalid");
  });
});

describe("which addresses need a pass", () => {
  test.each([
    ["/admin", "admin"],
    ["/admin/orders/123", "admin"],
    ["/login", "admin"],
    ["/forgot-password", "admin"],
    ["/api/auth/sign-in/email", "admin"],
    ["/api/auth/sign-up/email", "admin"],
    ["/api/auth/request-password-reset", "admin"],
    ["/pos", "closed"],
    ["/pos/login", "closed"],
  ])("on the shop's address %s needs %s", (path, rule) => {
    expect(gateRule(SHOP, path, TILL)).toBe(rule);
  });

  test.each(["/", "/shop", "/products/rice", "/checkout", "/track-order", "/reset-password", "/administrator", "/api/search", "/api/auth/get-session", "/api/payments/paystack/webhook", "/api/pos/catalog"])(
    "on the shop's address %s is open",
    (path) => {
      expect(gateRule(SHOP, path, TILL)).toBeNull();
    },
  );

  test.each([
    ["/pos", "till"],
    ["/pos/login", "till"],
    ["/pos/forgot-password", "till"],
    ["/login", "till"],
    ["/forgot-password", "till"],
    ["/anything", "till"],
    ["/api/auth/sign-in/email", "till"],
  ])("on the till's address %s needs %s", (path, rule) => {
    expect(gateRule(TILL, path, TILL)).toBe(rule);
  });

  test.each(["/_next/data/x.json", "/images/a.png", "/uploads/b.jpg", "/pos-sw.js", "/pos-manifest.webmanifest", "/icon.svg", "/robots.txt", "/pos-robots.txt", "/api/pos/catalog", "/api/auth/get-session"])(
    "on the till's address %s is open, so a saved till keeps working",
    (path) => {
      expect(gateRule(TILL, path, TILL)).toBeNull();
    },
  );

  test("locally either pass opens the shared sign-in", () => {
    expect(gateRule("localhost", "/login", "")).toBe("either");
    expect(gateRule("localhost", "/forgot-password", "")).toBe("either");
    expect(gateRule("localhost", "/api/auth/sign-in/email", "")).toBe("either");
    expect(gateRule("localhost", "/pos/login", "")).toBe("till");
    expect(gateRule("localhost", "/admin", "")).toBe("admin");
  });
});

describe("the request gate", () => {
  const request = (host: string, path: string, options: { cookie?: string; ip?: string } = {}) =>
    new NextRequest(`https://${host}${path}`, {
      headers: { host, "x-real-ip": options.ip ?? "10.0.0.1", ...(options.cookie ? { cookie: options.cookie } : {}) },
    });
  const isNotFound = (response: Response) => response.headers.has("x-middleware-rewrite") || response.status === 404;
  const passes = (response: Response) => response.headers.get("x-middleware-next") === "1";

  beforeEach(() => {
    vi.stubEnv("STAFF_GATE_KEY", KEY);
    vi.stubEnv("POS_HOST", TILL);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", `https://${SHOP}`);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("hides staff pages and answers the sign-in API with a plain 404", () => {
    expect(isNotFound(proxy(request(SHOP, "/admin")))).toBe(true);
    expect(isNotFound(proxy(request(SHOP, "/login")))).toBe(true);
    expect(isNotFound(proxy(request(SHOP, "/pos/login")))).toBe(true);
    expect(isNotFound(proxy(request(TILL, "/pos/login")))).toBe(true);
    expect(proxy(request(SHOP, "/api/auth/sign-in/email")).status).toBe(404);
  });

  test("leaves shoppers' pages alone", () => {
    expect(passes(proxy(request(SHOP, "/")))).toBe(true);
    expect(passes(proxy(request(SHOP, "/checkout")))).toBe(true);
  });

  test("the private link gives a pass and goes to the admin, without showing the key", () => {
    const response = proxy(request(SHOP, `/${entrySlug(KEY, "admin")}`));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/admin");
    const cookie = response.cookies.get(GATE_COOKIE.admin);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.value).not.toContain(KEY);
    expect(passes(proxy(request(SHOP, "/admin", { cookie: `${GATE_COOKIE.admin}=${cookie?.value}` })))).toBe(true);
  });

  test("the till link gives a till pass that does not open the admin", () => {
    const response = proxy(request(TILL, `/${entrySlug(KEY, "till")}`));
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/pos");
    const cookie = `${GATE_COOKIE.till}=${response.cookies.get(GATE_COOKIE.till)?.value}`;
    expect(passes(proxy(request(TILL, "/pos/login", { cookie })))).toBe(true);
    expect(isNotFound(proxy(request(SHOP, "/admin", { cookie })))).toBe(true);
  });

  test("an old pass is renewed on a visit", () => {
    const old = issuePass(KEY, "admin", Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60);
    const response = proxy(request(SHOP, "/admin", { cookie: `${GATE_COOKIE.admin}=${old}` }));
    expect(passes(response)).toBe(true);
    expect(response.cookies.get(GATE_COOKIE.admin)?.value).not.toBe(old);
  });

  test("ten wrong links stop further wrong tries from that visitor, and the right link still opens", () => {
    const ip = "10.9.9.9";
    const wrong = `/${"w".repeat(32)}`;
    for (let attempt = 0; attempt < 10; attempt++) expect(isNotFound(proxy(request(SHOP, wrong, { ip })))).toBe(true);
    expect(proxy(request(SHOP, wrong, { ip })).status).toBe(429);
    expect(proxy(request(SHOP, `/${entrySlug(KEY, "admin")}`, { ip })).status).toBe(303);
    // Someone else is not affected.
    expect(isNotFound(proxy(request(SHOP, wrong, { ip: "10.9.9.10" })))).toBe(true);
  });

  test("with no key the gate stays open for local work", () => {
    vi.stubEnv("STAFF_GATE_KEY", "");
    expect(passes(proxy(request("localhost", "/admin")))).toBe(true);
  });
});

describe("the wrong link counter", () => {
  test("blocks after the limit and clears when the window ends", () => {
    const limiter = createWindowLimiter({ max: 2, windowMs: 1000 });
    expect(limiter.blocked("a", 0)).toBe(false);
    limiter.hit("a", 0);
    limiter.hit("a", 10);
    expect(limiter.blocked("a", 20)).toBe(true);
    expect(limiter.blocked("b", 20)).toBe(false);
    expect(limiter.blocked("a", 1001)).toBe(false);
  });

  test("never holds more keys than allowed", () => {
    const limiter = createWindowLimiter({ max: 1, windowMs: 1000, maxKeys: 3 });
    for (const key of ["a", "b", "c", "d"]) limiter.hit(key, 0);
    expect(limiter.blocked("a", 1)).toBe(false);
    expect(limiter.blocked("d", 1)).toBe(true);
  });
});

describe("the visitor's address", () => {
  test("comes from X-Real-IP, which the host sets, not the visitor's X-Forwarded-For", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "6.6.6.6, 1.1.1.1" }))).toBe("1.1.1.1");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
