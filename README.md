# The Boamah's Online Grocery Shop

An online grocery store for Ghana: customers browse and search groceries, buy by
the piece, pack or weight, and pay online with Paystack (mobile money and cards)
or by cash on delivery. Staff run the shop from an admin dashboard: products,
stock, orders, customers, coupons, banners, delivery zones and settings.

Prices are in Ghana cedis (GHS) and are stored as whole pesewas. All totals are
calculated on the server.

> **The database seed is sample data.** Product prices, delivery zones and fees,
> the WELCOME10 coupon and the sample orders are placeholders for development.
> Replace them with the shop's real figures before launch. See
> [Before going live](docs/DEPLOYMENT.md#before-going-live).

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Run it locally](#run-it-locally)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Tests](#tests)
- [Staff roles](#staff-roles)
- [How orders, stock and payments work](#how-orders-stock-and-payments-work)
- [Project layout](#project-layout)
- [Deployment](docs/DEPLOYMENT.md)

## Features

**Storefront**: homepage with hero banners, categories, featured, best-selling,
new and discounted products. Search with suggestions. Shop and category pages
with filters (category, price, in stock, on sale) and sorting, with all state in
the URL. Product pages with a gallery, variants (for example 1 kg / 5 kg), units
(piece, pack, kg, g, litre, bunch, crate…), quantity steps and stock status.
Bulk prices ("5 bags or more: GH₵420 each") shown live as the quantity changes.
"Tell me when it's back" sign-up on out-of-stock items. Star ratings and reviews
from verified buyers, published after staff approval. A WhatsApp chat button on
every page, with the product already named in the message on product pages.
A hero grid that rotates through the live catalogue, category banners, star
ratings on product cards, quick view, "Often bought together" from real orders,
and sale countdowns for sale prices with an end date. A slide-out cart with a
free-delivery progress bar, plus an add-to-cart bar and an app-style bottom menu
on phones. Accepted payment methods are shown in the cart, at checkout and in
the footer.
Policy, contact and image-credit pages.

**Cart and checkout**: database-backed cart for guests and signed-in customers.
A guest cart merges into the account on sign-in. Prices and stock are checked
again whenever the cart is shown and at checkout. Checkout offers delivery by
zone (fee, minimum order, free-delivery threshold) or pickup, coupons, and
Paystack or cash on delivery. Guests can check out and track orders by
reference.

**Customer account**: profile, saved addresses, order history with a status
timeline, "Buy again" to put a past order back in the cart, retrying an unpaid
payment, wishlist, password change and reset.

**Admin dashboard** (`/admin`): sales metrics that keep paid revenue, pending
payments and cash-on-delivery outstanding apart. Products and variants with image
upload and bulk prices, categories, inventory with an audited movement history,
low-stock list and how many shoppers are waiting for each item, review
moderation, orders (filters, status changes, notes, cash collection, cancellation),
customers (history, suspension), coupons, promotional banners, delivery zones,
store settings and policies, staff roles, notification log and audit log.

**Also included**: transactional email via Resend (order, payment, status,
cancellation, password reset, new-order alert to staff), optional SMS via
Arkesel, SEO metadata with JSON-LD, a sitemap index with page, category and
product sitemaps (including product and category images), robots.txt,
security headers, rate limiting and server-side permission checks.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Actions), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4, Radix primitives, lucide icons |
| Database | PostgreSQL 17, Prisma 7 (`@prisma/adapter-pg`) |
| Auth | Better Auth (email + password, database sessions) |
| Payments | Paystack (REST API + signed webhooks) |
| Email / SMS | Resend / Arkesel (both optional) |
| File storage | Vercel Blob or a persistent disk such as a Railway volume (local `public/uploads` in development) |
| Tests | Vitest (unit + integration against Postgres), Playwright (E2E) |
| Hosting | Railway (site, database, volume and cron service) or Vercel with Vercel Cron |

## Run it locally

You need **Node.js 20.19 or newer** and **Docker** (for PostgreSQL).

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Configure the environment
cp .env.example .env
#    then set BETTER_AUTH_SECRET (openssl rand -base64 32) and CRON_SECRET.
#    For testing checkout without Paystack keys, set PAYMENTS_MOCK=true.

# 3. Start PostgreSQL (port 5439; also creates the boamah_test database)
npm run db:up

# 4. Create the schema and load sample data
npm run db:deploy
npm run db:seed

# 5. Create the first Super Admin (see below)
npm run admin:create -- --email you@example.com --name "Your Name"

# 6. Start the app on http://localhost:3000
npm run dev
```

If you run the dev server on a different port, change `NEXT_PUBLIC_SITE_URL`
and `BETTER_AUTH_URL` to match it. Sign-in requests from any other origin are
rejected.

### Creating the first admin

There is no default admin account in any environment. Create one with:

```bash
npm run admin:create -- --email owner@example.com --name "Owner Name"
```

- With no `ADMIN_PASSWORD` set, the script generates a strong password and
  prints it **once**. Sign in and change it under *Account → Settings*.
- To choose the password, set `ADMIN_PASSWORD` (12+ characters) for that one
  command.
- If the email already belongs to an account, that account is promoted to
  Super Admin and keeps its password.

After that, the Super Admin gives other staff their roles from *Admin → Staff*.
Each person first registers a normal account.

### Testing payments without Paystack

With `PAYMENTS_MOCK=true` and no `PAYSTACK_SECRET_KEY`, "Pay online" goes to a
local page (`/dev/mock-pay`) where you choose a successful or failed payment.
The result then goes through the same server-side verification as a real
payment. The mock gateway is **refused in production builds** (the page returns
404), so it cannot take the place of a real payment on a live site.

## Environment variables

All variables are documented in [.env.example](.env.example). Never commit `.env`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Yes | Public base URL, no trailing slash. Used in payment callbacks, canonical URLs, sitemap and emails. |
| `REDIRECT_HOSTS` | No | Comma-separated other addresses of the same site (e.g. the Railway address) that redirect to `NEXT_PUBLIC_SITE_URL`. `www.` is redirected automatically. `/api` is never redirected. |
| `DATABASE_URL` | Yes | PostgreSQL connection used by the app (pooled connection string in production). |
| `DIRECT_DATABASE_URL` | Production | Direct (non-pooled) connection used only by Prisma migrations. Empty locally. |
| `TEST_DATABASE_URL` | Tests | Disposable database for integration tests. It is wiped and migrated on every run. |
| `BETTER_AUTH_SECRET` | Yes | Long random secret for sessions (`openssl rand -base64 32`). |
| `BETTER_AUTH_URL` | Yes | Same origin as the site. |
| `PAYSTACK_SECRET_KEY` | For online payment | `sk_test_…` while testing, `sk_live_…` when live. Without it, online payment is hidden. |
| `PAYMENTS_MOCK` | No | `true` enables the local mock gateway (development only). |
| `RESEND_API_KEY` | For email | Without it, emails are recorded as *Skipped* in *Admin → Notifications*. |
| `EMAIL_FROM` | For email | Sender on a domain verified in Resend, e.g. `Boamah's Grocery <orders@yourdomain>`. |
| `SMS_PROVIDER` | No | `none` (default) or `arkesel`. |
| `SMS_API_KEY`, `SMS_SENDER_ID` | For SMS | Arkesel API key and approved sender ID. |
| `BLOB_READ_WRITE_TOKEN` | Production uploads (or `UPLOAD_DIR`) | Vercel Blob token. Takes priority over `UPLOAD_DIR`. |
| `UPLOAD_DIR` | Production uploads (or Blob) | Folder on a persistent disk, e.g. `/data/uploads` on a Railway volume. With neither set, production image uploads are refused. |
| `CRON_SECRET` | Yes | Bearer token for `/api/cron/expire-orders`, sent by Vercel Cron or `scripts/expire-orders.mjs`. |
| `STOREFRONT_CACHE_SECONDS` | No | How long shared storefront data (catalogue, categories, banners, settings, reviews) is reused between shoppers. Default 60 in production, 0 (off) in development. Admin changes clear it at once. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:up` | Start PostgreSQL in Docker |
| `npm run db:migrate` | Create a new migration after changing `prisma/schema.prisma` (development) |
| `npm run db:deploy` | Apply pending migrations (any environment) |
| `npm run db:seed` | Load sample data (refuses to run in production unless `SEED_ALLOW_PRODUCTION=true`) |
| `npm run db:reset` | Drop and recreate the local database. **Deletes all data** |
| `npm run admin:create` | Create or promote a Super Admin |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests against `TEST_DATABASE_URL` |
| `npm run test:all` | Unit + integration |
| `npm run test:e2e` | Playwright end-to-end tests |

## Tests

```bash
npm test                  # 91 unit tests: money, quantities, pricing, coupons, order states,
                          # permissions, security helpers, storefront cache
npm run test:integration  # 22 tests against a real Postgres: order creation, overselling, idempotency,
                          # coupon limits, cancellation, cash, expiry, payment verification, webhooks
npm run test:e2e          # 52 browser tests: storefront, search, cart, checkout (cash and mock online
                          # payment), access control, layout at 320–1440 px on desktop and mobile
```

- Integration tests need `TEST_DATABASE_URL` pointing at a **disposable**
  database. `docker-compose` creates `boamah_test` for this.
- E2E tests need a seeded database (`npm run db:seed`). Playwright starts its
  own dev server on port 3217 with mock payments enabled. To test an already
  running server instead, set `E2E_BASE_URL` (the checkout payment test then
  needs `PAYMENTS_MOCK=true` on that server). A production build reuses
  storefront data for 60 seconds and several tests change the database
  directly, so start such a server with `STOREFRONT_CACHE_SECONDS=0`. Install
  the browser once with `npx playwright install chromium`.

## Staff roles

Permissions are checked on the server for every admin page and action. Hiding a
button is never the only protection.

| Role | Can do |
| --- | --- |
| Super Admin | Everything, including giving and removing staff roles |
| Store Manager | Everything except managing staff (including approving reviews) |
| Order Manager | Dashboard, view catalogue, manage orders (status, cancel, record cash), view customers and notifications |
| Inventory Manager | Dashboard, view catalogue, adjust stock, view orders |
| Customer | Storefront and own account only |

Suspended accounts cannot sign in, and their existing sessions stop working.

## How orders, stock and payments work

- **Prices come from the database.** The browser never sends a price. If the
  total changes between the checkout page and *Place order* (a price, stock,
  coupon or fee changed), the order is refused and the customer sees the new
  total.
- **No overselling.** Stock is reserved inside the same database transaction
  that creates the order, using a conditional update. When two customers buy the
  last item at once, exactly one succeeds (covered by an integration test).
- **One order per checkout attempt.** Each checkout carries an idempotency key,
  so a double click or a retry cannot create two orders.
- **Paid only after verification.** An order is marked paid only after the
  server verifies the transaction with Paystack and the amount and currency
  match the order. A browser redirect alone never marks an order paid. Webhooks
  are checked against Paystack's HMAC signature and stored once per event, so a
  repeated delivery has no effect.
- **Unpaid online orders expire.** Online orders not paid in time are cancelled
  and their stock is returned. The window is set in *Admin → Settings*
  ("Unpaid online orders are released after", default 60 minutes). Before
  cancelling, the job checks with Paystack once more.
- **Late payments are not applied silently.** If a payment is verified after
  its order was cancelled, the order gets an automatic note and staff receive
  an email alert, so they can refund the customer or fulfil the order by hand.
- **Paid orders cannot be cancelled in the admin.** Refunds are made in the
  Paystack dashboard. The app does not yet have a "refunded" status, so a
  refunded order has to be noted on the order (*Add note*) for now.
- **Cash on delivery** is recorded by staff when collected, once, and for the
  exact order total.

## Project layout

```text
prisma/            schema, migrations, sample seed data
scripts/           create-admin CLI, Docker database init
src/app/           routes: (store) storefront, (auth) sign-in pages, admin/, api/
src/actions/       server actions (validated with zod, permission-checked)
src/server/        business logic: catalog, cart, checkout, orders, inventory,
                   payments, notifications, settings, auth, rate limiting
src/lib/           shared pure helpers: money, quantities, pricing, permissions
src/components/    UI: ui/ primitives, store/, admin/, account/, layout/
tests/             unit/ and integration/ (Vitest)
e2e/               Playwright specs
public/images/     product and banner photos (credits: src/data/image-credits.json, /credits)
```

Product photos come from Wikimedia Commons under public-domain, CC0 or Creative
Commons licences, with attribution on the `/credits` page. Replace them with
the shop's own photos when available.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for hosting on Railway (site,
database, image volume and cron service in one project) or on Vercel, plus
Paystack (test and live), Resend, image storage, the cron job, and the
checklist of business decisions needed before launch.
