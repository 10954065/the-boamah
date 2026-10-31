import { describe, expect, it } from "vitest";
import { planImport, type CatalogProduct, type CatalogSnapshot, type SheetRow } from "@/lib/product-import";
import { readBarcode, readHeader, readMoney, readUnit, rowValues, type ColumnKey } from "@/lib/product-import-sheet";

const categories = [
  { id: "c-rice", name: "Rice & Grains", slug: "rice-grains" },
  { id: "c-drinks", name: "Juices & Drinks", slug: "juices-drinks" },
];

const rice: CatalogProduct = {
  id: "p-rice",
  name: "Royal Basmati Rice",
  slug: "royal-basmati-rice",
  categoryId: "c-rice",
  brand: "Royal",
  description: "Long grain basmati rice.",
  shortDescription: null,
  searchKeywords: "rice",
  variants: [{ id: "v-rice", name: "Bag", sku: "RBR-BAG", barcode: "6001234567890", unit: "BAG", priceMinor: 48000, salePriceMinor: null, stockMilli: 40000, lowStockMilli: 5000, sortOrder: 0 }],
};

const juice: CatalogProduct = {
  id: "p-juice",
  name: "Ocean Spray Cranberry",
  slug: "ocean-spray-cranberry",
  categoryId: "c-drinks",
  brand: null,
  description: "Cranberry juice drink.",
  shortDescription: null,
  searchKeywords: "",
  variants: [
    { id: "v-juice-1", name: "Bottle", sku: "OSC-BOTTLE", barcode: null, unit: "BOTTLE", priceMinor: 7500, salePriceMinor: 6800, stockMilli: 60000, lowStockMilli: 5000, sortOrder: 0 },
    { id: "v-juice-6", name: "6 pack", sku: "OSC-6", barcode: null, unit: "PACK", priceMinor: 42000, salePriceMinor: null, stockMilli: 10000, lowStockMilli: 2000, sortOrder: 1 },
  ],
};

const snapshot: CatalogSnapshot = { categories, products: [rice, juice] };

let line = 1;
const row = (values: Partial<Record<ColumnKey, string>>): SheetRow => ({ row: ++line, values });

describe("reading the sheet", () => {
  it("finds the columns by their headings, in any order and with common other names", () => {
    const header = readHeader(["Qty", "Product name *", "Something else", "Price (GH₵) *", "category"]);
    expect(header.columns).toEqual(["stock", "name", null, "price", "category"]);
    expect(header.problems).toEqual([]);
  });

  it("asks for the columns every new product needs", () => {
    expect(readHeader(["Product name", "Stock"]).problems[0]).toMatch(/"Category", "Price \(GH₵\)"/);
  });

  it("reads a row by column and skips blank rows", () => {
    const header = readHeader(["Product name", "Category", "Price"]);
    expect(rowValues(["  Rice ", null, "48.5"], header)).toEqual({ name: "Rice", price: "48.5" });
    expect(rowValues([null, "", " "], header)).toBeNull();
  });

  it("reads amounts with the cedi sign and commas, units by their everyday names, and catches shortened barcodes", () => {
    expect(readMoney("GH₵ 1,250.5")).toBe(125050);
    expect(readMoney("12.345")).toBeNull();
    expect(readUnit("Kilos")).toBe("KG");
    expect(readUnit("pcs")).toBe("ITEM");
    expect(readUnit("boxes")).toBe("BOX");
    expect(readBarcode("6.00123E+12")).toEqual({ error: expect.stringMatching(/Format the Barcode column as Text/) });
    expect(readBarcode("6001234567890")).toEqual({ value: "6001234567890" });
  });
});

