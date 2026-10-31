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

/** The cheapest active delivery zone: its fee, and its days on the road when the shop has set them. */
export interface SchemaDelivery {
  feeMinor: number;
  transitMinDays: number | null;
  transitMaxDays: number | null;
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
  /** The cheapest active delivery zone; null when the shop has no zones. */
  delivery: SchemaDelivery | null;
  /** From the store settings: most days to get an order out of the shop, null when not set. */
  handlingDays: number | null;
  /** The day a shelf price is quoted until when no sale ends sooner, as YYYY-MM-DD. */
  priceHeldUntil: string;
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

const days = (min: number, max: number): JsonLd => ({ "@type": "QuantitativeValue", minValue: min, maxValue: max, unitCode: "DAY" });

/** Delivery times only when the shop has given both parts: packing and the road. */
function deliveryTime(delivery: SchemaDelivery, handlingDays: number | null): JsonLd | null {
  if (handlingDays === null || delivery.transitMinDays === null || delivery.transitMaxDays === null) return null;
  return {
    "@type": "ShippingDeliveryTime",
    handlingTime: days(0, handlingDays),
    transitTime: days(delivery.transitMinDays, Math.max(delivery.transitMinDays, delivery.transitMaxDays)),
  };
}

function shipping(delivery: SchemaDelivery | null, handlingDays: number | null, currency: string): JsonLd | null {
  if (delivery === null) return null;
  const time = deliveryTime(delivery, handlingDays);
  return {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: minorToDecimalString(delivery.feeMinor), currency },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: COUNTRY },
    ...(time ? { deliveryTime: time } : {}),
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
    // A sale is quoted until it ends; a shelf price until the rolling date the page gives.
    priceValidUntil: offer.saleEndsAt && onSale ? offer.saleEndsAt.slice(0, 10) : product.priceHeldUntil,
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
  const delivery = shipping(product.delivery, product.handlingDays, product.currency);
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
