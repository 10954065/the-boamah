import "server-only";
import { prisma } from "@/lib/db";
import { siteUrl } from "@/lib/utils";
import { escapeHtml, renderLayout } from "@/server/notifications/layout";
import { sendEmailNotification, sendSmsNotification } from "@/server/notifications/send";
import { getStoreSettings } from "@/server/settings";

/** Messages sent per option per restock; anyone left over is told on the next restock. */
const BATCH_SIZE = 100;

/**
 * Tells shoppers who asked that an option is back in stock. Each alert is
 * claimed before sending, so overlapping restocks never message anyone twice.
 * Never throws: a failed message is recorded in Admin → Notifications.
 */
export async function notifyBackInStock(variantIds: readonly string[]): Promise<number> {
  let sent = 0;
  for (const variantId of new Set(variantIds)) {
    try {
      sent += await notifyVariant(variantId);
    } catch (error) {
      console.error("[stock-alerts] failed to notify", variantId, error);
    }
  }
  return sent;
}

async function notifyVariant(variantId: string): Promise<number> {
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, isActive: true, product: { status: "PUBLISHED", category: { isActive: true } } },
    include: { product: { select: { name: true, slug: true, _count: { select: { variants: { where: { isActive: true } } } } } } },
  });
  if (!variant || variant.stockMilli < variant.minQtyMilli) return 0;

  const settings = await getStoreSettings();
  const alerts = await prisma.stockAlert.findMany({
    where: { variantId, notifiedAt: null, channel: settings.smsEnabled ? undefined : "EMAIL" },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });
  if (alerts.length === 0) return 0;

  const name = variant.product._count.variants > 1 ? `${variant.product.name} (${variant.name})` : variant.product.name;
  const url = siteUrl(`/products/${variant.product.slug}`);
  const subject = `${name} is back in stock`;
  const intro = `Good news: ${name} is back in stock at ${settings.storeName}. Stock can sell out quickly, so order soon if you still need it.`;
  const footnote = "You asked us to tell you when it was back. We will not message you about it again.";
  const { html, text } = renderLayout({
    settings,
    preheader: subject,
    heading: subject,
    bodyHtml: `${escapeHtml(intro)}<br><br><span style="color:#858c87;font-size:13px">${escapeHtml(footnote)}</span>`,
    bodyText: `${intro}\n\n${footnote}`,
    cta: { label: "Shop now", url },
  });

  let sent = 0;
  for (const alert of alerts) {
    const claimed = await prisma.stockAlert.updateMany({ where: { id: alert.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
    if (claimed.count === 0) continue;
    if (alert.channel === "EMAIL") {
      await sendEmailNotification({ type: "BACK_IN_STOCK", to: alert.contact, subject, html, text });
    } else {
      await sendSmsNotification({ type: "BACK_IN_STOCK", to: alert.contact, body: `${settings.storeName}: ${name} is back in stock. ${url}`.slice(0, 300) });
    }
    sent += 1;
  }
  return sent;
}
