-- AlterEnum
ALTER TYPE "InventoryMovementType" ADD VALUE 'POS_VOID';
ALTER TYPE "InventoryMovementType" ADD VALUE 'POS_RETURN';

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "posReturnId" TEXT;

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "PosSaleItem" ADD COLUMN     "refundedMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "returnedMilli" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PosShift" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateTable
CREATE TABLE "PosReturn" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "saleId" TEXT NOT NULL,
    "tillId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "method" "PosTender" NOT NULL,
    "reference" TEXT,
    "refundMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,

    CONSTRAINT "PosReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL,
    "refundMinor" INTEGER NOT NULL,
    "restocked" BOOLEAN NOT NULL,

    CONSTRAINT "PosReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosReturn_clientId_key" ON "PosReturn"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PosReturn_number_key" ON "PosReturn"("number");

-- CreateIndex
CREATE INDEX "PosReturn_saleId_idx" ON "PosReturn"("saleId");

-- CreateIndex
CREATE INDEX "PosReturn_shiftId_idx" ON "PosReturn"("shiftId");

-- CreateIndex
CREATE INDEX "PosReturn_createdAt_idx" ON "PosReturn"("createdAt");

-- CreateIndex
CREATE INDEX "PosReturnItem_returnId_idx" ON "PosReturnItem"("returnId");

-- CreateIndex
CREATE INDEX "PosReturnItem_saleItemId_idx" ON "PosReturnItem"("saleItemId");

-- CreateIndex
CREATE INDEX "InventoryMovement_posReturnId_idx" ON "InventoryMovement"("posReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_posReturnId_variantId_type_key" ON "InventoryMovement"("posReturnId", "variantId", "type");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_posReturnId_fkey" FOREIGN KEY ("posReturnId") REFERENCES "PosReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_tillId_fkey" FOREIGN KEY ("tillId") REFERENCES "PosTill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturnItem" ADD CONSTRAINT "PosReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "PosReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturnItem" ADD CONSTRAINT "PosReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "PosSaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Integrity rules for voids and returns, like 20261029190000_pos_foundations.
-- Nothing is returned or refunded beyond what was sold and paid for.
ALTER TABLE "PosSaleItem"
  ADD CONSTRAINT "PosSaleItem_returned_valid" CHECK ("returnedMilli" >= 0 AND "returnedMilli" <= "quantityMilli"),
  ADD CONSTRAINT "PosSaleItem_refunded_valid" CHECK ("refundedMinor" >= 0 AND "refundedMinor" <= "lineTotalMinor");

ALTER TABLE "PosReturn"
  ADD CONSTRAINT "PosReturn_refund_nonnegative" CHECK ("refundMinor" >= 0);

ALTER TABLE "PosReturnItem"
  ADD CONSTRAINT "PosReturnItem_quantity_positive" CHECK ("quantityMilli" > 0),
  ADD CONSTRAINT "PosReturnItem_refund_nonnegative" CHECK ("refundMinor" >= 0);

-- A voided sale says when, by whom and why.
ALTER TABLE "PosSale"
  ADD CONSTRAINT "PosSale_void_recorded" CHECK (("status" = 'VOIDED') = ("voidedAt" IS NOT NULL));
