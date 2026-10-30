import { minorToDecimalString } from "@/lib/money";

/**
 * The schema.org Product data on product pages, which Google reads for
 * product results. Everything here comes from the shop's own records:
 * nothing is filled in to satisfy a checker.
 */

const COUNTRY = "GH";
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** The barcode as a GTIN when it is one (EAN, UPC or GTIN-14 with a correct check digit); the shop's own codes give null. */
export function gtinFromBarcode(barcode: string | null | undefined): string | null {
  const code = barcode?.trim() ?? "";
  if (!/^\d+$/.test(code) || !GTIN_LENGTHS.has(code.length) || /^0+$/.test(code)) return null;
  const digits = [...code].map(Number);
  const check = digits.pop();
  // From the right, the digits before the check digit are weighted 3, 1, 3, 1...
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check ? code : null;
}

export interface SchemaOffer {
  name: string;
  sku: string;
  barcode: string | null;
  priceMinor: number;
  effectivePriceMinor: number;
  saleEndsAt: string | null;
  inStock: boolean;
  /** When this variant's price last changed (any change to the variant counts), as an ISO time. */
  priceSince: string;
}

export interface SchemaReview {
  authorName: string;
  createdAt: string;
  title: string | null;
  body: string;
  rating: number;
}

export interface ProductSchemaInput {
  name: string;
  description: string;
  url: string;
  images: string[];
  category: string;
  brand: string | null;
  offers: SchemaOffer[];
  reviews: { average: number; count: number; items: SchemaReview[] };
  /** The lowest delivery fee of the active zones; null when the shop has no zones. */
  deliveryFeeMinor: number | null;
  /** From the store settings: days to return an item, 0 for no returns, null when not set. */
  returnDays: number | null;
  currency: string;
}

type JsonLd = Record<string, unknown>;

function returnPolicy(days: number | null): JsonLd | null {
  if (days === null) return null;
  const base = { "@type": "MerchantReturnPolicy", applicableCountry: COUNTRY };
  return days === 0
    ? { ...base, returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted" }
    : { ...base, returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow", merchantReturnDays: days };
}

function shipping(feeMinor: number | null, currency: string): JsonLd | null {
  if (feeMinor === null) return null;
  return {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: minorToDecimalString(feeMinor), currency },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: COUNTRY },
  };
}

function toOffer(offer: SchemaOffer, product: ProductSchemaInput, extras: JsonLd): JsonLd {
  const gtin = gtinFromBarcode(offer.barcode);
  const onSale = offer.effectivePriceMinor < offer.priceMinor;
  return {
    "@type": "Offer",
    name: offer.name,
    sku: offer.sku,
    ...(gtin ? { gtin } : {}),
    url: product.url,
    price: minorToDecimalString(offer.effectivePriceMinor),
    priceCurrency: product.currency,
    validFrom: offer.priceSince,
    ...(offer.saleEndsAt ? { priceValidUntil: offer.saleEndsAt.slice(0, 10) } : {}),
    ...(onSale
      ? {
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            priceType: "https://schema.org/StrikethroughPrice",
            price: minorToDecimalString(offer.priceMinor),
            priceCurrency: product.currency,
          },
        }
      : {}),
    itemCondition: "https://schema.org/NewCondition",
    availability: offer.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    ...extras,
  };
}

export function productJsonLd(product: ProductSchemaInput): JsonLd {
  const [first] = product.offers;
  const gtin = gtinFromBarcode(first?.barcode);
  const delivery = shipping(product.deliveryFeeMinor, product.currency);
  const returns = returnPolicy(product.returnDays);
  const extras: JsonLd = { ...(delivery ? { shippingDetails: delivery } : {}), ...(returns ? { hasMerchantReturnPolicy: returns } : {}) };
  const { reviews } = product;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images,
    ...(first ? { sku: first.sku } : {}),
    ...(gtin ? { gtin } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    category: product.category,
    offers: product.offers.map((offer) => toOffer(offer, product, extras)),
    ...(reviews.count > 0
      ? {
          aggregateRating: { "@type": "AggregateRating", ratingValue: reviews.average, reviewCount: reviews.count, bestRating: 5, worstRating: 1 },
          review: reviews.items.map((review) => ({
            "@type": "Review",
            author: { "@type": "Person", name: review.authorName },
            datePublished: review.createdAt.slice(0, 10),
            ...(review.title ? { name: review.title } : {}),
            reviewBody: review.body,
            reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5, worstRating: 1 },
          })),
        }
      : {}),
  };
}
