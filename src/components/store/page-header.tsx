import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

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
