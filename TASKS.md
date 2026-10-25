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
- [~] Better Auth (email/password, password reset, DB sessions, rate limiting, suspension)
- [~] Security headers (CSP, HSTS in production, frame/sniff/referrer policies)

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
- [~] Transactional order creation, stock reservation, idempotency
- [~] Paystack initialise / verify / webhook (signature, dedupe, amount+currency checks) — needs merchant test keys for a live check; flow verified with the dev mock gateway
- [x] Cash on delivery (admin-controlled) — browser flow verified
- [~] Expiry of unpaid online orders (cron) with stock release
- [x] Confirmation page + guest order access (private token cookie / link) and public tracking

## 5. Customer account
- [x] Profile, addresses, order history, order detail + tracking timeline, wishlist, password change — browser-verified (register → wishlist → address)

## 6. Administration
- [ ] Dashboard metrics (paid revenue vs pending vs COD outstanding)
- [ ] Products & variants, images (upload), publish/archive
- [ ] Categories (order, deactivate, safe delete)
- [ ] Inventory adjustments + movement history + low stock
- [ ] Orders (filters, status updates, notes, COD collection, cancellation, history)
- [ ] Customers (search, history, suspend)
- [ ] Coupons and promo banners
- [ ] Delivery zones, store settings, policies
- [ ] Staff & roles (Super Admin only)
- [ ] Notifications log, audit log

## 7. Notifications & SEO
- [ ] Email templates (order, payment, status, cancellation, admin alert, password reset)
- [ ] Optional SMS adapter
- [ ] Metadata, canonical URLs, JSON-LD, sitemap, robots

## 8. Quality
- [ ] Integration tests (orders, inventory, coupons, payments, webhooks, permissions)
- [ ] Playwright E2E (storefront, cart, checkout, admin guard, responsive)
- [ ] Lint, typecheck, production build
- [ ] Deployment & operations documentation
