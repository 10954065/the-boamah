/**
 * Development seed: SAMPLE catalogue, delivery zones, promotions, settings
 * and a few example orders. Never run against a production database unless
 * SEED_ALLOW_PRODUCTION=true is set deliberately.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CATEGORIES, PRODUCTS, ZONES } from "./seed-data";

if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "true") {
  console.error("Refusing to seed in production. Set SEED_ALLOW_PRODUCTION=true if you really mean it.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

interface Credit {
  file: string;
  author: string;
  license: string;
}
const credits: Credit[] = JSON.parse(readFileSync(new URL("../src/data/image-credits.json", import.meta.url), "utf8"));
const creditFor = (file: string): string | null => {
  const credit = credits.find((c) => c.file === file);
  return credit ? `${credit.author}, ${credit.license}, via Wikimedia Commons` : null;
};

const effective = (price: number, sale?: number) => (sale !== undefined && sale < price ? sale : price);
const lineTotal = (price: number, qtyMilli: number) => Math.floor((price * qtyMilli + 500) / 1000);
const reference = (daysAgo: number) => {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `BMH-${ymd}-${randomBytes(3).toString("hex").toUpperCase()}`;
};

async function seedCatalogue() {
  const categoryIds = new Map<string, string>();
  for (const [index, category] of CATEGORIES.entries()) {
    const record = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: {
        slug: category.slug,
        name: category.name,
        description: category.description,
        imageUrl: `/images/products/${category.image}.webp`,
        sortOrder: index,
      },
    });
    categoryIds.set(category.slug, record.id);
  }

  for (const [index, product] of PRODUCTS.entries()) {
    const exists = await prisma.product.findUnique({ where: { slug: product.slug } });
    if (exists) continue;
    const imageFile = `/images/products/${product.slug}.webp`;
    await prisma.product.create({
      data: {
        slug: product.slug,
        name: product.name,
        description: product.description,
        shortDescription: product.short,
        searchKeywords: product.keywords,
        categoryId: categoryIds.get(product.category)!,
        status: "PUBLISHED",
        isFeatured: Boolean(product.featured),
        publishedAt: new Date(Date.now() - (PRODUCTS.length - index) * 3_600_000),
        images: { create: [{ url: imageFile, alt: product.name, credit: creditFor(imageFile) }] },
        variants: {
          create: product.variants.map((variant, vIndex) => ({
            name: variant.name,
            sku: `BMH-${product.slug.toUpperCase().replace(/-/g, "").slice(0, 16)}-${vIndex + 1}`,
            unit: variant.unit,
            priceMinor: variant.price,
            salePriceMinor: variant.sale ?? null,
            stepMilli: variant.step ?? 1000,
            minQtyMilli: variant.min ?? 1000,
            maxQtyMilli: variant.max ?? null,
            stockMilli: variant.stock,
            lowStockMilli: variant.unit === "KG" ? 5000 : 5000,
            isDefault: vIndex === 0,
            sortOrder: vIndex,
            priceTiers: { create: (variant.tiers ?? []).map((tier) => ({ minQtyMilli: tier.min * 1000, unitPriceMinor: tier.price })) },
            movements: {
              create: { type: "INITIAL", deltaMilli: variant.stock, balanceAfterMilli: variant.stock, reason: "Sample opening stock (seed)" },
            },
          })),
        },
      },
    });
  }
}

async function seedStore() {
  const zoneCount = await prisma.deliveryZone.count();
  if (zoneCount === 0) {
    await prisma.deliveryZone.createMany({ data: ZONES.map((zone, sortOrder) => ({ ...zone, sortOrder })) });
  }

  if ((await prisma.promoBanner.count()) === 0) {
    await prisma.promoBanner.createMany({
      data: [
        {
          placement: "HERO",
          eyebrow: "Everyday essentials, online",
          title: "Fresh Groceries, Delivered to Your Door.",
          subtitle: "Rice, cooking oil, breakfast, juices, snacks and household favourites from The Boamah's Online Grocery Shop.",
          imageUrl: "/images/banners/hero-products.webp",
          ctaLabel: "Shop Groceries",
          ctaHref: "/shop",
          sortOrder: 0,
        },
        { placement: "HOME_PROMO", eyebrow: "By the pack", title: "Juices for the whole family", subtitle: "Ocean Spray, Welch's, Martinelli's and Apple & Eve.", imageUrl: "/images/banners/juices.webp", ctaLabel: "Shop juices", ctaHref: "/categories/juices-drinks", tone: "leaf", sortOrder: 1 },
        { placement: "HOME_PROMO", eyebrow: "Breakfast", title: "Start the day right", subtitle: "Quaker Oats, Kellogg's Corn Flakes and Coffee-mate.", imageUrl: "/images/banners/breakfast.webp", ctaLabel: "Shop breakfast", ctaHref: "/categories/breakfast", tone: "gold", sortOrder: 2 },
        { placement: "HOME_PROMO", eyebrow: "Personal care", title: "Soap in value packs", subtitle: "Dove and Irish Spring bar soap.", imageUrl: "/images/banners/personal-care.webp", ctaLabel: "Shop personal care", ctaHref: "/categories/personal-care", tone: "cream", sortOrder: 3 },
      ],
    });
  }

  await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: {
      code: "WELCOME10",
      description: "Sample coupon: 10% off orders over GH₵100 (max GH₵50), once per customer.",
      type: "PERCENTAGE",
      value: 1000,
      maxDiscountMinor: 5000,
      minOrderMinor: 10000,
      perCustomerLimit: 1,
      usageLimit: 500,
    },
  });

  await prisma.storeSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      tagline: "Rice, cooking oil, breakfast, juices, snacks and household essentials, ordered online.",
      announcementEnabled: true,
      announcementText: "Demo store: products, prices and delivery fees shown are sample data.",
      codEnabled: true,
      pickupEnabled: true,
      onlinePaymentEnabled: true,
      isSampleData: true,
    },
  });
}

async function seedSampleOrders() {
  if ((await prisma.order.count()) > 0) return;
  const zone = await prisma.deliveryZone.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const samples = [
    { daysAgo: 6, status: "DELIVERED" as const, method: "CASH_ON_DELIVERY" as const, paid: true, items: [["royal-basmati-rice", 0, 1000], ["members-mark-vegetable-oil", 0, 2000], ["kelloggs-corn-flakes", 0, 1000]] as const },
    { daysAgo: 2, status: "PROCESSING" as const, method: "PAYSTACK" as const, paid: true, items: [["ensure-original", 0, 1000], ["welchs-fruit-snacks", 0, 1000], ["coffee-mate-original", 0, 2000]] as const },
    { daysAgo: 0, status: "CONFIRMED" as const, method: "CASH_ON_DELIVERY" as const, paid: false, items: [["ocean-spray-cran-grape", 0, 2000], ["dove-cool-moisture-bar-soap", 0, 1000], ["purina-dog-chow", 0, 1000]] as const },
  ];

  for (const sample of samples) {
    const createdAt = new Date(Date.now() - sample.daysAgo * 86_400_000);
    const lines = await Promise.all(
      sample.items.map(async ([slug, vIndex, qty]) => {
        const product = await prisma.product.findUniqueOrThrow({ where: { slug }, include: { variants: { orderBy: { sortOrder: "asc" } }, images: true } });
        const variant = product.variants[vIndex]!;
        const unitPrice = effective(variant.priceMinor, variant.salePriceMinor ?? undefined);
        return { product, variant, qty, unitPrice, total: lineTotal(unitPrice, qty) };
      }),
    );
    const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
    const fee = zone && (zone.freeDeliveryThresholdMinor === null || subtotal < zone.freeDeliveryThresholdMinor) ? zone.feeMinor : 0;
    const ref = reference(sample.daysAgo);

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          reference: ref,
          idempotencyKey: `seed-${ref}`,
          customerName: "Sample Customer",
          email: "sample.customer@example.com",
          phone: "0240000000",
          fulfilmentMethod: "DELIVERY",
          zoneId: zone?.id,
          zoneName: zone?.name,
          region: zone?.region,
          city: "Accra",
          area: zone?.areas[0] ?? "Osu",
          addressLine: "Sample address (seed data)",
          subtotalMinor: subtotal,
          deliveryFeeMinor: fee,
          totalMinor: subtotal + fee,
          paymentMethod: sample.method,
          paymentStatus: sample.paid ? "PAID" : "UNPAID",
          paidAt: sample.paid ? createdAt : null,
          status: sample.status,
          deliveredAt: sample.status === "DELIVERED" ? createdAt : null,
          createdAt,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              variantId: l.variant.id,
              productName: l.product.name,
              variantName: l.variant.name,
              sku: l.variant.sku,
              unit: l.variant.unit,
              imageUrl: l.product.images[0]?.url ?? null,
              unitPriceMinor: l.unitPrice,
              quantityMilli: l.qty,
              lineTotalMinor: l.total,
            })),
          },
          statusHistory: {
            create: [
              { toStatus: "CONFIRMED", note: "Sample order (seed data)", createdAt },
              ...(sample.status !== "CONFIRMED" ? [{ fromStatus: "CONFIRMED" as const, toStatus: sample.status, createdAt }] : []),
            ],
          },
        },
      });
      if (sample.paid) {
        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: sample.method === "PAYSTACK" ? "MOCK" : "CASH",
            reference: `${ref}-SEED`,
            amountMinor: subtotal + fee,
            status: "SUCCESS",
            paidAt: createdAt,
            channel: sample.method === "PAYSTACK" ? "sample" : "cash",
            gatewayResponse: "Sample payment (seed data)",
          },
        });
      }
      for (const l of lines) {
        const updated = await tx.productVariant.update({ where: { id: l.variant.id }, data: { stockMilli: { decrement: l.qty } } });
        await tx.inventoryMovement.create({
          data: { variantId: l.variant.id, type: "ORDER_RESERVED", deltaMilli: -l.qty, balanceAfterMilli: updated.stockMilli, orderId: order.id, reason: "Sample order (seed)" },
        });
      }
    });
  }
}

async function main() {
  await seedCatalogue();
  await seedStore();
  await seedSampleOrders();
  const [products, categories, zones, orders] = await Promise.all([
    prisma.product.count(),
    prisma.category.count(),
    prisma.deliveryZone.count(),
    prisma.order.count(),
  ]);
  console.info(`Seeded: ${categories} categories, ${products} products, ${zones} delivery zones, ${orders} orders (SAMPLE DATA).`);
  console.info("Create the first administrator with: npm run admin:create -- --email you@example.com --name \"Your Name\"");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
