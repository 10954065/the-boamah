import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/store/checkout-form";
import { PageHeader } from "@/components/store/page-header";
import { prisma } from "@/lib/db";
import { getCartView } from "@/server/cart";
import { getActiveZones } from "@/server/delivery";
import { CheckoutError, quoteCart } from "@/server/orders/checkout";
import { isOnlinePaymentAvailable, isPaystackTestMode } from "@/server/payments/config";
import { getCurrentUser } from "@/server/session";
import { getStoreSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const [cart, user, zones, settings] = await Promise.all([getCartView(), getCurrentUser(), getActiveZones(), getStoreSettings()]);
  if (!cart.id || cart.lines.length === 0 || cart.hasBlockingIssues) redirect("/cart");

  const addresses = user
    ? await prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] })
    : [];

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
  const initialZone = defaultAddress?.zoneId && zones.some((z) => z.id === defaultAddress.zoneId) ? defaultAddress.zoneId : undefined;
  const initialMethod = zones.length > 0 ? "DELIVERY" : "PICKUP";

  let initialQuote = null;
  try {
    const quote = await quoteCart(prisma, {
      cartId: cart.id,
      fulfilmentMethod: initialMethod,
      zoneId: initialMethod === "DELIVERY" ? initialZone : undefined,
      who: { userId: user?.id ?? null, email: user?.email ?? null },
      settings: initialMethod === "PICKUP" ? { ...settings, pickupEnabled: true } : settings,
    });
    initialQuote = {
      totals: quote.totals,
      freeDeliveryApplied: quote.freeDeliveryApplied,
      couponCode: quote.couponCode,
      couponMessage: quote.couponMessage,
      estimatedDelivery: quote.zone?.estimatedDelivery ?? null,
    };
  } catch (error) {
    if (!(error instanceof CheckoutError)) throw error;
  }

  return (
    <>
      <PageHeader title="Checkout" crumbs={[{ href: "/", label: "Home" }, { href: "/cart", label: "Cart" }, { label: "Checkout" }]} />
      <div className="container-page">
        <CheckoutForm
          lines={cart.lines.map((line) => ({
            itemId: line.itemId,
            productName: line.productName,
            variantName: line.variantName,
            imageUrl: line.imageUrl,
            quantityMilli: line.quantityMilli,
            unit: line.unit,
            lineTotalMinor: line.lineTotalMinor,
          }))}
          zones={zones.map((zone) => ({
            id: zone.id,
            name: zone.name,
            region: zone.region,
            areas: zone.areas,
            feeMinor: zone.feeMinor,
            minOrderMinor: zone.minOrderMinor,
            freeDeliveryThresholdMinor: zone.freeDeliveryThresholdMinor,
            estimatedDelivery: zone.estimatedDelivery,
          }))}
          addresses={addresses.map((address) => ({
            id: address.id,
            label: address.label,
            recipientName: address.recipientName,
            phone: address.phone,
            city: address.city,
            area: address.area,
            addressLine: address.addressLine,
            details: address.details,
            zoneId: address.zoneId,
            isDefault: address.isDefault,
          }))}
          user={user ? { name: user.name, email: user.email, phone: user.phone } : null}
          pickup={{ enabled: settings.pickupEnabled, address: settings.pickupAddress, instructions: settings.pickupInstructions }}
          payment={{ online: isOnlinePaymentAvailable(settings), cod: settings.codEnabled, testMode: isPaystackTestMode() }}
          initialQuote={initialQuote}
        />
      </div>
    </>
  );
}
