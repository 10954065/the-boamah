import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy. Paystack checkout is a full-page redirect, so no
// third-party scripts are required on our own pages.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.paystack.com",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

// Other names for the same site (www., plus REDIRECT_HOSTS such as the Railway
// address) send visitors to the main address in NEXT_PUBLIC_SITE_URL: one
// address for search engines, and sign-in only trusts its own origin. /api stays
// reachable on every name so payment webhooks and the order-expiry job keep working.
const siteHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").host;
  } catch {
    return "";
  }
})();
const aliasHosts = siteHost.startsWith("localhost")
  ? []
  : [siteHost.startsWith("www.") ? "" : `www.${siteHost}`, ...(process.env.REDIRECT_HOSTS ?? "").split(",")]
      .map((host) => host.trim().toLowerCase())
      .filter((host, index, all) => host && host !== siteHost && all.indexOf(host) === index);

// The in-shop till on its own subdomain (same rule as src/lib/pos-host.ts):
// its pages are the app's /pos section, while /_next, /api, product images and
// uploads are shared with the shop. Locally the till is simply at /pos.
const posHost =
  process.env.POS_HOST?.trim().toLowerCase() ||
  (siteHost && !siteHost.startsWith("localhost") && !siteHost.startsWith("127.") ? `pos.${siteHost.replace(/^www\./, "")}` : "");
const onPosHost = [{ type: "host" as const, value: posHost }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "live.staticflickr.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The till is for staff only and must never appear in search results.
      ...(posHost ? [{ source: "/:path*", has: onPosHost, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }] : []),
    ];
  },
  async redirects() {
    return [
      ...aliasHosts.map((host) => ({
        source: "/:path((?!api/).*)",
        has: [{ type: "host" as const, value: host }],
        destination: `https://${siteHost}/:path`,
        permanent: true,
      })),
      // The till opens on its own address (its sign-in cookie lives there).
      ...(posHost && siteHost
        ? [
            { source: "/pos", has: [{ type: "host" as const, value: siteHost }], destination: `https://${posHost}/pos`, permanent: false },
            { source: "/pos/:path*", has: [{ type: "host" as const, value: siteHost }], destination: `https://${posHost}/pos/:path*`, permanent: false },
          ]
        : []),
    ];
  },
  async rewrites() {
    if (!posHost) return [];
    return {
      beforeFiles: [
        { source: "/robots.txt", has: onPosHost, destination: "/pos-robots.txt" },
        { source: "/", has: onPosHost, destination: "/pos" },
        {
          source: "/:path((?!_next/|api/|images/|uploads/|pos/|pos$|pos-robots\\.txt$|icon\\.svg$).+)",
          has: onPosHost,
          destination: "/pos/:path",
        },
      ],
    };
  },
};

export default nextConfig;
