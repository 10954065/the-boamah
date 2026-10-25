import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/store/page-header";
import { getStoreSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Get in touch with The Boamah's Online Grocery Shop.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const settings = await getStoreSettings();
  const whatsapp = settings.whatsappNumber?.replace(/[^\d]/g, "");
  const items = [
    settings.contactPhone
      ? { Icon: Phone, label: "Phone", value: settings.contactPhone, href: `tel:${settings.contactPhone.replace(/\s+/g, "")}` }
      : null,
    whatsapp && settings.whatsappNumber
      ? { Icon: MessageCircle, label: "WhatsApp", value: settings.whatsappNumber, href: `https://wa.me/${whatsapp}` }
      : null,
    settings.contactEmail ? { Icon: Mail, label: "Email", value: settings.contactEmail, href: `mailto:${settings.contactEmail}` } : null,
    settings.address ? { Icon: MapPin, label: "Address", value: settings.address, href: null } : null,
    settings.businessHours ? { Icon: Clock, label: "Business hours", value: settings.businessHours, href: null } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <>
      <PageHeader
        title="Contact us"
        description="Questions about an order, a product or delivery? We're happy to help."
        crumbs={[{ href: "/", label: "Home" }, { label: "Contact us" }]}
      />
      <div className="container-page max-w-3xl space-y-6">
        {items.length === 0 ? (
          <Alert tone="info" title="Contact details coming soon">
            Our contact details are being set up. If you have placed an order, you can check its status on the{" "}
            <Link href="/track-order" className="font-semibold underline">
              order tracking page
            </Link>
            .
          </Alert>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {items.map(({ Icon, label, value, href }) => (
              <li key={label} className="flex gap-4 rounded-lg border border-line bg-surface p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
                  {href ? (
                    <a
                      href={href}
                      className="mt-1 block break-words font-semibold text-ink hover:text-brand-700"
                      {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {value}
                    </a>
                  ) : (
                    <p className="mt-1 whitespace-pre-line font-semibold text-ink">{value}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-ink-muted">
          Looking for an existing order?{" "}
          <Link href="/track-order" className="font-semibold text-brand-700 hover:underline">
            Track your order
          </Link>{" "}
          or see{" "}
          <Link href="/policies/delivery" className="font-semibold text-brand-700 hover:underline">
            delivery information
          </Link>
          .
        </p>
      </div>
    </>
  );
}
