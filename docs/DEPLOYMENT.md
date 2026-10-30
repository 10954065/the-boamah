# Deploying The Boamah's Online Grocery Shop

This guide takes the shop from the GitHub repository to a live site with a
PostgreSQL database, Paystack payments and email. There are two ways to host
it:

- **Railway**: the site, its database, image storage and the scheduled job all
  in one Railway project. Follow [Railway](#railway-site-and-database-together),
  then continue from [4. Paystack](#4-paystack).
- **Vercel** with a managed database (Neon or Supabase): follow sections 1 to 9.

- [Railway (site and database together)](#railway-site-and-database-together)
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

## Railway (site and database together)

The Hobby plan is enough to start. Everything below is set in the Railway
dashboard; the repository needs no Railway config file.

The build does not touch the database. Every page is rendered when it is
requested, and migrations run in a separate pre-deploy step. This matters on
Railway because the database's private address (`postgres.railway.internal`)
only works while the app is running, not while it is being built.

### R1. Project and database

1. On railway.com: *New Project → Deploy from GitHub repo* → pick
   `10954065/the-boamah`. Railway creates a service for the shop (called
   `shop` below; use whatever name yours has). Its first build may fail until
   the variables in R2 are set. That is expected.
2. In the same project: *Create → Database → PostgreSQL*.
3. Shop service → *Settings → Networking → Generate Domain*. This gives an
   address like `https://the-boamah-production.up.railway.app`. A custom domain
   can be added there later (see *Custom domain* below).

### R2. Variables

Shop service → *Variables*. Use *Add Reference* for `DATABASE_URL` so it
follows the database if its password changes.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (private network: fast, no egress charge) |
| `NEXT_PUBLIC_SITE_URL` | The address from R1, e.g. `https://the-boamah-production.up.railway.app` (no trailing slash) |
| `BETTER_AUTH_URL` | Same as above |
| `BETTER_AUTH_SECRET` | New random value: `openssl rand -base64 32` |
| `STAFF_GATE_KEY` | New random value: `openssl rand -base64 48`. Makes the private links to the admin and the till (see [Private links](#private-links)) |
| `CRON_SECRET` | New random value |
| `UPLOAD_DIR` | `/data/uploads` (see R4) |
| `PAYSTACK_SECRET_KEY` | See [Paystack](#4-paystack) |
| `RESEND_API_KEY`, `EMAIL_FROM` | See [Email](#5-email-resend) |
| `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID` | Optional |

- Leave `DIRECT_DATABASE_URL` unset. Railway's PostgreSQL has no connection
  pooler, so the one URL serves both the app and migrations.
- `NEXT_PUBLIC_SITE_URL` is built into the pages. After changing it (for
  example when adding a custom domain), redeploy.
- **Custom domain** (the shop uses `thebonlinegroceryshop.com`):
  1. Shop service → *Settings → Networking → Custom Domain*: add the domain and
     `www.` the domain. Railway shows one DNS record for each.
  2. DNS: this domain was bought through Railway, so Railway creates the
     records itself (manage them at railway.com/workspace/domains). For a domain
     bought elsewhere, add the records Railway shows at that DNS provider: a
     CNAME for `www`, and an ANAME/ALIAS (or CNAME flattening) for the root,
     since a plain CNAME is not allowed there. Railway issues the HTTPS
     certificates once the records resolve.
  3. Set `NEXT_PUBLIC_SITE_URL` and `BETTER_AUTH_URL` to `https://` the domain,
     then redeploy. `www.` and any address in `REDIRECT_HOSTS` then redirect to
     the main domain (except `/api`, so webhooks and the scheduled job keep
     working everywhere). The Railway address is not redirected here because it
     is the till's address (R8).
  4. Update the Paystack webhook URL to the new domain.
- Do **not** set `PAYMENTS_MOCK`.

### R3. Deploy settings

Shop service → *Settings → Deploy*:

| Setting | Value |
| --- | --- |
| Pre-deploy command | `npm run db:deploy` |
| Healthcheck path | `/` |
| Build command, start command | Leave empty. Railway runs `npm run build` and `npm start`, and `next start` listens on the `PORT` Railway provides. |

The pre-deploy command applies new database migrations over the private
network before the new version goes live. If it fails, the deploy stops and
the previous version keeps serving customers.

Then *Deploy* (or push to GitHub). Every push to `main` deploys again.

### R4. Image uploads (volume)

Product, category and banner images uploaded in the admin need permanent
storage, because a deploy replaces the app's own disk.

1. Right-click the shop service → *Attach Volume*, mount path `/data`.
2. With `UPLOAD_DIR=/data/uploads` (R2), uploads are saved on the volume and
   served from `/uploads/...`. Only file names the app itself created can be
   served from there.

The Hobby plan's volume holds 5 GB, which is thousands of product photos. A
service with a volume runs as a single instance and is briefly unavailable
(a few seconds) during each redeploy. The bundled photos in `public/images`
ship with the site and do not use the volume.

If you prefer Vercel Blob for images, set `BLOB_READ_WRITE_TOKEN` instead. It
takes priority over `UPLOAD_DIR`.

### R5. Unpaid order expiry (cron service)

Online orders that are not paid in time must be cancelled so their stock is
released. On Railway this is a small second service that runs every 15
minutes and then stops:

1. *Create → GitHub Repo* → the same repository. Name the service
   `order-expiry`.
2. `order-expiry` → *Settings*:
   - Custom build command: `echo "nothing to build"`
   - Custom start command: `node scripts/expire-orders.mjs`
   - Cron schedule: `*/15 * * * *`
3. `order-expiry` → *Variables*:

   | Variable | Value |
   | --- | --- |
   | `SHOP_URL` | `${{shop.RAILWAY_PUBLIC_DOMAIN}}`, or the custom domain |
   | `CRON_SECRET` | `${{shop.CRON_SECRET}}` |

Each run's log shows how many orders were expired, found paid or deferred, and
the run is marked failed if the shop could not be reached. Railway skips a run
if the previous one is still going.

Instead of this service you can call the endpoint from any outside scheduler,
as described in [Scheduled job](#3-scheduled-job-unpaid-order-expiry).

### R6. First admin

The database has no public address, so run this on the server. From your own
computer (with an SSH key added by `railway ssh keys add`):

```bash
railway ssh --service the-boamah
npm run admin:create -- --email owner@your-domain --name "Owner Name"
npm run staff:links
```

The last command prints the private links. Open the admin link to sign in.

Then continue with [Paystack](#4-paystack), [Email](#5-email-resend),
[First admin and store set-up](#8-first-admin-and-store-set-up) and
[Search engines](#9-search-engines). Skip the Vercel-only parts: Vercel Cron
and Vercel Blob are replaced by R4 and R5. Set up backups next (R7).

### R7. Database backups

Railway's own volume backups are not available on the Hobby plan, so the
repository includes a nightly backup job (`ops/db-backup`). It runs `pg_dump`
inside Railway's private network, checks the result (a valid gzip file of a
sensible size that contains the orders table) and stores it in a private
Railway Storage Bucket. It keeps the 14 newest daily backups and the first
backup of each month for 12 months. A typical backup is well under 1 MB, so
storage costs a few cents a month.

1. *Create → Bucket*, name it `db-backups`, region EU West (same as the
   database).
2. *Create → GitHub Repo* → the same repository. Name the service `db-backup`.
3. `db-backup` → *Settings*:
   - Root directory: `ops/db-backup` (Railway builds its Dockerfile)
   - Watch paths: `ops/db-backup/**`
   - Cron schedule: `0 2 * * *` (02:00 GMT, Ghana time, every night)
   - Restart policy: never
4. `db-backup` → *Variables*:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `BUCKET`, `ENDPOINT`, `REGION`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` | References to the same variables on `db-backups` |
   | `KEEP_DAILY`, `KEEP_MONTHLY` | Optional, defaults 14 and 12 |

5. Run it once from the service's cron panel and check its log ends with
   `Backup stored: daily/boamah-….sql.gz`. Railway marks a run as failed if the
   backup could not be made or stored.

**Restoring.** Restore into a new, empty database, never over the live one:

1. Create a new PostgreSQL service in the project.
2. Download a backup from the `db-backups` bucket with any S3 tool and the
   bucket's credentials (shown on the bucket in the dashboard), for example:
   `aws --endpoint-url "$ENDPOINT" s3 cp "s3://$BUCKET/daily/boamah-2026-11-03T0200Z.sql.gz" .`
   (`aws … s3 ls "s3://$BUCKET/daily/"` lists them).
3. Load it: `gunzip -c boamah-….sql.gz | psql "<new database URL>"`. The file
   is plain SQL with no owners or grants, so it also loads into any other
   PostgreSQL 18 host.
4. Point the shop's `DATABASE_URL` at the new database and redeploy.

Test a restore once a month the same way, into a scratch database, so you know
the backups work before you need them.

**Off-site copy in Google Drive.** Bucket storage is on Railway too, so the job
can also copy every backup to a Google Drive folder (default `boamah`, with
`daily/` and `monthly/` inside). Copies older than the retention above are moved
to the Drive bin. It uses rclone with the `drive.file` permission, which only
lets it see the files it created, nothing else in the Drive.

1. On a computer with a browser and rclone (or Docker), run
   `rclone authorize drive eyJzY29wZSI6ImRyaXZlLmZpbGUifQ`
   (the argument means `{"scope":"drive.file"}`), sign in with the Google
   account that should hold the backups and allow access.
2. Copy the token JSON it prints (between the paste markers) into a
   `GDRIVE_TOKEN` variable on `db-backup`. Optionally set `GDRIVE_FOLDER`.
3. Run the job once and check its log ends with `Copied to Google Drive: …`.

If the Google password is changed or the access is removed in the Google
account's security settings, runs fail with "the Google Drive copy failed"
(the bucket copy is still made). Repeat steps 1 and 2 to reconnect.

### R8. In-shop till (pos. subdomain)

The till is part of the same app and database: it sells the same products,
with the same photos, prices and stock. Its address is `POS_HOST`; by default
that is the shop's domain with `pos.` in front.

**Current set-up:** the Hobby plan allows 2 custom domains per service, and the
shop uses both (the domain and `www.`). So the till uses the service's free
Railway address instead:

1. Shop service → *Variables*: `POS_HOST` = `the-boamah-production.up.railway.app`,
   and that address must **not** be in `REDIRECT_HOSTS`. Redeploy.
2. The till then runs on that address, behind its private link. Nothing on the
   shop's domain points to it. Sign-in on the till address is trusted
   automatically, and the till is hidden from search engines.

**To move it to `pos.thebonlinegroceryshop.com` later** (Pro plan, or a second
service running the same code): add that custom domain, set `POS_HOST` to it,
and put the Railway address back in `REDIRECT_HOSTS`. The till link changes with
the address, so give staff the new one from *Admin → Staff*.

**Staff:** the Super Admin adds them in *Admin → Staff & roles → Add staff
member*: name, email, optional phone, a role, and a password the shop makes (or
one typed in). A login card follows with the right private link, the email and
the password, to print or copy as a message; the password is shown only that
once. Nobody can register. Cashiers can only use the
till; Store Managers and Super Admins can use it too. How to sell, print
receipts and close shifts is in [Using the till](TILL.md).

#### Private links

Shoppers have no accounts: they check out with their name, email and phone. So
the only sign-in is for staff, and it is hidden. `/admin`, `/login`,
`/forgot-password`, every till page and the sign-in API answer like a missing
page unless the device holds a pass.

- **The links** are an HMAC of `STAFF_GATE_KEY`, so they are not in the code.
  The Super Admin sees them under *Admin → Staff → Private links*, and
  `npm run staff:links` prints them wherever the key is set.
- **The pass** is a signed, httpOnly cookie that opening a link puts on the
  device, one for the admin and one for the till. It lasts 90 days from the
  last visit.
- **Changing the links:** set a new `STAFF_GATE_KEY`. Both links change, every
  device needs the new link and old passes stop working. Do this if a link gets
  out. Staff stay signed in, but cannot reach the pages until they open it.
- **Without the key** in production, the admin, the till and staff sign-in stay
  closed and the log says why. Locally the gate stays open until a key is set.
- **It adds to sign-in, it does not replace it.** Pages and actions still check
  the signed-in person and their role.

Rate limits on staff access:

| What | Limit |
| --- | --- |
| Wrong private links | 10 per 15 minutes per IP address, then wrong links get "too many requests". The right link always works (kept in memory, so a restart clears it) |
| Sign-in attempts | 5 a minute per IP address |
| Wrong passwords | 5 per 15 minutes and 20 a day per account. The pause is written to the audit log (`auth.sign_in.locked`); any password reset lifts it, by email or by the Super Admin |
| Password reset requests | 3 per 5 minutes per IP address |
| Manager approvals at the till | See the note on voids and returns below |

Addresses come from `X-Real-IP`, which Railway's edge sets itself. The first
`X-Forwarded-For` entry is whatever the caller sent, so it is not used when
`X-Real-IP` is there.

The first till, **T1 "Front counter"**, is created by the database migration.
Receipt numbers are issued on the till (T1-000001, T1-000002, …), so it can
sell while offline; each sale carries an ID made on the till, so uploading it
again never records it twice. A sale is never refused for stock (the goods
have already left the shop): stock goes down to zero at most, and the missing
quantity is kept on the sale as a shortfall for a manager to check.

**Offline:** the till installs as an app (`public/pos-manifest.webmanifest`)
and a service worker (`public/pos-sw.js`, production builds only) keeps the
till page, its build files and product photos on the device. Sales, shift
openings and closings wait in the browser's storage on that device and are
sent in order when the connection is back. Nothing needs setting up on the
server for this; clearing the browser's data for the till address deletes
anything still waiting, so staff are told not to.

**Voids, returns and review:** voids, returns (refunds) and removing something
the server refused need the internet and a manager. A cashier's till accepts a
manager's own email and password for the approval; it is checked by the server
and never stored. After 5 wrong tries by a cashier or for a manager's email in
15 minutes (or 20 for an email in a day) approvals stop for a while; each wrong
try is in the audit log (*pos.approval.failed*). Approvals that go through do
not count. Managers with weak passwords should change them, as a cashier can
try a manager's password this way. Refunds are taken off the expected amounts of the shift they are paid
from. Managers see the end of day report, every shift's count and everything
to look at under *Admin → Shop till*; each void, return, removal and review is
also in the audit log.

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
   | `STAFF_GATE_KEY` | New random value: `openssl rand -base64 48` (see [Private links](#private-links)) |
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

The command prints a generated password once. Open the admin link
(`npm run staff:links` prints it), sign in, then change the password under
*My account*: select your name at the top of the admin. Then:

- **Do not run the sample seed in production.** It refuses to unless
  `SEED_ALLOW_PRODUCTION=true` is set. Add real categories and products in the
  admin instead.
- The Super Admin adds other staff in *Admin → Staff*. Nobody can register.
- Enter the shop's WhatsApp number in *Admin → Settings* (for example
  024 123 4567). The chat button appears on every page once it is set.

## 9. Search engines

The site publishes these automatically:

| URL | Contents |
| --- | --- |
| `/sitemap.xml` | Sitemap index pointing to the three sitemaps below |
| `/sitemaps/pages/sitemap.xml` | Home, shop, offers, categories list, contact, credits, and each policy once its text is written |
| `/sitemaps/categories/sitemap.xml` | Every active category, with its image |
| `/sitemaps/products/sitemap.xml` | Every published product in an active category, with its images |
| `/robots.txt` | Lists every sitemap, blocks the cart, checkout and order pages, and blocks search, sort and filter URLs. It never names staff pages, because that would point people to them |

Sitemaps are generated from the database each time they are requested, so a
new product appears in them straight away. Their links use
`NEXT_PUBLIC_SITE_URL`, so set it to the real domain **before** deploying.

After launch, submit `https://your-domain/sitemap.xml` in
[Google Search Console](https://search.google.com/search-console) and
[Bing Webmaster Tools](https://www.bing.com/webmasters).

### Product results and link previews

Each product page carries schema.org Product data for Google
(`src/lib/product-schema.ts`). It is built only from what the shop has
entered, so some Search Console notes stay until the shop supplies the fact:

| Search Console note | Where it comes from |
| --- | --- |
| No global identifier (gtin, brand) | **Brand** on the product form, or a real EAN/UPC barcode on a size (codes the shop made up are left out) |
| Missing `hasMerchantReturnPolicy` | *Settings → Policies → Days customers have to return an item* (0 means no returns; blank leaves it out) |
| Missing `shippingDetails` | The cheapest active delivery zone's fee, sent for Ghana |
| Missing `validFrom` | The time the size was last changed, so its current price applies from then |
| Missing `aggregateRating` / `review` | Approved reviews only. Once an order is delivered or collected, the customer can rate its products from the order page or from tracking (reference plus email or phone); the "delivered" email asks them to. Each review waits in *Admin → Reviews* until approved. Products without reviews keep this note; it is not an error |

A pasted shop link shows a picture in WhatsApp, Facebook, X and the like:
the shop's name and the product (photo, name, size, price), the category or
the home page headline. These come from the `opengraph-image.tsx` files and
are sent as JPEGs under 300 KB, because WhatsApp leaves out bigger ones. The
fonts they use are in `assets/fonts` (SIL Open Font License).

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
- [ ] A brand on every product, and barcodes scanned from the packaging, so
      Google can identify the products.
- [ ] The returns window in *Settings → Policies*, once the returns policy is
      decided.
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
- [ ] `STAFF_GATE_KEY` set, and the private links shared with staff only.
- [ ] First Super Admin created. Staff accounts and roles assigned.
- [ ] Resend domain verified and a test email received.
- [ ] Custom domain connected, with `NEXT_PUBLIC_SITE_URL`/`BETTER_AUTH_URL`
      updated.
- [ ] Database backups running (on Railway: [R7](#r7-database-backups)) and one
      restore tested.

## Running the shop

- **Daily**: *Admin → Orders* for new, unpaid and cash-on-delivery orders.
  *Admin → Inventory* lists low-stock items.
- **Late payments**: if a customer's payment is verified after their order was
  cancelled (for example after the payment window ran out), the order gets an
  automatic note and staff are emailed. Refund the customer in Paystack or
  fulfil the order by hand.
- **Reviews**: *Admin → Reviews* lists new reviews waiting for approval.
  Nothing a customer writes is shown in the store until it is approved.
- **Restocking**: adding stock in *Admin → Inventory* emails (or texts, when SMS
  is on) everyone who asked to be told the item is back, once each. Cancelled
  orders that return stock do the same.
- **Sale end dates**: a sale price can be given an end time (Ghana time) on the
  product page in the admin. Shoppers see a countdown, and the regular price
  returns by itself everywhere, cart and checkout included, when it passes.
- **Bulk prices** are set per option on the product page in the admin. Each
  must be lower than the shelf price; a sale price lower than a bulk price wins.
- **Stock** changes only through orders and recorded adjustments (receipts,
  corrections, damage), each kept in the movement history with who made it.
- **What shoppers see**: changes made in the admin (products, prices, stock
  adjustments, categories, banners, settings, approved reviews) show on the
  storefront straight away. Stock sold through orders can take up to a minute
  to show on product pages, because the storefront reuses catalogue data for 60
  seconds (`STOREFRONT_CACHE_SECONDS`). Checkout always checks live stock and
  prices, so nothing can be oversold.
- **Notifications** shows any failed email or SMS so the customer can be
  contacted another way.
- **Audit log** records staff actions such as price changes, stock
  adjustments, order status changes, cancellations, cash collection, staff
  accounts, role changes, coupons, delivery zones and settings.
- **Secrets**: rotate `BETTER_AUTH_SECRET` (this signs everyone out),
  `STAFF_GATE_KEY` (this changes the private links), `CRON_SECRET` and provider
  keys if they may have been exposed.

## Updates and rollbacks

- Before upgrading dependencies, run `npm audit`, `npm run lint`,
  `npm run typecheck`, `npm run test:all` and `npm run test:e2e`. Apply
  Next.js security releases promptly.
- Changes to the database schema go through `npm run db:migrate` in
  development, which creates a migration file to commit. Production applies it
  on the next deploy.
- Vercel and Railway can both roll back to a previous deployment instantly
  (on Railway: the deployment's menu → *Redeploy*), but **migrations are
  not rolled back**. Make schema changes backward compatible (add first, remove
  later) so an older deployment still works with the newer schema.
