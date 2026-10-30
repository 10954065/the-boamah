-- Guests review products from their delivered order, without an account.
ALTER TABLE "Review" ALTER COLUMN "userId" DROP NOT NULL;

-- One review per product per order.
CREATE UNIQUE INDEX "Review_orderId_productId_key" ON "Review"("orderId", "productId");
