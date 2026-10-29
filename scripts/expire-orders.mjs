/**
 * Calls the unpaid-order expiry job once and exits. For hosts without Vercel
 * Cron, such as a Railway cron service:
 *
 *   SHOP_URL=https://your-domain CRON_SECRET=... node scripts/expire-orders.mjs
 *
 * Plain Node with no dependencies, so it runs without building the app.
 */
const shopUrl = (process.env.SHOP_URL ?? "").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;

// exitCode rather than process.exit(): exiting while fetch's connection is
// still closing can crash Node on some platforms.
async function main() {
  if (!shopUrl || !secret) {
    console.error("Set SHOP_URL and CRON_SECRET.");
    return 1;
  }
  const url = /^https?:\/\//.test(shopUrl) ? shopUrl : `https://${shopUrl}`;
  const response = await fetch(`${url}/api/cron/expire-orders`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`Expiry job failed with HTTP ${response.status}: ${body}`);
    return 1;
  }
  console.info(`Expiry job done: ${body}`);
  return 0;
}

process.exitCode = await main();
