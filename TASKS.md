# Implementation checklist — The Boamah's Online Grocery Shop

A feature is only ticked when its behaviour is implemented **and** verified
(tests or a recorded manual/browser check). `[~]` = implemented, verification pending.

## 1. Foundation
- [x] Next.js (App Router) + TypeScript strict + Tailwind v4 project
- [x] Design tokens (forest green / leaf green / warm white / gold), Inter + Manrope
- [x] Brand mark, typographic logo, favicon
- [x] PostgreSQL via Docker for local development (`docker-compose.yml`)
- [x] Prisma 7 schema covering all business entities + reproducible migrations
- [x] Database integrity constraints (non-negative stock/prices, total consistency)
- [x] Integer money (pesewas) and quantity (milli-units) helpers — unit tested
- [x] Pricing engine: sale prices, coupons, delivery fees, totals — unit tested
- [x] Order status state machine — unit tested
- [x] Role → permission map, enforced server-side — unit tested
- [~] Better Auth (email/password, password reset, DB sessions, rate limiting, suspension) — registration, sign-in and access guards verified in E2E; reset emails need RESEND_API_KEY to check delivery
- [x] Security headers (CSP, HSTS in production, frame/sniff/referrer/permissions policies) — checked on a production build

## 2. Storefront
- [x] Store layout: announcement bar, header (search, account, cart), category nav, mobile menu, footer — browser-checked desktop + mobile
- [x] Homepage: hero, categories, featured/best sellers/new arrivals, promo banners, trust section, newsletter — no overflow at 390px/1440px
- [x] Shop page: search, category/price/availability filters, sorting, pagination, URL state
- [x] Product detail: gallery, variants, quantity rules, stock state, related products
- [x] Wishlist (authenticated, persisted) — browser-verified
- [x] Policy, contact and image-credit pages

## 3. Cart
- [x] DB-backed cart for guests (httpOnly cookie token) and customers — browser flow verified
- [~] Guest cart merge on sign-in
- [~] Revalidation against live prices/stock with price-change notices

## 4. Checkout, orders & payments
- [x] Checkout form (delivery zones / pickup), coupon, server-side totals — min-order block verified
- [x] Transactional order creation, stock reservation, idempotency — integration-tested, incl. concurrent purchase of the last item
- [x] Payment verification and webhook rules (signature, dedupe, amount+currency checks, late payments) — integration-tested with the Paystack API stubbed; checkout flow E2E-tested with the mock gateway
- [ ] Live check against Paystack test mode — needs the merchant's sk_test_ key (see docs/DEPLOYMENT.md)
- [x] Cash on delivery (admin-controlled) — browser flow verified
- [x] Expiry of unpaid online orders (cron) with stock release — integration-tested; cron endpoint rejects unauthenticated calls
- [x] Confirmation page + guest order access (private token cookie / link) and public tracking

## 5. Customer account
- [x] Profile, addresses, order history, order detail + tracking timeline, wishlist, password change — browser-verified (register → wishlist → address)

## 6. Administration
- [x] Dashboard metrics (paid revenue vs pending vs COD outstanding) — figures checked against data
- [~] Products & variants, images (upload), publish/archive
- [~] Categories (order, deactivate, safe delete)
- [x] Inventory adjustments + movement history + low stock — browser-verified receipt
- [x] Orders (filters, status updates, notes, COD collection, cancellation, history) — browser-verified status + cash
- [~] Customers (search, history, suspend)
- [~] Coupons and promo banners
- [~] Delivery zones, store settings, policies
- [~] Staff & roles (Super Admin only)
- [x] Notifications log, audit log

## 7. Notifications & SEO
- [~] Email templates (order, payment, status, cancellation, admin alert, password reset) — outcomes recorded; delivery needs RESEND_API_KEY
- [~] Optional SMS adapter (Arkesel) — needs provider credentials
- [x] Metadata, canonical URLs, JSON-LD, sitemap, robots

## 8. Quality
- [x] Unit tests — 57 passing (money, quantities, pricing, coupons, order states, permissions, security helpers)
- [x] Integration tests — 17 passing against Postgres (orders, inventory, coupons, cash, expiry, payments, webhooks)
- [x] Playwright E2E — 34 passing (storefront, search, cart, checkout, payments, access control, 320–1440 px layout); storefront/access/responsive specs also pass against a production build
- [x] Lint, typecheck, production build; npm audit clean (Next.js, Zod and Prisma security patches applied)
- [x] Deployment & operations documentation — README.md, docs/DEPLOYMENT.md

## 9. Growth features
- [x] Bulk prices per option, applied in cart and at checkout from the database
- [x] "Buy again" on past orders
- [x] "Tell me when it's back" alerts, sent once on restock or cancellation
- [x] Verified-buyer reviews with staff approval, star ratings and rating data for search engines
- [x] WhatsApp chat button on every page

## Open items
- [ ] Business content before launch: real prices and stock, delivery zones and fees, pickup details, contact details, policy texts, tax treatment (checklist in docs/DEPLOYMENT.md)
- [ ] "Refunded" order status: paid orders cannot be cancelled in the admin; refunds are made in Paystack and noted on the order
- [ ] Confirm the Vercel plan allows the 15-minute cron, or use an external scheduler
- [ ] Email and SMS delivery checks once Resend / Arkesel credentials exist
- [ ] Set the shop's WhatsApp number in Admin → Settings
- [ ] Real bulk prices for each product (the sample rice and oil tiers are placeholders)
