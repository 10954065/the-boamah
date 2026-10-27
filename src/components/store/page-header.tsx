import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, PackageCheck } from "lucide-react";

interface Crumb {
  href?: string;
  label: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" /> : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-brand-700">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, description, crumbs, children }: { title: string; description?: ReactNode; crumbs: Crumb[]; children?: ReactNode }) {
  return (
    <div className="container-page pb-6 pt-6 sm:pt-8">
      <Breadcrumbs items={crumbs} />
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-sm text-ink-muted sm:text-[15px]">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

interface CategoryHeaderProps {
  category: { name: string; description: string | null; imageUrl: string | null; productCount: number };
  crumbs: Crumb[];
}

const line = (i: number) => ({ "--i": i }) as CSSProperties;

/** Banner for a category page: photo, name, description and how many products it holds. */
export function CategoryHeader({ category, crumbs }: CategoryHeaderProps) {
  return (
    <div className="container-page pb-6 pt-6 sm:pt-8">
      <Breadcrumbs items={crumbs} />
      <div className="relative isolate mt-4 overflow-hidden rounded-2xl bg-brand-900 text-white shadow-[var(--shadow-raised)]">
        {category.imageUrl ? (
          <div className="absolute inset-0 -z-10 sm:left-auto sm:w-[46%]">
            <Image
              src={category.imageUrl}
              alt=""
              fill
              priority
              sizes="(min-width: 640px) 46vw, 100vw"
              className="ken-burns object-cover sm:[clip-path:ellipse(92%_120%_at_100%_50%)]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-brand-900 via-brand-900/80 to-brand-900/30 sm:from-brand-900/60 sm:via-transparent sm:to-transparent" aria-hidden="true" />
          </div>
        ) : null}
        <div
          className="pointer-events-none absolute -left-16 -top-20 -z-10 h-56 w-56 rounded-full bg-leaf-500/25 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative max-w-xl px-6 py-8 sm:px-10 sm:py-10">
          <h1 className="rise text-[28px] font-extrabold leading-tight tracking-tight text-white sm:text-4xl" style={line(0)}>
            {category.name}
          </h1>
          {category.description ? (
            <p className="rise mt-2 text-[15px] leading-7 text-brand-100" style={line(1)}>
              {category.description}
            </p>
          ) : null}
          <p
            className="rise mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-50 ring-1 ring-white/20"
            style={line(2)}
          >
            <PackageCheck className="h-3.5 w-3.5 text-gold-300" aria-hidden="true" />
            {category.productCount} {category.productCount === 1 ? "product" : "products"}
          </p>
        </div>
      </div>
    </div>
  );
}
