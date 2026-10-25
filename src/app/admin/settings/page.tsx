import { SettingsForm } from "@/components/admin/store-managers";
import { AdminHeader } from "@/components/admin/ui";
import { activeOnlineProvider } from "@/server/payments/config";
import { requireStaffPage } from "@/server/session";
import { getStoreSettings } from "@/server/settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireStaffPage("settings:manage", "/admin/settings");
  const s = await getStoreSettings();
  return (
    <>
      <AdminHeader title="Store settings" />
      <SettingsForm
        onlineConfigured={activeOnlineProvider() !== null}
        initial={{
          storeName: s.storeName,
          tagline: s.tagline ?? "",
          contactEmail: s.contactEmail ?? "",
          contactPhone: s.contactPhone ?? "",
          whatsappNumber: s.whatsappNumber ?? "",
          address: s.address ?? "",
          businessHours: s.businessHours ?? "",
          announcementEnabled: s.announcementEnabled,
          announcementText: s.announcementText ?? "",
          announcementLink: s.announcementLink ?? "",
          socialFacebook: s.socialFacebook ?? "",
          socialInstagram: s.socialInstagram ?? "",
          socialX: s.socialX ?? "",
          socialTiktok: s.socialTiktok ?? "",
          pickupEnabled: s.pickupEnabled,
          pickupAddress: s.pickupAddress ?? "",
          pickupInstructions: s.pickupInstructions ?? "",
          codEnabled: s.codEnabled,
          onlinePaymentEnabled: s.onlinePaymentEnabled,
          pendingPaymentTtlMinutes: s.pendingPaymentTtlMinutes,
          deliveryPolicy: s.deliveryPolicy ?? "",
          returnsPolicy: s.returnsPolicy ?? "",
          privacyPolicy: s.privacyPolicy ?? "",
          termsPolicy: s.termsPolicy ?? "",
          notifyAdminEmails: s.notifyAdminEmails ?? "",
          notifyOnNewOrder: s.notifyOnNewOrder,
          smsEnabled: s.smsEnabled,
          isSampleData: s.isSampleData,
        }}
      />
    </>
  );
}
