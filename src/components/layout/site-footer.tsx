import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { isOnlinePaymentAvailable } from "@/server/payments/config";
import { getStoreSettings } from "@/server/settings";
import { NewsletterForm } from "./newsletter-form";

function safeExternal(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: "/shop", label: "All products" },
      { href: "/categories", label: "Categories" },
      { href: "/offers", label: "Special offers" },
      { href: "/shop?sort=newest", label: "New arrivals" },
    ],
  },
  {
    title: "Customer care",
    links: [
      { href: "/account", label: "My account" },
      { href: "/track-order", label: "Track an order" },
      { href: "/policies/delivery", label: "Delivery information" },
      { href: "/policies/returns", label: "Returns & refunds" },
      { href: "/contact", label: "Contact us" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/policies/privacy", label: "Privacy policy" },
      { href: "/policies/terms", label: "Terms & conditions" },
      { href: "/credits", label: "Image credits" },
    ],
  },
];

export async function SiteFooter() {
  const settings = await getStoreSettings();
  const socials = [
    { label: "Facebook", url: safeExternal(settings.socialFacebook) },
    { label: "Instagram", url: safeExternal(settings.socialInstagram) },
    { label: "X", url: safeExternal(settings.socialX) },
    { label: "TikTok", url: safeExternal(settings.socialTiktok) },
  ].filter((s): s is { label: string; url: string } => Boolean(s.url));

  const paymentMethods = [
    ...(isOnlinePaymentAvailable(settings) ? ["Mobile Money & cards via Paystack"] : []),
    ...(settings.codEnabled ? ["Cash on delivery"] : []),
  ];

  return (
    <footer className="mt-16 bg-brand-900 text-brand-100">
      <div className="container-page grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.3fr_repeat(3,0.8fr)_1.4fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-10 w-10 ring-1 ring-brand-700" />
            <div className="leading-tight">
              <p className="font-display text-lg font-extrabold text-white">The Boamah&rsquo;s</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-leaf-400">Online Grocery Shop</p>
            </div>
          </div>
          <p className="max-w-xs text-sm leading-6 text-brand-200">
            {settings.tagline ?? "Everyday groceries, fresh produce and household essentials, ordered online."}
          </p>
          <ul className="space-y-2 text-sm">
            {settings.address ? (
              <li className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-leaf-400" aria-hidden="true" />
                <span>{settings.address}</span>
              </li>
            ) : null}
            {settings.contactPhone ? (
              <li className="flex gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-leaf-400" aria-hidden="true" />
                <a href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`} className="hover:text-white">
                  {settings.contactPhone}
                </a>
              </li>
            ) : null}
            {settings.contactEmail ? (
              <li className="flex gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-leaf-400" aria-hidden="true" />
                <a href={`mailto:${settings.contactEmail}`} className="hover:text-white">
                  {settings.contactEmail}
                </a>
              </li>
            ) : null}
            {settings.businessHours ? (
              <li className="flex gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-leaf-400" aria-hidden="true" />
                <span className="whitespace-pre-line">{settings.businessHours}</span>
              </li>
            ) : null}
          </ul>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-sm font-bold text-white">{column.title}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-brand-200 transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <h2 className="text-sm font-bold text-white">Offers in your inbox</h2>
          <p className="mb-4 mt-2 text-sm text-brand-200">Hear about weekly deals and new arrivals first.</p>
          <NewsletterForm />
          {socials.length > 0 ? (
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Social media">
              {socials.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center rounded-md border border-brand-700 px-3 text-xs font-medium text-brand-100 hover:border-leaf-400 hover:text-white"
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <div className="border-t border-brand-800">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-brand-300 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {settings.storeName}. All rights reserved.
          </p>
          {paymentMethods.length > 0 ? <p>We accept: {paymentMethods.join(" · ")}</p> : null}
        </div>
      </div>
    </footer>
  );
}
