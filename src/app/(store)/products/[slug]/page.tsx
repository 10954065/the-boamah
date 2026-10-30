import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleAlert, CircleSlash, Truck } from "lucide-react";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { ProductPurchase } from "@/components/store/add-to-cart";
import { BoughtTogether } from "@/components/store/bought-together";
import { Breadcrumbs } from "@/components/store/page-header";
import { Price } from "@/components/store/price";
import { ProductGrid } from "@/components/store/product-card";
import { ProductGallery } from "@/components/store/product-gallery";
import { ProductReviews } from "@/components/store/product-reviews";
import { RecentlyViewed, TrackRecentlyViewed } from "@/components/store/recently-viewed";
import { ShareButton } from "@/components/store/share-button";
import { SectionHeading } from "@/components/store/home-sections";
import { SaleCountdown } from "@/components/store/sale-countdown";
import { Stars } from "@/components/store/stars";
import { pageOpenGraph } from "@/lib/open-graph";
import { discountPercent } from "@/lib/pricing";
import { productJsonLd } from "@/lib/product-schema";
import { siteUrl } from "@/lib/utils";
import { whatsappLink } from "@/lib/whatsapp";
import { getBoughtTogether, getProductBySlug, getRelatedProducts } from "@/server/catalog";
import { getLowestDeliveryFee } from "@/server/delivery";
import { getReviewSummary } from "@/server/reviews";
import { getStoreSettings } from "@/server/settings";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found", robots: { index: false } };
  const description = product.shortDescription ?? product.description.slice(0, 155);
  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: pageOpenGraph(product.name, description),
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [related, reviews, settings, together, lowestDeliveryFee] = await Promise.all([
    getRelatedProducts(product),
    getReviewSummary(product.id),
    getStoreSettings(),
    getBoughtTogether(product.id),
    getLowestDeliveryFee(),
  ]);
  const thisItem = {
    id: product.id,
    slug: product.slug,
    name: product.name,
    categoryName: product.categoryName,
    categorySlug: product.categorySlug,
    imageUrl: product.imageUrl,
    imageAlt: product.imageAlt,
    isFeatured: product.isFeatured,
    variantCount: product.variantCount,
    defaultVariant: product.defaultVariant,
    rating: null,
  };
  const productUrl = siteUrl(`/products/${product.slug}`);
  const whatsapp = whatsappLink(settings.whatsappNumber, `Hi, I'd like to ask about ${product.name}. ${productUrl}`);
  const variant = product.defaultVariant;
  const discount = variant ? discountPercent(variant) : null;
  const anyInStock = product.variants.some((v) => v.inStock);

  const jsonLd = productJsonLd({
    name: product.name,
    description: product.shortDescription ?? product.description,
    url: productUrl,
    images: product.images.map((i) => (i.url.startsWith("http") ? i.url : siteUrl(i.url))),
    category: product.categoryName,
    brand: product.brand,
    offers: product.variants.map((v) => ({
      name: v.name,
      sku: v.sku,
      barcode: v.barcode,
      priceMinor: v.priceMinor,
      effectivePriceMinor: v.effectivePriceMinor,
      saleEndsAt: v.saleEndsAt,
      inStock: v.inStock,
      priceSince: v.priceSince,
    })),
    reviews: {
      average: reviews.average,
      count: reviews.count,
      items: reviews.reviews.slice(0, 5).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    },
    deliveryFeeMinor: lowestDeliveryFee,
    returnDays: settings.returnDays,
    currency: settings.currency,
  });

  return (
    <div className="container-page pt-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs
        items={[
          { href: "/", label: "Home" },
          { href: `/categories/${product.categorySlug}`, label: product.categoryName },
          { label: product.name },
        ]}
      />

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,560px)_1fr] lg:gap-12">
        <ProductGallery
          images={product.images}
          productName={product.name}
          badge={discount ? <Badge tone="sale" className="text-xs">Save {discount}%</Badge> : undefined}
        />

        <div>
          <div className="flex items-center justify-between gap-3">
            <Link href={`/categories/${product.categorySlug}`} className="text-xs font-bold uppercase tracking-wider text-leaf-600 hover:underline">
              {product.categoryName}
            </Link>
            <ShareButton title={product.name} path={`/products/${product.slug}`} />
          </div>
          <h1 className="mt-2 text-[28px] font-extrabold leading-tight sm:text-[32px]">{product.name}</h1>
          {reviews.count > 0 ? (
            <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-brand-700">
              <Stars rating={reviews.average} size="sm" />
              <span className="font-semibold text-ink">{reviews.average.toFixed(1)}</span>
              <span>
                ({reviews.count} review{reviews.count === 1 ? "" : "s"})
              </span>
            </a>
          ) : null}
          {product.shortDescription ? <p className="mt-3 text-[15px] leading-7 text-ink-muted">{product.shortDescription}</p> : null}

          {variant ? (
            <div className="mt-5 border-y border-line py-5">
              <Price size="lg" priceMinor={variant.priceMinor} effectivePriceMinor={variant.effectivePriceMinor} unit={variant.unit} />
              {variant.saleEndsAt ? <SaleCountdown endsAt={variant.saleEndsAt} className="mt-2" /> : null}
              <p className="mt-1 text-sm text-ink-muted">{variant.name}{product.variantCount > 1 ? " · other sizes available" : ""}</p>
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium">
                {!anyInStock ? (
                  <>
                    <CircleSlash className="h-4 w-4 text-danger" aria-hidden="true" />
                    <span className="text-danger">Out of stock</span>
                  </>
                ) : variant.lowStock ? (
                  <>
                    <CircleAlert className="h-4 w-4 text-warning" aria-hidden="true" />
                    <span className="text-warning">Low stock</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                    <span className="text-success">In stock</span>
                  </>
                )}
              </p>
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            <ProductPurchase
              variants={product.variants}
              productName={product.name}
              stockAlert={{ smsEnabled: settings.smsEnabled }}
              stickyBar
            />
          </div>

          <div className="mt-7 flex gap-3 rounded-lg border border-line bg-soft/60 p-4 text-sm text-ink-muted">
            <Truck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <p>
              Delivery fees depend on your area and are shown at checkout before you pay.{" "}
              <Link href="/policies/delivery" className="font-medium text-brand-700 hover:underline">
                Delivery information
              </Link>
            </p>
          </div>
        </div>
      </div>

      {together.length > 0 && product.defaultVariant?.inStock ? (
        <section aria-labelledby="together-title" className="mt-14">
          <h2 id="together-title" className="text-xl font-extrabold">
            Often bought together
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Based on what other customers ordered with {product.name}.</p>
          <div className="mt-4">
            <BoughtTogether products={[thisItem, ...together]} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="description-title" className="mt-14 max-w-3xl">
        <h2 id="description-title" className="text-xl font-extrabold">
          Product description
        </h2>
        <div className="prose-policy mt-3 whitespace-pre-line">{product.description}</div>
      </section>

      <ProductReviews summary={reviews} />

      {related.length > 0 ? (
        <section aria-labelledby="related-title" className="mt-14">
          <SectionHeading id="related-title" title={`More in ${product.categoryName}`} href={`/categories/${product.categorySlug}`} />
          <ProductGrid products={related} />
        </section>
      ) : null}

      <RecentlyViewed excludeSlug={product.slug} className="mt-14" />
      <TrackRecentlyViewed slug={product.slug} name={product.name} imageUrl={product.imageUrl} />
      {whatsapp ? <WhatsAppButton href={whatsapp} forProduct /> : null}
    </div>
  );
}
