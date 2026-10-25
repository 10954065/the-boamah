import type { Metadata } from "next";
import { PageHeader } from "@/components/store/page-header";
import { ProductListing } from "@/components/store/product-listing";
import { hasActiveFilters, parseListingParams } from "@/lib/listing-params";

export async function generateMetadata({ searchParams }: PageProps<"/shop">): Promise<Metadata> {
  const params = parseListingParams(await searchParams);
  return {
    title: params.q ? `Search results for “${params.q}”` : "Shop all groceries",
    description: "Browse fresh produce, pantry staples, drinks, bakery and household essentials.",
    alternates: { canonical: "/shop" },
    // Filtered and search result pages are not indexed separately.
    robots: hasActiveFilters(params) || params.category ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const params = parseListingParams(await searchParams);
  return (
    <>
      <PageHeader
        title={params.q ? `Results for “${params.q}”` : "Shop all groceries"}
        description="Fresh produce, pantry staples, drinks, bakery and household essentials."
        crumbs={[{ href: "/", label: "Home" }, { label: "Shop" }]}
      />
      <div className="container-page">
        <ProductListing basePath="/shop" params={params} />
      </div>
    </>
  );
}
