import { describe, expect, test } from "vitest";
import { posSaleUploadSchema, settleTender } from "@/lib/pos";
import {
  addToSale,
  buildSaleUpload,
  cashSuggestions,
  catalogCategories,
  findByCode,
  parseTillQuantity,
  pressKey,
  priceSale,
  receiptFor,
  searchCatalog,
  setLineQuantity,
  tenderProgress,
  type PosCatalogItem,
} from "@/lib/pos-till";

const NOW = new Date("2026-11-02T10:00:00Z");

function item(overrides: Partial<PosCatalogItem> = {}): PosCatalogItem {
  return {
    variantId: "v-rice",
    productName: "Jasmine Rice",
    variantName: "5 kg bag",
    sku: "RICE-5KG",
    barcode: "6001234567890",
    unit: "BAG",
    categoryId: "c-grains",
    categoryName: "Rice & Grains",
    imageUrl: null,
    imageAlt: "Jasmine Rice",
    priceMinor: 45_000,
    salePriceMinor: null,
    saleEndsAt: null,
    tiers: [],
    stockMilli: 10_000,
    lowStockMilli: 3000,
    keywords: "jasmine rice 5 kg bag rice-5kg 6001234567890 basmati rice & grains",
    ...overrides,
  };
}

const rice = item();
const tomatoes = item({
  variantId: "v-tomato",
  productName: "Fresh Tomatoes",
  variantName: "Loose",
  sku: "TOM-KG",
  barcode: null,
  unit: "KG",
  categoryId: "c-veg",
  categoryName: "Vegetables",
  priceMinor: 2000,
  keywords: "fresh tomatoes loose tom-kg vegetables",
});

describe("finding products at the till", () => {
  test("a scanned barcode or SKU finds the exact item", () => {
    expect(findByCode([rice, tomatoes], " 6001234567890 ")).toBe(rice);
    expect(findByCode([rice, tomatoes], "tom-kg")).toBe(tomatoes);
    expect(findByCode([rice, tomatoes], "600123")).toBeUndefined();
    expect(findByCode([rice, tomatoes], "  ")).toBeUndefined();
  });

  test("search needs every word typed and respects the category", () => {
    expect(searchCatalog([rice, tomatoes], "rice bag", null)).toEqual([rice]);
    expect(searchCatalog([rice, tomatoes], "fresh", "c-grains")).toEqual([]);
    expect(searchCatalog([rice, tomatoes], "", "c-veg")).toEqual([tomatoes]);
    expect(catalogCategories([rice, tomatoes, item({ variantId: "v2" })])).toEqual([
      { id: "c-grains", name: "Rice & Grains" },
      { id: "c-veg", name: "Vegetables" },
    ]);
  });
});

describe("quantities", () => {
  test("weighed goods take a weight to the gram; other goods whole numbers", () => {
    expect(parseTillQuantity("1.25", "KG")).toBe(1250);
    expect(parseTillQuantity("0.005", "KG")).toBe(5);
    expect(parseTillQuantity("1.2345", "KG")).toBeNull();
    expect(parseTillQuantity("3", "BAG")).toBe(3000);
    expect(parseTillQuantity("1.5", "BAG")).toBeNull();
    expect(parseTillQuantity("0", "KG")).toBeNull();
    expect(parseTillQuantity("1001", "KG")).toBeNull();
  });

  test("the keypad builds amounts and weights", () => {
    const type = (keys: string[], decimals: number) => keys.reduce((text, key) => pressKey(text, key, decimals), "");
    expect(type(["1", "2", ".", "5", "0", "7"], 2)).toBe("12.50");
    expect(type(["0", "0", "7"], 2)).toBe("7");
    expect(type([".", "2", "5"], 3)).toBe("0.25");
    expect(type(["1", ".", "5"], 0)).toBe("15");
    expect(type(["4", "2", "back"], 2)).toBe("4");
    expect(type(["4", "2", "clear"], 2)).toBe("");
  });
});

