import type { ReactNode } from "react";
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
    <div className="container-page pb-3 pt-3 sm:pb-6 sm:pt-8">
      <Breadcrumbs items={crumbs} />
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4 sm:mt-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-3xl">{title}</h1>
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

/** Banner for a category page: photo, name, description and how many products it holds. */
export function CategoryHeader({ category, crumbs }: CategoryHeaderProps) {
  return (
    <div className="container-page pb-3 pt-3 sm:pb-6 sm:pt-8">
      <div className="hidden sm:block">
        <Breadcrumbs items={crumbs} />
      </div>
      <div className="relative isolate overflow-hidden rounded-xl bg-brand-900 text-white sm:mt-4 sm:rounded-2xl">
        {category.imageUrl ? (
          <div className="absolute inset-0 -z-10 sm:left-auto sm:w-[42%]">
            <Image src={category.imageUrl} alt="" fill priority sizes="(min-width: 640px) 42vw, 100vw" className="object-cover" />
            <div className="absolute inset-0 bg-brand-900/80 sm:hidden" aria-hidden="true" />
          </div>
        ) : null}
        <div className="relative flex max-w-xl items-center justify-between gap-3 px-4 py-3 sm:block sm:px-10 sm:py-10">
          <h1 className="min-w-0 text-xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">{category.name}</h1>
          {category.description ? <p className="mt-2 hidden text-[15px] leading-7 text-brand-100 sm:block">{category.description}</p> : null}
          <p className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-brand-100 sm:mt-4">
            <PackageCheck className="h-4 w-4 text-gold-300" aria-hidden="true" />
            {category.productCount} {category.productCount === 1 ? "product" : "products"}
          </p>
        </div>
      </div>
    </div>
  );
}
