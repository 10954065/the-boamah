import "server-only";
import { cache } from "react";
import type { StoreSettings } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { storefrontCached } from "@/server/storefront-cache";

export const SETTINGS_ID = "default";

/** Safe defaults used until the business saves its own settings. */
export const DEFAULT_SETTINGS: StoreSettings = {
  id: SETTINGS_ID,
  storeName: "The Boamah's Online Grocery Shop",
  tagline: null,
  logoUrl: null,
  currency: "GHS",
  contactEmail: null,
  contactPhone: null,
  whatsappNumber: null,
  address: null,
  businessHours: null,
  announcementEnabled: false,
  announcementText: null,
  announcementLink: null,
  socialFacebook: null,
  socialInstagram: null,
  socialX: null,
  socialTiktok: null,
  pickupEnabled: false,
  pickupAddress: null,
  pickupInstructions: null,
  codEnabled: false,
  onlinePaymentEnabled: true,
  pendingPaymentTtlMinutes: 60,
  deliveryPolicy: null,
  returnsPolicy: null,
  privacyPolicy: null,
  termsPolicy: null,
  notifyAdminEmails: null,
  notifyOnNewOrder: true,
  smsEnabled: false,
  isSampleData: false,
  updatedAt: new Date(0),
};

/** Store settings for pages: deduplicated per render and shared between shoppers for a short while. */
export const getStoreSettings = cache((): Promise<StoreSettings> => storefrontCached("settings", loadStoreSettings));

/** Store settings straight from the database, for checkout, which must act on the latest save. */
export async function loadStoreSettings(): Promise<StoreSettings> {
  const settings = await prisma.storeSettings.findUnique({ where: { id: SETTINGS_ID } });
  return settings ?? DEFAULT_SETTINGS;
}

export function adminNotificationEmails(settings: StoreSettings): string[] {
  return (settings.notifyAdminEmails ?? "")
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}
