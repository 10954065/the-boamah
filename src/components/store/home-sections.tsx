import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CreditCard, Headset, ReceiptText, ShoppingCart, Truck } from "lucide-react";
import type { PromoBanner } from "@/generated/prisma/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CategoryView } from "@/server/catalog";

export function SectionHeading({
  id,
  title,
  subtitle,
  href,
  linkLabel = "View all",
}: {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 id={id} className="text-xl font-extrabold sm:text-2xl">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
          {linkLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

interface HeroContent {
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
}

export function Hero({ banner }: { banner: PromoBanner | null }) {
  const content: HeroContent = banner
    ? {
        eyebrow: banner.eyebrow,
        title: banner.title,
        subtitle: banner.subtitle,
        imageUrl: banner.imageUrl,
        ctaLabel: banner.ctaLabel ?? "Shop groceries",
        ctaHref: banner.ctaHref ?? "/shop",
      }
    : {
        eyebrow: "Everyday essentials, online",
        title: "Fresh Groceries, Delivered to Your Door.",
        subtitle:
          "Shop your everyday essentials, fresh produce, and family favourites from The Boamah's Online Grocery Shop.",
        imageUrl: "/images/banners/hero.webp",
        ctaLabel: "Shop Groceries",
        ctaHref: "/shop",
      };

  return (
    <section aria-labelledby="hero-title" className="container-page pt-5 sm:pt-7">
      <div className="relative grid overflow-hidden rounded-lg border border-line bg-soft lg:grid-cols-[1.05fr_1fr]">
        <div className="relative z-10 flex flex-col justify-center px-6 py-10 sm:px-10 lg:py-16 lg:pl-14">
          {content.eyebrow ? (
            <p className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-gold-700">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-500" aria-hidden="true" />
              {content.eyebrow}
            </p>
          ) : null}
          <h1 id="hero-title" className="max-w-xl text-[34px] font-extrabold leading-[1.06] text-brand-900 sm:text-[44px] lg:text-[52px]">
            {content.title}
          </h1>
          {content.subtitle ? <p className="mt-4 max-w-md text-base leading-7 text-ink-muted">{content.subtitle}</p> : null}
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={content.ctaHref} className={buttonVariants({ size: "lg" })}>
              {content.ctaLabel}
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/offers" className={buttonVariants({ size: "lg", variant: "outline" })}>
              View offers
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-medium text-ink-muted">
            <li className="flex items-center gap-1.5">
              <BadgeCheck className="h-4 w-4 text-leaf-600" aria-hidden="true" /> Secure checkout
            </li>
            <li className="flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-leaf-600" aria-hidden="true" /> Delivery &amp; pickup options
            </li>
          </ul>
        </div>
        <div className="relative min-h-[240px] sm:min-h-[320px] lg:min-h-[460px]">
          <Image
            src={content.imageUrl}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover lg:[clip-path:ellipse(92%_100%_at_100%_50%)]"
          />
        </div>
      </div>
    </section>
  );
}

export function CategoryTiles({ categories }: { categories: CategoryView[] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="categories-title" className="container-page mt-12">
      <SectionHeading id="categories-title" title="Shop by category" subtitle="Everything for your kitchen and home." href="/categories" linkLabel="All categories" />
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        {categories.map((category) => (
          <li key={category.id} className="w-[132px] shrink-0 snap-start sm:w-auto">
            <Link
              href={`/categories/${category.slug}`}
              className="group flex h-full flex-col items-center rounded-lg border border-line bg-surface p-3 text-center transition-[border-color,box-shadow] hover:border-brand-200 hover:shadow-[var(--shadow-raised)]"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-md bg-soft">
                {category.imageUrl ? (
                  <Image
                    src={category.imageUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 180px, (min-width: 640px) 22vw, 132px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : null}
              </div>
              <span className="mt-2.5 text-[13.5px] font-semibold leading-tight text-ink">{category.name}</span>
              <span className="mt-0.5 text-xs text-ink-subtle">
                {category.productCount} {category.productCount === 1 ? "product" : "products"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TONES: Record<string, string> = {
  leaf: "bg-leaf-50",
  gold: "bg-gold-50",
  cream: "bg-soft",
  brand: "bg-brand-50",
};

export function PromoBanners({ banners }: { banners: PromoBanner[] }) {
  if (banners.length === 0) return null;
  return (
    <section aria-label="Promotions" className="container-page mt-12">
      <ul className={cn("grid gap-4", banners.length > 1 && "md:grid-cols-2", banners.length > 2 && "lg:grid-cols-3")}>
        {banners.map((banner) => (
          <li key={banner.id}>
            <div className={cn("relative flex h-full min-h-[176px] overflow-hidden rounded-lg border border-line", TONES[banner.tone] ?? TONES.cream)}>
              <div className="relative z-10 flex w-[58%] flex-col justify-center p-5 sm:p-6">
                {banner.eyebrow ? (
                  <p className="text-[11px] font-bold uppercase tracking-wider text-leaf-600">{banner.eyebrow}</p>
                ) : null}
                <h3 className="mt-1.5 text-lg font-extrabold leading-snug text-brand-900">{banner.title}</h3>
                {banner.subtitle ? <p className="mt-1 text-[13px] leading-5 text-ink-muted">{banner.subtitle}</p> : null}
                {banner.ctaHref ? (
                  <Link
                    href={banner.ctaHref}
                    className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-semibold text-brand-700 after:absolute after:inset-0 hover:underline"
                  >
                    {banner.ctaLabel ?? "Shop now"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
              <div className="absolute inset-y-0 right-0 w-[46%]">
                <Image
                  src={banner.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 200px, 45vw"
                  className="object-cover [clip-path:circle(78%_at_100%_50%)]"
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TrustSection({ hasSupportContact }: { hasSupportContact: boolean }) {
  const items = [
    { Icon: ShoppingCart, title: "Convenient ordering", body: "Order from your phone or computer whenever it suits you." },
    { Icon: CreditCard, title: "Secure checkout", body: "Online payments are processed by a licensed payment provider." },
    { Icon: ReceiptText, title: "Clear pricing", body: "Prices, delivery fees and discounts are shown before you pay." },
    { Icon: Truck, title: "Delivery options", body: "Choose delivery to your area, or pickup where available." },
    ...(hasSupportContact
      ? [{ Icon: Headset, title: "Customer support", body: "Questions about an order? Our team is here to help." }]
      : []),
  ];
  return (
    <section aria-labelledby="why-title" className="container-page mt-16">
      <div className="rounded-lg bg-brand-800 px-6 py-10 text-brand-50 sm:px-10">
        <h2 id="why-title" className="text-xl font-extrabold text-white sm:text-2xl">
          Why shop with The Boamah&rsquo;s?
        </h2>
        <ul className={cn("mt-7 grid gap-6 sm:grid-cols-2", items.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
          {items.map(({ Icon, title, body }) => (
            <li key={title}>
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-700 text-leaf-400">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 text-[15px] font-bold text-white">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-brand-200">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