describe("planImport", () => {
  it("adds a new product as a draft with a made-up SKU and slug, and its opening stock", () => {
    const plan = planImport([row({ name: "Peak Milk", category: "Juices & Drinks", price: "12.50", unit: "tin", stock: "24", brand: "Peak" })], snapshot);
    expect(plan.counts).toMatchObject({ "new-product": 1, error: 0 });
    expect(plan.newProducts).toEqual([
      {
        slug: "peak-milk",
        fields: { name: "Peak Milk", categoryId: "c-drinks", brand: "Peak", description: "", shortDescription: null, searchKeywords: "" },
        variants: [{ name: "Tin", sku: "PEAK-MILK-TIN", barcode: null, unit: "TIN", priceMinor: 1250, salePriceMinor: null, stockMilli: 24000, lowStockMilli: 5000 }],
      },
    ]);
  });

  it("puts rows with the same new product name together as its sizes", () => {
    const plan = planImport(
      [row({ name: "Frytol Oil", option: "1 litre", category: "rice-grains", price: "35", unit: "bottle" }), row({ name: "frytol oil", option: "5 litres", price: "160", unit: "bottle" })],
      snapshot,
    );
    expect(plan.counts.error).toBe(0);
    expect(plan.newProducts).toHaveLength(1);
    expect(plan.newProducts[0]!.variants.map((v) => [v.name, v.priceMinor])).toEqual([["1 litre", 3500], ["5 litres", 16000]]);
  });

  it("updates an option found by SKU, and leaves alone everything left blank", () => {
    const plan = planImport([row({ name: "Royal Basmati Rice", sku: "rbr-bag", price: "450", stock: "35" })], snapshot);
    expect(plan.counts).toMatchObject({ update: 1, error: 0 });
    expect(plan.variantChanges).toEqual([{ variantId: "v-rice", data: { priceMinor: 45000 }, pricesBefore: [48000, null] }]);
    expect(plan.stockCounts).toEqual([{ variantId: "v-rice", fromMilli: 40000, toMilli: 35000 }]);
    expect(plan.productChanges).toEqual([]);
    expect(plan.rows[0]!.notes).toEqual(["Price GH₵480.00 → GH₵450.00", "Stock 40 bags → 35 bags"]);
  });

  it("finds an option by barcode, or by product name and size", () => {
    const plan = planImport(
      [row({ name: "Royal Basmati Rice", barcode: "6001234567890", price: "480" }), row({ name: "ocean spray cranberry", option: "6 PACK", price: "400" })],
      snapshot,
    );
    expect(plan.counts).toMatchObject({ unchanged: 1, update: 1, error: 0 });
    expect(plan.variantChanges.map((c) => c.variantId)).toEqual(["v-juice-6"]);
  });

  it("makes a re-upload of the same sheet change nothing", () => {
    const plan = planImport([row({ name: "Royal Basmati Rice", category: "Rice & Grains", price: "480", stock: "40", brand: "Royal" })], snapshot);
    expect(plan.counts).toMatchObject({ unchanged: 1, update: 0, error: 0 });
  });

  it("adds a new size to a product already on the website", () => {
    const plan = planImport([row({ name: "Royal Basmati Rice", option: "5 kg", price: "95", unit: "bag", stock: "10" })], snapshot);
    expect(plan.counts["new-option"]).toBe(1);
    expect(plan.newOptions).toEqual([{ productId: "p-rice", sortOrder: 1, variant: expect.objectContaining({ name: "5 kg", sku: "ROYAL-BASMATI-RICE-5-KG", priceMinor: 9500, stockMilli: 10000 }) }]);
  });

  it("updates product details, and ends an offer when the sale price is 0", () => {
    const plan = planImport([row({ name: "Ocean Spray Cranberry", option: "Bottle", salePrice: "0", brand: "Ocean Spray", category: "Rice & Grains" })], snapshot);
    expect(plan.counts.error).toBe(0);
    expect(plan.productChanges).toEqual([{ productId: "p-juice", data: { categoryId: "c-rice", brand: "Ocean Spray" } }]);
    expect(plan.variantChanges[0]!.data).toEqual({ salePriceMinor: null });
    expect(plan.rows[0]!.notes).toEqual(["Category: Rice & Grains", "Brand: Ocean Spray", "Offer ends"]);
  });

  it("explains each kind of mistake on its row", () => {
    const plan = planImport(
      [
        row({ name: "Sugar", category: "Sweets", price: "abc" }),
        row({ name: "Salt", price: "5" }),
        row({ name: "Ocean Spray Cranberry", price: "10" }),
        row({ name: "Royal Basmati Rice", sku: "NEW-SKU" }),
        row({ name: "Gari", category: "Rice & Grains", price: "20", sku: "GARI-1", barcode: "6001234567890" }),
        row({ name: "Ocean Spray Cranberry", option: "Bottle", price: "60" }),
        row({ name: "Royal Basmati Rice", stock: "2.5" }),
        row({ name: "Beans", category: "Rice & Grains", price: "8", sku: "BEANS-1" }),
        row({ name: "Peas", category: "Rice & Grains", price: "8", sku: "beans-1" }),
        row({ name: "Ocean Spray Cranberry", sku: "OSC-6", barcode: "6001234567890" }),
      ],
      snapshot,
    );
    const problems = plan.rows.map((r) => r.notes.join(" "));
    expect(plan.counts.error).toBe(9);
    expect(problems[0]).toMatch(/no category called "Sweets".*Price "abc" is not an amount/);
    expect(problems[1]).toMatch(/Category is needed/);
    expect(problems[2]).toMatch(/has several sizes/);
    expect(problems[3]).toMatch(/SKU NEW-SKU is not on the website.*RBR-BAG/);
    expect(problems[4]).toMatch(/This barcode belongs to Royal Basmati Rice \(Bag, SKU RBR-BAG\)/);
    expect(problems[5]).toMatch(/Sale price GH₵68.00 must be lower than the price GH₵60.00/);
    expect(problems[6]).toMatch(/whole number of bags/);
    expect(problems[8]).toMatch(/Same SKU as row/);
    expect(problems[9]).toMatch(/already on Royal Basmati Rice/);
  });

  it("refuses the same product and size twice, and product details that disagree", () => {
    const plan = planImport(
      [
        row({ name: "Royal Basmati Rice", price: "450" }),
        row({ name: "Royal Basmati Rice", sku: "RBR-BAG", price: "440" }),
        row({ name: "Milo", option: "Tin", category: "Juices & Drinks", price: "40", brand: "Nestlé" }),
        row({ name: "Milo", option: "Refill", price: "30", brand: "Nestle" }),
      ],
      snapshot,
    );
    expect(plan.rows[1]!.notes.join(" ")).toMatch(/Same product and size as row/);
    expect(plan.rows[3]!.notes.join(" ")).toMatch(/Brand is different from row/);
  });

  it("renames a product found by its barcode, and says so", () => {
    const plan = planImport([row({ name: "Royal Basmati Rice 25kg", barcode: "6001234567890" })], snapshot);
    expect(plan.productChanges).toEqual([{ productId: "p-rice", data: { name: "Royal Basmati Rice 25kg" } }]);
    expect(plan.rows[0]!.notes).toEqual(["Renamed from Royal Basmati Rice to Royal Basmati Rice 25kg"]);
  });

  it("keeps made-up SKUs and slugs clear of ones already taken", () => {
    const taken: CatalogProduct = { ...rice, id: "p-old", name: "Old Peak Milk", slug: "peak-milk", variants: [{ ...rice.variants[0]!, id: "v-old", sku: "PEAK-MILK-TIN", barcode: null }] };
    const plan = planImport([row({ name: "Peak Milk", category: "Juices & Drinks", price: "12.50", unit: "tin" })], { categories, products: [taken] });
    expect(plan.newProducts[0]!.slug).toBe("peak-milk-2");
    expect(plan.newProducts[0]!.variants[0]!.sku).toBe("PEAK-MILK-TIN-2");
  });
});