describe("ringing up a sale", () => {
  test("adding the same item again adds to its line", () => {
    const once = addToSale([], rice, 1000);
    const twice = addToSale(once, rice, 1000);
    expect(once).toEqual([{ item: rice, quantityMilli: 1000 }]);
    expect(twice).toEqual([{ item: rice, quantityMilli: 2000 }]);
    expect(once[0]!.quantityMilli).toBe(1000);
  });

  test("setting a quantity to zero takes the line off", () => {
    const lines = addToSale(addToSale([], rice, 1000), tomatoes, 1250);
    expect(setLineQuantity(lines, "v-tomato", 2500).map((l) => l.quantityMilli)).toEqual([1000, 2500]);
    expect(setLineQuantity(lines, "v-rice", 0).map((l) => l.item.variantId)).toEqual(["v-tomato"]);
  });

  test("prices use the sale price, the bulk price for the quantity, and weights", () => {
    const onSale = item({ variantId: "v-oil", salePriceMinor: 4000, priceMinor: 5000, saleEndsAt: "2026-11-05T00:00:00Z" });
    const bulk = item({ variantId: "v-water", priceMinor: 500, tiers: [{ minQtyMilli: 12_000, unitPriceMinor: 400 }] });
    const sale = priceSale(
      [
        { item: onSale, quantityMilli: 2000 },
        { item: bulk, quantityMilli: 12_000 },
        { item: tomatoes, quantityMilli: 1250 },
      ],
      NOW,
    );
    expect(sale.lines.map((l) => [l.unitPriceMinor, l.lineTotalMinor, l.priceNote])).toEqual([
      [4000, 8000, "sale"],
      [400, 4800, "bulk"],
      [2000, 2500, null],
    ]);
    expect(sale.totalMinor).toBe(15_300);
    expect(sale.savingMinor).toBe(2000 + 1200);
  });

  test("a sale price that has ended no longer applies", () => {
    const ended = item({ salePriceMinor: 4000, priceMinor: 5000, saleEndsAt: "2026-11-01T00:00:00Z" });
    expect(priceSale([{ item: ended, quantityMilli: 1000 }], NOW).totalMinor).toBe(5000);
  });
});

describe("taking payment", () => {
  test("cash suggestions start with the exact amount and round up to notes", () => {
    expect(cashSuggestions(92_500)).toEqual([92_500, 93_000, 94_000, 95_000, 100_000]);
    expect(cashSuggestions(750)).toEqual([750, 1000, 2000, 5000, 10_000]);
    expect(cashSuggestions(5000)).toEqual([5000, 6000, 10_000, 20_000]);
    expect(cashSuggestions(0)).toEqual([]);
  });

  test("progress shows what is left to pay and the change", () => {
    expect(tenderProgress(7500, [{ method: "MOMO", amountMinor: 5000 }])).toEqual({ paidMinor: 5000, remainingMinor: 2500, changeMinor: 0 });
    expect(tenderProgress(7500, [{ method: "CASH", amountMinor: 10_000 }])).toEqual({ paidMinor: 10_000, remainingMinor: 0, changeMinor: 2500 });
  });

  test("the upload the till sends matches what the server accepts, and the receipt matches the sale", () => {
    const sale = priceSale([{ item: rice, quantityMilli: 2000 }, { item: tomatoes, quantityMilli: 1250 }], NOW);
    const tenders = [
      { method: "MOMO" as const, amountMinor: 50_000, reference: " MP241102.0930 " },
      { method: "CASH" as const, amountMinor: 50_000 },
    ];
    const upload = buildSaleUpload(
      { clientId: "1f0c6f5e-3b9a-4c1e-9d2a-7b6f2f0c9a11", receiptNumber: "T1-000012", tillCode: "T1", shiftClientId: null, cashierId: "user_1", soldAt: NOW },
      sale,
      tenders,
    );

    expect(posSaleUploadSchema.safeParse(upload).success).toBe(true);
    expect(upload.items).toEqual([
      { variantId: "v-rice", quantityMilli: 2000, unitPriceMinor: 45_000 },
      { variantId: "v-tomato", quantityMilli: 1250, unitPriceMinor: 2000 },
    ]);
    expect(upload.payments[0]!.reference).toBe("MP241102.0930");
    expect(settleTender(sale.totalMinor, upload.payments)).toEqual({ ok: true, paidMinor: 100_000, changeMinor: 7500 });

    const receipt = receiptFor(upload, sale, "Ama Mensah");
    expect(receipt).toMatchObject({ receiptNumber: "T1-000012", totalMinor: 92_500, paidMinor: 100_000, changeMinor: 7500, cashierName: "Ama Mensah" });
    expect(receipt.lines.map((l) => [l.name, l.quantityMilli, l.lineTotalMinor])).toEqual([
      ["Jasmine Rice", 2000, 90_000],
      ["Fresh Tomatoes", 1250, 2500],
    ]);
  });
});
