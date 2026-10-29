-- CreateEnum
CREATE TYPE "PosTender" AS ENUM ('CASH', 'MOMO', 'CARD');

-- CreateEnum
CREATE TYPE "PosSaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- AlterEnum
ALTER TYPE "InventoryMovementType" ADD VALUE 'POS_SALE';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CASHIER';

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "posSaleId" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "barcode" TEXT;

-- CreateTable
CREATE TABLE "PosTill" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastReceiptSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosShift" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tillId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "openingFloatMinor" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3),
    "countedCashMinor" INTEGER,
    "countedMomoMinor" INTEGER,
    "countedCardMinor" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSale" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "tillId" TEXT NOT NULL,
    "shiftId" TEXT,
    "cashierId" TEXT NOT NULL,
    "status" "PosSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "totalMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL,
    "changeMinor" INTEGER NOT NULL DEFAULT 0,
    "hasShortfall" BOOLEAN NOT NULL DEFAULT false,
    "hasPriceDifference" BOOLEAN NOT NULL DEFAULT false,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "variantId" TEXT,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unit" "SellingUnit" NOT NULL,
    "quantityMilli" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "listUnitPriceMinor" INTEGER NOT NULL,
    "lineTotalMinor" INTEGER NOT NULL,
    "shortfallMilli" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PosSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosPayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "PosTender" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reference" TEXT,

    CONSTRAINT "PosPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosTill_code_key" ON "PosTill"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PosShift_clientId_key" ON "PosShift"("clientId");

-- CreateIndex
CREATE INDEX "PosShift_tillId_openedAt_idx" ON "PosShift"("tillId", "openedAt");

-- CreateIndex
CREATE INDEX "PosShift_cashierId_openedAt_idx" ON "PosShift"("cashierId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PosSale_clientId_key" ON "PosSale"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PosSale_receiptNumber_key" ON "PosSale"("receiptNumber");

-- CreateIndex
CREATE INDEX "PosSale_soldAt_idx" ON "PosSale"("soldAt");

-- CreateIndex
CREATE INDEX "PosSale_shiftId_idx" ON "PosSale"("shiftId");

-- CreateIndex
CREATE INDEX "PosSale_cashierId_soldAt_idx" ON "PosSale"("cashierId", "soldAt");

-- CreateIndex
CREATE INDEX "PosSaleItem_saleId_idx" ON "PosSaleItem"("saleId");

-- CreateIndex
CREATE INDEX "PosSaleItem_variantId_idx" ON "PosSaleItem"("variantId");

-- CreateIndex
CREATE INDEX "PosPayment_saleId_idx" ON "PosPayment"("saleId");

-- CreateIndex
CREATE INDEX "InventoryMovement_posSaleId_idx" ON "InventoryMovement"("posSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_posSaleId_variantId_type_key" ON "InventoryMovement"("posSaleId", "variantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_barcode_key" ON "ProductVariant"("barcode");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_tillId_fkey" FOREIGN KEY ("tillId") REFERENCES "PosTill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_tillId_fkey" FOREIGN KEY ("tillId") REFERENCES "PosTill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity rules for the point of sale, like 20261025162901_integrity_constraints.
ALTER TABLE "PosTill"
  ADD CONSTRAINT "PosTill_receipt_seq_nonnegative" CHECK ("lastReceiptSeq" >= 0);

ALTER TABLE "PosShift"
  ADD CONSTRAINT "PosShift_amounts_nonnegative" CHECK (
    "openingFloatMinor" >= 0
    AND ("countedCashMinor" IS NULL OR "countedCashMinor" >= 0)
    AND ("countedMomoMinor" IS NULL OR "countedMomoMinor" >= 0)
    AND ("countedCardMinor" IS NULL OR "countedCardMinor" >= 0)
  ),
  ADD CONSTRAINT "PosShift_closed_after_opened" CHECK ("closedAt" IS NULL OR "closedAt" >= "openedAt");

-- Everything tendered is the total plus the change handed back.
ALTER TABLE "PosSale"
  ADD CONSTRAINT "PosSale_amounts_valid" CHECK ("totalMinor" >= 0 AND "changeMinor" >= 0 AND "paidMinor" = "totalMinor" + "changeMinor");

ALTER TABLE "PosSaleItem"
  ADD CONSTRAINT "PosSaleItem_quantity_positive" CHECK ("quantityMilli" > 0),
  ADD CONSTRAINT "PosSaleItem_amounts_nonnegative" CHECK ("unitPriceMinor" >= 0 AND "listUnitPriceMinor" >= 0 AND "lineTotalMinor" >= 0),
  ADD CONSTRAINT "PosSaleItem_shortfall_valid" CHECK ("shortfallMilli" >= 0 AND "shortfallMilli" <= "quantityMilli");

ALTER TABLE "PosPayment"
  ADD CONSTRAINT "PosPayment_amount_positive" CHECK ("amountMinor" > 0);

-- The shop's first till.
INSERT INTO "PosTill" ("id", "code", "name", "updatedAt")
VALUES ('till_front_counter', 'T1', 'Front counter', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
