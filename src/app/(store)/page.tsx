import { CategoryTiles, Hero, PromoBanners, SectionHeading, TrustSection } from "@/components/store/home-sections";
import { ProductGrid } from "@/components/store/product-card";
import { RecentlyViewed } from "@/components/store/recently-viewed";
import type { ProductCardView } from "@/lib/catalog-types";
import { siteUrl } from "@/lib/utils";
import { getActiveBanners } from "@/server/banners";
import { getActiveCategories, getBestSellers, getFeaturedProducts, getHeroProducts, getNewArrivals, getOnSaleProducts } from "@/server/catalog";
import { getStoreSettings } from "@/server/settings";

export const metadata = {
  alternates: { canonical: "/" },
};

function ProductRow({
  id,
  title,
  subtitle,
  href,
  products,
  priorityCount = 0,
}: {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  products: ProductCardView[];
  priorityCount?: number;
}) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={id} className="container-page mt-12">
      <SectionHeading id={id} title={title} subtitle={subtitle} href={href} />
      <ProductGrid products={products} priorityCount={priorityCount} />
    </section>
  );
}

export default async function HomePage() {
  const [settings, heroBanners, promoBanners, categories, featured, bestSellers, newArrivals, offers, heroProducts] = await Promise.all([
    getStoreSettings(),
    getActiveBanners("HERO", 1),
    getActiveBanners("HOME_PROMO", 3),
    getActiveCategories(),
    getFeaturedProducts(10),
    getBestSellers(5),
    getNewArrivals(10),
    getOnSaleProducts(5),
    getHeroProducts(),
  ]);

  const stocked = categories.filter((c) => c.productCount > 0);
  const organization = {
    "@context": "https://schema.org",
    "@type": "GroceryStore",
    name: settings.storeName,
    url: siteUrl("/"),
    ...(settings.contactPhone ? { telephone: settings.contactPhone } : {}),
    ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
    ...(settings.address ? { address: settings.address } : {}),
    currenciesAccepted: settings.currency,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, "\\u003c") }} />
      <Hero
        banner={heroBanners[0] ?? null}
        products={heroProducts}
        stats={{ products: stocked.reduce((sum, c) => sum + c.productCount, 0), categories: stocked.length }}
      />
      <CategoryTiles categories={stocked} />
      <RecentlyViewed title="Pick up where you left off" className="container-page mt-12" />
      <ProductRow
        id="featured-title"
        title="Featured this week"
        subtitle="Our favourites from the shelves this week."
        href="/shop"
        products={featured}
        priorityCount={2}
      />
      <PromoBanners banners={promoBanners} />
      <ProductRow id="offers-title" title="Special offers" subtitle="Reduced prices for a limited time." href="/offers" products={offers} />
      <ProductRow id="bestsellers-title" title="Best sellers" subtitle="What other shoppers are buying." href="/shop" products={bestSellers} />
      <ProductRow id="new-title" title="New arrivals" subtitle="Recently added to the store." href="/shop?sort=newest" products={newArrivals} />
      <TrustSection hasSupportContact={Boolean(settings.contactPhone || settings.contactEmail)} />
    </>
  );
}
