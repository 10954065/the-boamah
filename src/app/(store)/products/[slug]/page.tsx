import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleAlert, CircleSlash, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProductPurchase } from "@/components/store/add-to-cart";
import { Breadcrumbs } from "@/components/store/page-header";
import { Price } from "@/components/store/price";
import { ProductGrid } from "@/components/store/product-card";
import { ProductGallery } from "@/components/store/product-gallery";
import { SectionHeading } from "@/components/store/home-sections";
import { WishlistButton } from "@/components/store/wishlist-button";
import { minorToDecimalString } from "@/lib/money";
import { discountPercent } from "@/lib/pricing";
import { siteUrl } from "@/lib/utils";
import { getProductBySlug, getRelatedProducts } from "@/server/catalog";
import { getWishlistIds } from "@/server/wishlist";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found", robots: { index: false } };
  const description = product.shortDescription ?? product.description.slice(0, 155);
  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: "website",
      title: product.name,
      description,
      images: product.imageUrl ? [{ url: product.imageUrl, alt: product.imageAlt }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [related, savedIds] = await Promise.all([getRelatedProducts(product), getWishlistIds()]);
  const variant = product.defaultVariant;
  const discount = variant ? discountPercent(variant) : null;
  const anyInStock = product.variants.some((v) => v.inStock);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription ?? product.description,
    image: product.images.map((i) => (i.url.startsWith("http") ? i.url : siteUrl(i.url))),
    sku: variant?.sku,
    category: product.categoryName,
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      name: v.name,
      sku: v.sku,
      price: minorToDecimalString(v.effectivePriceMinor),
      priceCurrency: "GHS",
      availability: v.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: siteUrl(`/products/${product.slug}`),
    })),
  };

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
          <Link href={`/categories/${product.categorySlug}`} className="text-xs font-bold uppercase tracking-wider text-leaf-600 hover:underline">
            {product.categoryName}
          </Link>
          <h1 className="mt-2 text-[28px] font-extrabold leading-tight sm:text-[32px]">{product.name}</h1>
          {product.shortDescription ? <p className="mt-3 text-[15px] leading-7 text-ink-muted">{product.shortDescription}</p> : null}

          {variant ? (
            <div className="mt-5 border-y border-line py-5">
              <Price size="lg" priceMinor={variant.priceMinor} effectivePriceMinor={variant.effectivePriceMinor} unit={variant.unit} />
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
            <ProductPurchase variants={product.variants} productName={product.name} />
            <WishlistButton variant="full" productId={product.id} productName={product.name} initialSaved={savedIds.has(product.id)} />
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

      <section aria-labelledby="description-title" className="mt-14 max-w-3xl">
        <h2 id="description-title" className="text-xl font-extrabold">
          Product description
        </h2>
        <div className="prose-policy mt-3 whitespace-pre-line">{product.description}</div>
      </section>

      {related.length > 0 ? (
        <section aria-labelledby="related-title" className="mt-14">
          <SectionHeading id="related-title" title={`More in ${product.categoryName}`} href={`/categories/${product.categorySlug}`} />
          <ProductGrid products={related} savedIds={savedIds} />
        </section>
      ) : null}
    </div>
  );
}
