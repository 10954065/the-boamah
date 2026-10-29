import "server-only";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import type { HeroProduct, ProductCardView, ProductDetailView, SortOption, VariantView } from "@/lib/catalog-types";
import { prisma } from "@/lib/db";
import { effectiveUnitPrice, isSaleActive, usefulTiers } from "@/lib/pricing";
import { clampToValidQuantity, type SellingUnitCode } from "@/lib/quantity";
import { storefrontCached } from "@/server/storefront-cache";

export const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

interface VariantRow {
  id: string;
  name: string;
  sku: string;
  unit: string;
  priceMinor: number;
  salePriceMinor: number | null;
  saleEndsAt?: Date | null;
  stepMilli: number;
  minQtyMilli: number;
  maxQtyMilli: number | null;
  stockMilli: number;
  lowStockMilli: number;
  priceTiers?: { minQtyMilli: number; unitPriceMinor: number }[];
}

export function toVariantView(variant: VariantRow): VariantView {
  const rules = { stepMilli: variant.stepMilli, minQtyMilli: variant.minQtyMilli, maxQtyMilli: variant.maxQtyMilli };
  const available = clampToValidQuantity(variant.stockMilli, rules) ?? 0;
  const onSale = isSaleActive(variant);
  return {
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    unit: variant.unit as SellingUnitCode,
    priceMinor: variant.priceMinor,
    salePriceMinor: onSale ? variant.salePriceMinor : null,
    saleEndsAt: onSale && variant.saleEndsAt ? variant.saleEndsAt.toISOString() : null,
    effectivePriceMinor: effectiveUnitPrice(variant),
    stepMilli: variant.stepMilli,
    minQtyMilli: variant.minQtyMilli,
    maxQtyMilli: variant.maxQtyMilli,
    availableMilli: available,
    inStock: available > 0,
    lowStock: available > 0 && variant.stockMilli <= variant.lowStockMilli,
    tiers: usefulTiers(variant, variant.priceTiers ?? []).map(({ minQtyMilli, unitPriceMinor }) => ({ minQtyMilli, unitPriceMinor })),
  };
}

const cardInclude = {
  category: { select: { name: true, slug: true } },
  images: { orderBy: { sortOrder: "asc" }, take: 1 },
  variants: { where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], include: { priceTiers: true } },
} satisfies Prisma.ProductInclude;

type CardProduct = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

function toCardView(product: CardProduct): ProductCardView {
  const image = product.images[0];
  const first = product.variants[0];
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    categoryName: product.category.name,
    categorySlug: product.category.slug,
    imageUrl: image?.url ?? null,
    imageAlt: image?.alt ?? product.name,
    isFeatured: product.isFeatured,
    variantCount: product.variants.length,
    defaultVariant: first ? toVariantView(first) : null,
    rating: null,
  };
}

/** Adds star ratings (approved reviews) to cards with one grouped query. */
async function withRatings(cards: ProductCardView[]): Promise<ProductCardView[]> {
  if (cards.length === 0) return cards;
  const groups = await prisma.review.groupBy({
    by: ["productId"],
    where: { productId: { in: cards.map((c) => c.id) }, status: "APPROVED" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const byProduct = new Map(groups.map((g) => [g.productId, { average: Math.round((g._avg.rating ?? 0) * 10) / 10, count: g._count._all }]));
  return cards.map((card) => ({ ...card, rating: byProduct.get(card.id) ?? null }));
}

const publishedWhere = {
  status: "PUBLISHED",
  category: { isActive: true },
  variants: { some: { isActive: true } },
} satisfies Prisma.ProductWhereInput;

export async function cardsByIds(ids: string[]): Promise<ProductCardView[]> {
  if (ids.length === 0) return [];
  const products = await prisma.product.findMany({ where: { id: { in: ids }, ...publishedWhere }, include: cardInclude });
  const byId = new Map((await withRatings(products.map(toCardView))).map((card) => [card.id, card]));
  return ids.map((id) => byId.get(id)).filter((p): p is ProductCardView => Boolean(p));
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
}

export const getActiveCategories = cache((): Promise<CategoryView[]> => storefrontCached("categories", loadActiveCategories));

async function loadActiveCategories(): Promise<CategoryView[]> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: { where: { status: "PUBLISHED" } } } } },
  });
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    imageUrl: c.imageUrl,
    productCount: c._count.products,
  }));
}

