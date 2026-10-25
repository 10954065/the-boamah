# Deploying The Boamah's Online Grocery Shop

This guide takes the shop from the GitHub repository to a live site on Vercel
with a managed PostgreSQL database, Paystack payments and email.

- [What production needs](#what-production-needs)
- [1. Database](#1-database)
- [2. Vercel project](#2-vercel-project)
- [3. Scheduled job (unpaid order expiry)](#3-scheduled-job-unpaid-order-expiry)
- [4. Paystack](#4-paystack)
- [5. Email (Resend)](#5-email-resend)
- [6. Image uploads (Vercel Blob)](#6-image-uploads-vercel-blob)
- [7. SMS (optional)](#7-sms-optional)
- [8. First admin and store set-up](#8-first-admin-and-store-set-up)
- [9. Search engines](#9-search-engines)
- [Before going live](#before-going-live)
- [Running the shop](#running-the-shop)
- [Updates and rollbacks](#updates-and-rollbacks)

## What production needs

| Piece | Used for | Without it |
| --- | --- | --- |
| PostgreSQL (e.g. Neon or Supabase) | All data | The site cannot run |
| Vercel project | Hosting, functions, cron | — |
| Paystack account (Ghana) | Online payment: mobile money and cards | Only cash on delivery is offered (if enabled) |
| Resend account + verified domain | Order and account emails | Emails are logged as *Skipped*; password reset emails are not sent |
| Vercel Blob store | Product images uploaded in the admin | Uploads are refused in production |
| Arkesel account (optional) | SMS order updates | No SMS |

## 1. Database

1. Create a PostgreSQL database. Neon is available directly from the Vercel
   Marketplace (*Project → Storage*). Supabase or any other managed Postgres 15+
   also works.
2. Note two connection strings:
   - **Pooled** connection → `DATABASE_URL` (used by the app).
   - **Direct** (non-pooled) connection → `DIRECT_DATABASE_URL` (used by
     `prisma migrate deploy` during the build).
3. Put the database and the Vercel functions in the **same region**
   (*Vercel → Project → Settings → Functions → Region*). Every page makes
   several database queries, so a long round trip between them slows the whole
   site. For customers in Ghana, a European region is usually closer than the
   default US East region. Test from Ghana before deciding.
4. Turn on backups or point-in-time restore with the database provider.

Use a **separate database for Preview deployments**, such as a Neon branch.
Every build runs migrations against the `DATABASE_URL`/`DIRECT_DATABASE_URL` of
its environment, so Preview must never point at the production database.

## 2. Vercel project

1. *Add New → Project* and import the GitHub repository. Vercel detects
   Next.js. The build command comes from `vercel.json`:
   `prisma migrate deploy && npm run build`. Migrations are applied before each
   build.
2. Add the environment variables for **Production** (and separate values for
   Preview):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-domain` (no trailing slash) |
   | `BETTER_AUTH_URL` | Same as above |
   | `BETTER_AUTH_SECRET` | New random value: `openssl rand -base64 32` |
   | `DATABASE_URL` | Pooled connection string |
   | `DIRECT_DATABASE_URL` | Direct connection string |
   | `PAYSTACK_SECRET_KEY` | `sk_test_…` first, `sk_live_…` at launch |
   | `RESEND_API_KEY`, `EMAIL_FROM` | See [Email](#5-email-resend) |
   | `BLOB_READ_WRITE_TOKEN` | Added automatically when a Blob store is connected |
   | `CRON_SECRET` | New random value |
   | `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID` | Optional |

   Do **not** set `PAYMENTS_MOCK` in production. It is ignored there anyway.
3. Deploy, then add the shop's domain under *Settings → Domains*. If the domain
   changes later, update `NEXT_PUBLIC_SITE_URL` and `BETTER_AUTH_URL` and
   redeploy.

## 3. Scheduled job (unpaid order expiry)

`vercel.json` schedules `/api/cron/expire-orders` **every 15 minutes**. The job
cancels online orders that were not paid within the window set in *Admin →
Settings*, after checking with Paystack once more, and returns their stock.
Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically. Any request
without that header gets 401.

- Vercel limits how often cron jobs may run on some plans. Check the cron
  limits for your plan in Vercel's documentation. If the plan does not allow
  15-minute runs, either upgrade or remove the `crons` entry and call the
  endpoint from an external scheduler (for example a GitHub Actions workflow or
  cron-job.org) with the header `Authorization: Bearer <CRON_SECRET>`.
- Until the job runs, stock reserved by abandoned online orders stays reserved.
- You can trigger it by hand to check it works:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/expire-orders
  ```

  It returns how many orders were expired, found paid, or deferred.

## 4. Paystack

### Test mode first

1. In the Paystack dashboard (test mode), copy the **test secret key**
   (`sk_test_…`) into `PAYSTACK_SECRET_KEY`.
2. *Settings → API Keys & Webhooks* → set the **Test Webhook URL** to:

   ```text
   https://your-domain/api/payments/paystack/webhook
   ```

   You do not need to set a callback URL. The app sends
   `/checkout/callback` with each transaction.
3. Place orders with Paystack's test cards and test mobile money numbers. For
   each payment, check that:
   - the order shows **Paid / Confirmed** only after payment,
   - a cancelled or failed payment leaves the order **Unpaid** with *Pay now*
     available,
   - the order in *Admin → Orders* shows the payment.

   While a test key is in use, the checkout page tells customers that payments
   are in test mode.

### Going live

1. Complete Paystack business activation for Ghana, with **GHS** enabled.
2. Replace `PAYSTACK_SECRET_KEY` with the **live** secret key and set the
   **Live Webhook URL** to the same address as above. Redeploy.
3. Make one small real payment and confirm it end to end.

Security notes:
- Webhooks are accepted only with a valid `x-paystack-signature`
  (HMAC-SHA512 of the body with the secret key). Each event is stored once, so a
  repeated delivery changes nothing.
- An order is only marked paid after the server verifies the transaction with
  Paystack and the amount and currency match the order.
- **Refunds** are made in the Paystack dashboard. The app does not issue
  refunds and does not yet have a "refunded" status. Record the refund as a
  note on the order.

## 5. Email (Resend)

1. Create a Resend account and **verify the shop's domain** (add the DNS
   records Resend shows).
2. Set `RESEND_API_KEY`, and `EMAIL_FROM` to a sender on that domain, e.g.
   `Boamah's Grocery <orders@your-domain>`.
3. In *Admin → Settings*, enter the staff email addresses that should receive
   new-order and late-payment alerts.
4. Place a test order and check *Admin → Notifications*: each email is listed as
   *Sent*, *Failed* (with the provider's error) or *Skipped*.

Customers' password reset emails also depend on this step.

## 6. Image uploads (Vercel Blob)

1. *Project → Storage → Create → Blob*, with **public** access (product
   images are shown to everyone), and connect it to the project. Vercel adds
   `BLOB_READ_WRITE_TOKEN`.
2. Redeploy. Images uploaded in the admin (JPEG, PNG or WebP, up to 5 MB, with
   the type checked from the file's content) are then stored in Blob.

The bundled product photos in `public/images` are served with the site and do
not need Blob.

## 7. SMS (optional)

Set `SMS_PROVIDER=arkesel`, `SMS_API_KEY` and an Arkesel-approved
`SMS_SENDER_ID`, then enable SMS in *Admin → Settings*. Results appear in
*Admin → Notifications*.

## 8. First admin and store set-up

There is no default admin. Create the first Super Admin from your own computer
against the production database:

```bash
DATABASE_URL="<production direct connection string>" \
  npm run admin:create -- --email owner@your-domain --name "Owner Name"
```

The command prints a generated password once. Sign in at `/login`, then change
the password under *Account → Settings*. Then:

- **Do not run the sample seed in production.** It refuses to unless
  `SEED_ALLOW_PRODUCTION=true` is set. Add real categories and products in the
  admin instead.
- Other staff register normal accounts. The Super Admin then assigns their roles
  in *Admin → Staff*.

## 9. Search engines

The site publishes these automatically:

| URL | Contents |
| --- | --- |
| `/sitemap.xml` | Sitemap index pointing to the three sitemaps below |
| `/sitemaps/pages/sitemap.xml` | Home, shop, offers, categories list, contact, credits, and each policy once its text is written |
| `/sitemaps/categories/sitemap.xml` | Every active category, with its image |
| `/sitemaps/products/sitemap.xml` | Every published product in an active category, with its images |
| `/robots.txt` | Lists every sitemap, blocks the admin, account, cart, checkout, order and sign-in pages, and blocks search, sort and filter URLs |

Sitemaps are generated at build time and refreshed every hour from the
database. Their links use `NEXT_PUBLIC_SITE_URL`, so set it to the real domain
**before** deploying.

After launch, submit `https://your-domain/sitemap.xml` in
[Google Search Console](https://search.google.com/search-console) and
[Bing Webmaster Tools](https://www.bing.com/webmasters).

## Before going live

These are business decisions and facts only the shop can supply. The app does
not make them up. Until they are entered, the policy pages show a neutral
"will be published here shortly" message, and contact details that are not set
are left out.

**Catalogue and prices**
- [ ] Real products, variants, units, prices (GHS) and opening stock. The seed's
      prices are illustrative only.
- [ ] Replace the Wikimedia Commons photos with the shop's own where possible.
      Keep `/credits` accurate for any that remain.
- [ ] Decide whether prices include VAT/NHIL/GETFund levies. The app does not
      add tax to orders, so shelf prices must already be the prices customers
      pay. Confirm this with the shop's accountant.

**Delivery and payment**
- [ ] Delivery zones: areas covered, fee, minimum order, free-delivery
      threshold and the delivery time promised (*Admin → Delivery*).
- [ ] Pickup: on or off, and the address and opening hours if on.
- [ ] Cash on delivery: on or off.
- [ ] How long unpaid online orders hold stock (default 60 minutes).
- [ ] Paystack live activation and a successful real test payment.
- [ ] Refund process: who approves refunds and how fast (refunds are made in
      the Paystack dashboard).

**Store information** (*Admin → Settings*)
- [ ] Contact email, phone, WhatsApp, address, business hours, social links.
- [ ] Delivery, returns and refunds, privacy, and terms and conditions text.
      These are legal documents and should be written or reviewed by the
      business, ideally with legal advice. The privacy policy should cover
      Ghana's Data Protection Act, 2012 (Act 843).
- [ ] Turn **off** the demo announcement bar and **untick** "This store still
      contains sample data".

**Accounts and services**
- [ ] First Super Admin created. Staff accounts and roles assigned.
- [ ] Resend domain verified and a test email received.
- [ ] Custom domain connected, with `NEXT_PUBLIC_SITE_URL`/`BETTER_AUTH_URL`
      updated.
- [ ] Database backups enabled.

## Running the shop

- **Daily**: *Admin → Orders* for new, unpaid and cash-on-delivery orders.
  *Admin → Inventory* lists low-stock items.
- **Late payments**: if a customer's payment is verified after their order was
  cancelled (for example after the payment window ran out), the order gets an
  automatic note and staff are emailed. Refund the customer in Paystack or
  fulfil the order by hand.
- **Stock** changes only through orders and recorded adjustments (receipts,
  corrections, damage), each kept in the movement history with who made it.
- **Notifications** shows any failed email or SMS so the customer can be
  contacted another way.
- **Audit log** records staff actions such as price changes, stock
  adjustments, order status changes, cancellations, cash collection, customer
  suspension, role changes, coupons, delivery zones and settings.
- **Secrets**: rotate `BETTER_AUTH_SECRET` (this signs everyone out),
  `CRON_SECRET` and provider keys if they may have been exposed.

## Updates and rollbacks

- Before upgrading dependencies, run `npm audit`, `npm run lint`,
  `npm run typecheck`, `npm run test:all` and `npm run test:e2e`. Apply
  Next.js security releases promptly.
- Changes to the database schema go through `npm run db:migrate` in
  development, which creates a migration file to commit. Production applies it
  on the next deploy.
- Vercel can roll back to a previous deployment instantly, but **migrations are
  not rolled back**. Make schema changes backward compatible (add first, remove
  later) so an older deployment still works with the newer schema.
