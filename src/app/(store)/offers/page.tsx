import type { Metadata } from "next";
import { PageHeader } from "@/components/store/page-header";
import { ProductListing } from "@/components/store/product-listing";
import { hasActiveFilters, parseListingParams } from "@/lib/listing-params";

export async function generateMetadata({ searchParams }: PageProps<"/offers">): Promise<Metadata> {
  const params = parseListingParams(await searchParams);
  return {
    title: "Special offers",
    description: "Groceries currently on special offer at The Boamah's Online Grocery Shop.",
    alternates: { canonical: "/offers" },
    robots: hasActiveFilters(params) ? { index: false, follow: true } : undefined,
  };
}

export default async function OffersPage({ searchParams }: PageProps<"/offers">) {
  const params = parseListingParams(await searchParams);
  return (
    <>
      <PageHeader
        title="Special offers"
        description="Reduced prices on selected groceries, for a limited time and while stocks last."
        crumbs={[{ href: "/", label: "Home" }, { label: "Special offers" }]}
      />
      <div className="container-page">
        <ProductListing basePath="/offers" params={params} fixedOnSale />
      </div>
    </>
  );
}