export async function getCategoryBySlug(slug: string): Promise<CategoryView | null> {
  const categories = await getActiveCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

// ---------------------------------------------------------------------------
// Listing / search
// ---------------------------------------------------------------------------

export interface ProductQuery {
  q?: string;
  categorySlug?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  inStockOnly?: boolean;
  onSaleOnly?: boolean;
  sort?: SortOption;
  page?: number;
  pageSize?: number;
}

export interface ProductPage {
  items: ProductCardView[];
  total: number;
  page: number;
  totalPages: number;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Lists published products using the default (or first active) variant's
 * effective price for price filters and sorting. Fully parameterised SQL.
 */
export function listProducts(query: ProductQuery): Promise<ProductPage> {
  const pageSize = Math.min(Math.max(query.pageSize ?? PAGE_SIZE, 1), 60);
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const term = query.q?.trim().slice(0, 100);
  // The search is case-insensitive, so "Rice" and "rice" share one entry.
  const key = JSON.stringify([term?.toLowerCase(), query.categorySlug, query.minPriceMinor, query.maxPriceMinor, query.inStockOnly, query.onSaleOnly, query.sort, page, pageSize]);
  return storefrontCached(`list:${key}`, () => queryProducts(query, term, page, pageSize));
}

async function queryProducts(query: ProductQuery, term: string | undefined, page: number, pageSize: number): Promise<ProductPage> {
  const conditions: Prisma.Sql[] = [Prisma.sql`p.status = 'PUBLISHED'`];

  if (term) {
    const pattern = `%${escapeLike(term.toLowerCase())}%`;
    conditions.push(Prisma.sql`(
      lower(p.name) LIKE ${pattern} OR lower(p."searchKeywords") LIKE ${pattern}
      OR lower(p.description) LIKE ${pattern} OR lower(c.name) LIKE ${pattern}
    )`);
  }
  if (query.categorySlug) conditions.push(Prisma.sql`c.slug = ${query.categorySlug}`);
  if (query.minPriceMinor !== undefined) conditions.push(Prisma.sql`v.effective >= ${query.minPriceMinor}`);
  if (query.maxPriceMinor !== undefined) conditions.push(Prisma.sql`v.effective <= ${query.maxPriceMinor}`);
  if (query.inStockOnly) conditions.push(Prisma.sql`v.available`);
  if (query.onSaleOnly) conditions.push(Prisma.sql`v.on_sale`);

  const relevance = term
    ? Prisma.sql`CASE WHEN lower(p.name) LIKE ${`${escapeLike(term.toLowerCase())}%`} THEN 0
                     WHEN lower(p.name) LIKE ${`%${escapeLike(term.toLowerCase())}%`} THEN 1 ELSE 2 END,`
    : Prisma.empty;

  const orderBy = (() => {
    switch (query.sort) {
      case "price-asc":
        return Prisma.sql`v.effective ASC, p.name ASC`;
      case "price-desc":
        return Prisma.sql`v.effective DESC, p.name ASC`;
      case "newest":
        return Prisma.sql`COALESCE(p."publishedAt", p."createdAt") DESC, p.id`;
      case "name":
        return Prisma.sql`p.name ASC`;
      default:
        return Prisma.sql`${relevance} v.available DESC, p."isFeatured" DESC, COALESCE(p."publishedAt", p."createdAt") DESC, p.id`;
    }
  })();

  const rows = await prisma.$queryRaw<{ id: string; total: bigint }[]>`
    SELECT p.id, count(*) OVER() AS total
    FROM "Product" p
    JOIN "Category" c ON c.id = p."categoryId" AND c."isActive"
    JOIN LATERAL (
      SELECT CASE WHEN s.active THEN pv."salePriceMinor" ELSE pv."priceMinor" END AS effective,
             (pv."stockMilli" >= pv."minQtyMilli") AS available,
             s.active AS on_sale
      FROM "ProductVariant" pv
      CROSS JOIN LATERAL (
        SELECT (pv."salePriceMinor" IS NOT NULL AND pv."salePriceMinor" >= 0 AND pv."salePriceMinor" < pv."priceMinor"
                AND (pv."saleEndsAt" IS NULL OR pv."saleEndsAt" > now())) AS active
      ) s
      WHERE pv."productId" = p.id AND pv."isActive"
      ORDER BY pv."isDefault" DESC, pv."sortOrder" ASC
      LIMIT 1
    ) v ON true
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY ${orderBy}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;

  const total = rows.length > 0 ? Number(rows[0]!.total) : 0;
  return {
    items: await cardsByIds(rows.map((r) => r.id)),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ---------------------------------------------------------------------------
// Curated collections
// ---------------------------------------------------------------------------

export function getFeaturedProducts(limit = 10): Promise<ProductCardView[]> {
  return storefrontCached(`featured:${limit}`, async () => {
    const products = await prisma.product.findMany({
      where: { ...publishedWhere, isFeatured: true },
      include: cardInclude,
      orderBy: { publishedAt: "desc" },
      take: limit,
    });
    return withRatings(products.map(toCardView));
  });
}

export function getNewArrivals(limit = 10): Promise<ProductCardView[]> {
  return storefrontCached(`new:${limit}`, async () => {
    const products = await prisma.product.findMany({
      where: publishedWhere,
      include: cardInclude,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    return withRatings(products.map(toCardView));
  });
}

const NEW_FOR_DAYS = 21;

/**
 * Products for the rotating hero grid: published, in stock and with a photo,
 * newest first. A product added in the admin joins the rotation on the next
 * page load and starts in the opening grid because it is the newest.
 */
export function getHeroProducts(limit = 24): Promise<HeroProduct[]> {
  return storefrontCached(`hero:${limit}`, () => loadHeroProducts(limit));
}

async function loadHeroProducts(limit: number): Promise<HeroProduct[]> {
  const products = await prisma.product.findMany({
    where: {
      status: "PUBLISHED",
      category: { isActive: true },
      images: { some: {} },
      variants: { some: { isActive: true, stockMilli: { gt: 0 } } },
    },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: limit,
    select: { slug: true, name: true, publishedAt: true, createdAt: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, alt: true } } },
  });
  const newSince = Date.now() - NEW_FOR_DAYS * 86_400_000;
  const isRecent = (p: (typeof products)[number]) => (p.publishedAt ?? p.createdAt).getTime() >= newSince;
  // "New" only means something next to older stock; a brand-new shop shows no badges.
  const showNew = products.some((p) => !isRecent(p));
  return products.flatMap((p) => {
    const image = p.images[0];
    if (!image) return [];
    return [{ slug: p.slug, name: p.name, imageUrl: image.url, imageAlt: image.alt || p.name, isNew: showNew && isRecent(p) }];
  });
}

export async function getOnSaleProducts(limit = 10): Promise<ProductCardView[]> {
  const page = await listProducts({ onSaleOnly: true, sort: "featured", pageSize: limit });
  return page.items;
}

/** Best sellers by quantity sold in non-cancelled orders over the last 90 days. */
export function getBestSellers(limit = 10): Promise<ProductCardView[]> {
  return storefrontCached(`bestsellers:${limit}`, () => loadBestSellers(limit));
}

async function loadBestSellers(limit: number): Promise<ProductCardView[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<{ productId: string }[]>`
    SELECT oi."productId"
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    WHERE oi."productId" IS NOT NULL
      AND o.status <> 'CANCELLED'
      AND o.status <> 'PENDING_PAYMENT'
      AND o."createdAt" >= ${since}
    GROUP BY oi."productId"
    ORDER BY sum(oi."quantityMilli") DESC
    LIMIT ${limit}
  `;
  return cardsByIds(rows.map((r) => r.productId));
}

// ---------------------------------------------------------------------------
// Product detail
// ---------------------------------------------------------------------------

export const getProductBySlug = cache((slug: string): Promise<ProductDetailView | null> => storefrontCached(`product:${slug}`, () => loadProduct(slug)));

async function loadProduct(slug: string): Promise<ProductDetailView | null> {
  const product = await prisma.product.findFirst({
    where: { slug, ...publishedWhere },
    include: {
      category: { select: { name: true, slug: true } },
      images: { orderBy: { sortOrder: "asc" } },
      variants: { where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], include: { priceTiers: true } },
    },
  });
  if (!product) return null;
  const variants = product.variants.map(toVariantView);
  const cover = product.images[0];
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    categorySlug: product.category.slug,
    imageUrl: cover?.url ?? null,
    imageAlt: cover?.alt ?? product.name,
    isFeatured: product.isFeatured,
    variantCount: variants.length,
    defaultVariant: variants[0] ?? null,
    rating: null,
    description: product.description,
    shortDescription: product.shortDescription,
    images: product.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, credit: i.credit })),
    variants,
    publishedAt: product.publishedAt?.toISOString() ?? null,
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function getRelatedProducts(product: { id: string; categoryId: string }, limit = 6): Promise<ProductCardView[]> {
  return storefrontCached(`related:${product.id}:${product.categoryId}:${limit}`, async () => {
    const products = await prisma.product.findMany({
      where: { ...publishedWhere, categoryId: product.categoryId, id: { not: product.id } },
      include: cardInclude,
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
      take: limit,
    });
    return withRatings(products.map(toCardView));
  });
}

/**
 * Products most often in the same order as this one (completed and active
 * orders only), most frequent first. Empty until there is order history.
 */
export function getBoughtTogether(productId: string, limit = 3): Promise<ProductCardView[]> {
  return storefrontCached(`together:${productId}:${limit}`, () => loadBoughtTogether(productId, limit));
}

async function loadBoughtTogether(productId: string, limit: number): Promise<ProductCardView[]> {
  const rows = await prisma.$queryRaw<{ productId: string }[]>`
    SELECT other."productId"
    FROM "OrderItem" mine
    JOIN "Order" o ON o.id = mine."orderId"
    JOIN "OrderItem" other ON other."orderId" = mine."orderId" AND other."productId" <> mine."productId"
    WHERE mine."productId" = ${productId}
      AND other."productId" IS NOT NULL
      AND o.status NOT IN ('CANCELLED', 'PENDING_PAYMENT')
    GROUP BY other."productId"
    ORDER BY count(DISTINCT mine."orderId") DESC, max(o."createdAt") DESC
    LIMIT ${limit * 2}
  `;
  const cards = await cardsByIds(rows.map((r) => r.productId));
  return cards.filter((card) => card.defaultVariant?.inStock).slice(0, limit);
}

/** Lightweight suggestions for the header search box. */
export async function searchSuggestions(term: string, limit = 6): Promise<{ slug: string; name: string; imageUrl: string | null; categoryName: string }[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const page = await listProducts({ q, pageSize: limit });
  return page.items.map((p) => ({ slug: p.slug, name: p.name, imageUrl: p.imageUrl, categoryName: p.categoryName }));
}
