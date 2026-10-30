import Link from "next/link";
import type { ReactNode } from "react";
import { Boxes, LockKeyhole, PackageOpen, ScanBarcode, ShoppingBag, Store, WifiOff, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";

type Place = "admin" | "till";

const PLACES: Record<Place, { name: string; headline: string; lead: string; features: { icon: LucideIcon; title: string; text: string }[] }> = {
  admin: {
    name: "Admin panel",
    headline: "Run the whole shop from one place.",
    lead: "Orders, stock, the shop till and your team, all in one admin.",
    features: [
      { icon: ShoppingBag, title: "Website orders", text: "Pack, send and follow every order." },
      { icon: Boxes, title: "Stock and prices", text: "Keep the shelves and the website in step." },
      { icon: Store, title: "Shop till", text: "Sales, shifts and refunds at a glance." },
    ],
  },
  till: {
    name: "Shop till",
    headline: "Ready to serve customers?",
    lead: "Sign in to open your shift and start selling.",
    features: [
      { icon: ScanBarcode, title: "Scan or search", text: "Find any product in a second." },
      { icon: PackageOpen, title: "Website orders", text: "Pack and hand over online orders." },
      { icon: WifiOff, title: "Keeps selling offline", text: "Sales go up when the internet is back." },
    ],
  },
};

function BrandName({ place }: { place: Place }) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark className="h-11 w-11 rounded-xl" />
      <span className="leading-tight">
        <span className="block font-display text-[18px] font-extrabold text-white">The Boamah&rsquo;s</span>
        <span className="block text-[13px] font-bold text-gold-300">{PLACES[place].name}</span>
      </span>
    </span>
  );
}

/**
 * The staff sign-in pages: the brand and what the place is for on one side,
 * the form on the other. On a phone the brand shrinks to a band at the top.
 */
export function AuthShell({ place, children }: { place: Place; children: ReactNode }) {
  const info = PLACES[place];
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="hidden bg-brand-900 px-12 py-12 text-white lg:flex lg:flex-col xl:px-16">
        <BrandName place={place} />
        <div className="my-auto max-w-lg py-12">
          <p className="flex items-center gap-2 text-[13px] font-bold text-gold-300">
            <LockKeyhole className="h-4 w-4" aria-hidden="true" /> Staff only
          </p>
          <p className="mt-4 font-display text-[42px] font-extrabold leading-[1.08] tracking-tight xl:text-[48px]">{info.headline}</p>
          <p className="mt-4 text-[17px] font-medium text-brand-100">{info.lead}</p>
          <ul className="mt-10 divide-y divide-white/10 border-y border-white/10">
            {info.features.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4 py-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" aria-hidden="true" />
                <span>
                  <span className="block text-[15px] font-extrabold">{title}</span>
                  <span className="block text-[14px] font-medium text-brand-200">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] font-medium text-brand-300">A private page for The Boamah&rsquo;s staff.</p>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="bg-brand-900 px-6 pb-8 pt-7 text-white lg:hidden">
          <BrandName place={place} />
          <p className="mt-6 font-display text-[26px] font-extrabold leading-tight tracking-tight">{info.headline}</p>
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[420px]">{children}</div>
        </main>
        {place === "admin" ? (
          <p className="pb-6 text-center text-[13px] font-medium text-ink-subtle">
            Looking for groceries?{" "}
            <Link href="/shop" className="font-bold text-brand-700 hover:underline">
              Go to the shop
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The heading block above each form. */
export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-[30px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
      {children ? <p className="mt-2 text-[15px] font-medium text-ink-muted">{children}</p> : null}
    </div>
  );
}
