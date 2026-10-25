import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/store/page-header";
import { getActiveCategories } from "@/server/catalog";

export const metadata: Metadata = {
  title: "All categories",
  description: "Browse groceries by category: rice, cooking oil, breakfast, juices, snacks, health, personal care and pet food.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const categories = await getActiveCategories();
  return (
    <>
      <PageHeader title="All categories" crumbs={[{ href: "/", label: "Home" }, { label: "Categories" }]} />
      <div className="container-page">
        {categories.length === 0 ? (
          <EmptyState icon={<LayoutGrid />} title="No categories yet" description="Please check back soon." />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categories/${category.slug}`}
                  className="group block overflow-hidden rounded-lg border border-line bg-surface transition-[border-color,box-shadow] hover:border-brand-200 hover:shadow-[var(--shadow-raised)]"
                >
                  <div className="relative aspect-[4/3] bg-soft">
                    {category.imageUrl ? (
                      <Image
                        src={category.imageUrl}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 300px, (min-width: 640px) 33vw, 50vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : null}
                  </div>
                  <div className="p-4">
                    <h2 className="text-base font-bold">{category.name}</h2>
                    {category.description ? <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{category.description}</p> : null}
                    <p className="mt-2 text-xs font-semibold text-leaf-600">
                      {category.productCount} {category.productCount === 1 ? "product" : "products"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
