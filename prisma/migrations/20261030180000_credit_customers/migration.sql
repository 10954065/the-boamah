-- AlterEnum
ALTER TYPE "PosTender" ADD VALUE 'CREDIT';

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "creditCustomerId" TEXT;

-- CreateTable
CREATE TABLE "CreditCustomer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "limitMinor" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditPayment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" "PosTender" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "takenById" TEXT NOT NULL,
    "shiftId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditCustomer_phone_key" ON "CreditCustomer"("phone");

-- CreateIndex
CREATE INDEX "CreditCustomer_name_idx" ON "CreditCustomer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CreditPayment_clientId_key" ON "CreditPayment"("clientId");

-- CreateIndex
CREATE INDEX "CreditPayment_customerId_receivedAt_idx" ON "CreditPayment"("customerId", "receivedAt");

-- CreateIndex
CREATE INDEX "CreditPayment_shiftId_idx" ON "CreditPayment"("shiftId");

-- CreateIndex
CREATE INDEX "PosSale_creditCustomerId_idx" ON "PosSale"("creditCustomerId");

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_creditCustomerId_fkey" FOREIGN KEY ("creditCustomerId") REFERENCES "CreditCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCustomer" ADD CONSTRAINT "CreditCustomer_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CreditCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

