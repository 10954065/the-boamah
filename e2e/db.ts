import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/** Direct database access for arranging e2e scenarios (e.g. forcing a product out of stock). */
export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

export async function setStock(slug: string, stockMilli: number): Promise<void> {
  const product = await db.product.findUniqueOrThrow({ where: { slug }, include: { variants: true } });
  await db.productVariant.updateMany({ where: { productId: product.id }, data: { stockMilli } });
}
