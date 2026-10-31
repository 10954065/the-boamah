import { describe, expect, test } from "vitest";
import { gtinFromBarcode, productJsonLd, type ProductSchemaInput, type SchemaOffer } from "@/lib/product-schema";

const offer = (over: Partial<SchemaOffer> = {}): SchemaOffer => ({
  name: "Box",
  sku: "OATS-1",
  barcode: null,
  priceMinor: 18500,
  effectivePriceMinor: 18500,
  saleEndsAt: null,
  inStock: true,
  priceSince: "2026-10-20T08:00:00.000Z",
  ...over,
});

const input = (over: Partial<ProductSchemaInput> = {}): ProductSchemaInput => ({
  name: "Quaker Quick 1-Minute Oats",
  description: "Whole grain oats.",
  url: "https://shop.example/products/quaker-quick-oats",
  images: ["https://shop.example/images/products/oats.webp"],
  category: "Breakfast & Coffee",
  brand: "Quaker",
  offers: [offer()],
  reviews: { average: 0, count: 0, items: [] },
  delivery: { feeMinor: 2000, transitMinDays: null, transitMaxDays: null },
  handlingDays: null,
  priceHeldUntil: "2026-11-30",
  returnDays: null,
  currency: "GHS",
  ...over,
});

type Json = Record<string, unknown>;
const offersOf = (data: Json) => data.offers as Json[];

describe("gtinFromBarcode", () => {
  test("accepts EAN-13, UPC-A, GTIN-8 and GTIN-14 codes with a correct check digit", () => {
    expect(gtinFromBarcode("4006381333931")).toBe("4006381333931");
    expect(gtinFromBarcode("036000291452")).toBe("036000291452");
    expect(gtinFromBarcode("96385074")).toBe("96385074");
    expect(gtinFromBarcode("10036000291459")).toBe("10036000291459");
  });

  test("trims spaces around a scanned code", () => {
    expect(gtinFromBarcode(" 4006381333931 ")).toBe("4006381333931");
  });

  test("rejects a wrong check digit, the shop's own codes and empty values", () => {
    expect(gtinFromBarcode("4006381333932")).toBeNull();
    expect(gtinFromBarcode("BMH-0042")).toBeNull();
    expect(gtinFromBarcode("12345")).toBeNull();
    expect(gtinFromBarcode("00000000")).toBeNull();
    expect(gtinFromBarcode("")).toBeNull();
    expect(gtinFromBarcode(null)).toBeNull();
  });
});

describe("productJsonLd", () => {
  test("names the brand, and leaves it out when the product has none", () => {
    expect(productJsonLd(input()).brand).toEqual({ "@type": "Brand", name: "Quaker" });
    expect(productJsonLd(input({ brand: null }))).not.toHaveProperty("brand");
  });

  test("gives the product and each offer its barcode as a GTIN when it is a real one", () => {
    const data = productJsonLd(input({ offers: [offer({ barcode: "4006381333931" }), offer({ sku: "OATS-2", barcode: "SHOP-7" })] }));
    expect(data.gtin).toBe("4006381333931");
    expect(offersOf(data)[0]!.gtin).toBe("4006381333931");
    expect(offersOf(data)[1]).not.toHaveProperty("gtin");
  });

  test("every offer says from when its price applies, in new condition", () => {
    const [first] = offersOf(productJsonLd(input()));
    expect(first).toMatchObject({
      "@type": "Offer",
      price: "185.00",
      priceCurrency: "GHS",
      validFrom: "2026-10-20T08:00:00.000Z",
      priceValidUntil: "2026-11-30",
      itemCondition: "https://schema.org/NewCondition",
      availability: "https://schema.org/InStock",
    });
    expect(first).not.toHaveProperty("priceSpecification");
  });

  test("a sale shows the sale price, the shelf price struck through and when the sale ends", () => {
    const [first] = offersOf(productJsonLd(input({ offers: [offer({ effectivePriceMinor: 16500, saleEndsAt: "2026-11-15T23:59:00.000Z" })] })));
    expect(first).toMatchObject({
      price: "165.00",
      priceValidUntil: "2026-11-15",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        priceType: "https://schema.org/StrikethroughPrice",
        price: "185.00",
        priceCurrency: "GHS",
      },
    });
  });

  test("delivery is the cheapest zone's fee within Ghana", () => {
    const [first] = offersOf(productJsonLd(input()));
    expect(first!.shippingDetails).toEqual({
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: "20.00", currency: "GHS" },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "GH" },
    });
    expect(offersOf(productJsonLd(input({ delivery: null })))[0]).not.toHaveProperty("shippingDetails");
  });

  test("delivery times come from the shop's packing days and the cheapest zone's days on the road", () => {
    const timed = input({ delivery: { feeMinor: 2000, transitMinDays: 0, transitMaxDays: 1 }, handlingDays: 1 });
    expect((offersOf(productJsonLd(timed))[0]!.shippingDetails as Json).deliveryTime).toEqual({
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
    });
    // Half the answer is not given.
    expect(offersOf(productJsonLd(input({ ...timed, handlingDays: null })))[0]!.shippingDetails).not.toHaveProperty("deliveryTime");
    expect(offersOf(productJsonLd(input({ handlingDays: 1 })))[0]!.shippingDetails).not.toHaveProperty("deliveryTime");
  });

  test("a shelf price is quoted to the rolling date, and a sale ending sooner wins", () => {
    expect(offersOf(productJsonLd(input()))[0]!.priceValidUntil).toBe("2026-11-30");
    // A sale date left on an offer that is not on sale any more says nothing.
    expect(offersOf(productJsonLd(input({ offers: [offer({ saleEndsAt: "2026-11-15T23:59:00.000Z" })] })))[0]!.priceValidUntil).toBe("2026-11-30");
  });

  test("the returns window comes from the settings: days, no returns, or not said", () => {
    expect(offersOf(productJsonLd(input({ returnDays: 7 })))[0]!.hasMerchantReturnPolicy).toEqual({
      "@type": "MerchantReturnPolicy",
      applicableCountry: "GH",
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 7,
    });
    expect(offersOf(productJsonLd(input({ returnDays: 0 })))[0]!.hasMerchantReturnPolicy).toEqual({
      "@type": "MerchantReturnPolicy",
      applicableCountry: "GH",
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
    });
    expect(offersOf(productJsonLd(input()))[0]).not.toHaveProperty("hasMerchantReturnPolicy");
  });

  test("an out of stock offer says so", () => {
    expect(offersOf(productJsonLd(input({ offers: [offer({ inStock: false })] })))[0]!.availability).toBe("https://schema.org/OutOfStock");
  });

  test("ratings and reviews appear only when real reviews exist", () => {
    expect(productJsonLd(input())).not.toHaveProperty("aggregateRating");
    expect(productJsonLd(input())).not.toHaveProperty("review");

    const data = productJsonLd(
      input({
        reviews: {
          average: 4.5,
          count: 2,
          items: [{ authorName: "Ama", createdAt: "2026-10-21T10:00:00.000Z", title: "Good", body: "Cooks fast.", rating: 5 }],
        },
      }),
    );
    expect(data.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 4.5, reviewCount: 2, bestRating: 5, worstRating: 1 });
    expect(data.review).toEqual([
      {
        "@type": "Review",
        author: { "@type": "Person", name: "Ama" },
        datePublished: "2026-10-21",
        name: "Good",
        reviewBody: "Cooks fast.",
        reviewRating: { "@type": "Rating", ratingValue: 5, bestRating: 5, worstRating: 1 },
      },
    ]);
  });
});
