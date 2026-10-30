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
      <LogoMark className="h-11 w-11 rounded-xl ring-2 ring-white/10" />
      <span className="leading-tight">
        <span className="block font-display text-[18px] font-extrabold text-white">The Boamah&rsquo;s</span>
        <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-gold-300">{PLACES[place].name}</span>
      </span>
    </span>
  );
}

/** Glows and a dot grid behind the brand panel, for depth without pictures. */
function Atmosphere() {
  return (
    <>
      <span aria-hidden="true" className="absolute -left-24 -top-24 -z-10 h-96 w-96 rounded-full bg-leaf-400/25 blur-3xl" />
      <span aria-hidden="true" className="absolute -bottom-40 right-0 -z-10 h-[28rem] w-[28rem] rounded-full bg-gold-400/20 blur-3xl" />
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.08)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
    </>
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
      <aside className="relative isolate hidden overflow-hidden bg-brand-900 px-12 py-12 text-white lg:flex lg:flex-col xl:px-16">
        <Atmosphere />
        <BrandName place={place} />
        <div className="my-auto max-w-lg py-12">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.16em] text-gold-300 ring-1 ring-white/15">
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> Staff only
          </p>
          <p className="mt-5 font-display text-[42px] font-extrabold leading-[1.08] tracking-tight xl:text-[48px]">{info.headline}</p>
          <p className="mt-4 text-[17px] font-medium text-brand-100">{info.lead}</p>
          <ul className="mt-10 space-y-3">
            {info.features.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-center gap-4 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-400 text-brand-900">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
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
        <header className="relative isolate overflow-hidden rounded-b-[2rem] bg-brand-900 px-6 pb-8 pt-7 text-white lg:hidden">
          <Atmosphere />
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
