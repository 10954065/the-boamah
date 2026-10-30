import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryHeader } from "@/components/store/page-header";
import { ProductListing } from "@/components/store/product-listing";
import { hasActiveFilters, parseListingParams } from "@/lib/listing-params";
import { pageOpenGraph } from "@/lib/open-graph";
import { getCategoryBySlug } from "@/server/catalog";

export async function generateMetadata({ params, searchParams }: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };
  const listing = parseListingParams(await searchParams);
  const description = category.description ?? `Shop ${category.name.toLowerCase()} online at The Boamah's Online Grocery Shop.`;
  return {
    title: category.name,
    description,
    alternates: { canonical: `/categories/${category.slug}` },
    openGraph: pageOpenGraph(category.name, description),
    robots: hasActiveFilters(listing) ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  const listing = parseListingParams(await searchParams);

  return (
    <>
      <CategoryHeader
        category={category}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/categories", label: "Categories" },
          { label: category.name },
        ]}
      />
      <div className="container-page">
        <ProductListing basePath={`/categories/${category.slug}`} params={listing} fixedCategory={category.slug} />
      </div>
    </>
  );
}
