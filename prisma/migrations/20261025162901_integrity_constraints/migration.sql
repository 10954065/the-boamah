-- Database-level integrity rules that complement application validation.
-- Money is integer minor units; quantities and stock are integer milli-units.

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_price_nonnegative" CHECK ("priceMinor" >= 0),
  ADD CONSTRAINT "ProductVariant_sale_price_valid" CHECK ("salePriceMinor" IS NULL OR "salePriceMinor" >= 0),
  ADD CONSTRAINT "ProductVariant_stock_nonnegative" CHECK ("stockMilli" >= 0),
  ADD CONSTRAINT "ProductVariant_low_stock_nonnegative" CHECK ("lowStockMilli" >= 0),
  ADD CONSTRAINT "ProductVariant_step_positive" CHECK ("stepMilli" > 0),
  ADD CONSTRAINT "ProductVariant_min_qty_positive" CHECK ("minQtyMilli" > 0),
  ADD CONSTRAINT "ProductVariant_max_qty_valid" CHECK ("maxQtyMilli" IS NULL OR "maxQtyMilli" >= "minQtyMilli");

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantityMilli" > 0);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantityMilli" > 0),
  ADD CONSTRAINT "OrderItem_amounts_nonnegative" CHECK ("unitPriceMinor" >= 0 AND "lineTotalMinor" >= 0);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_amounts_nonnegative" CHECK (
    "subtotalMinor" >= 0 AND "discountMinor" >= 0 AND "deliveryFeeMinor" >= 0
    AND "taxMinor" >= 0 AND "totalMinor" >= 0
  ),
  ADD CONSTRAINT "Order_total_consistent" CHECK (
    "totalMinor" = "subtotalMinor" - "discountMinor" + "deliveryFeeMinor" + "taxMinor"
  );

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_nonnegative" CHECK ("amountMinor" >= 0);

ALTER TABLE "DeliveryZone"
  ADD CONSTRAINT "DeliveryZone_amounts_nonnegative" CHECK (
    "feeMinor" >= 0 AND "minOrderMinor" >= 0
    AND ("freeDeliveryThresholdMinor" IS NULL OR "freeDeliveryThresholdMinor" >= 0)
  );

ALTER TABLE "Coupon"
  ADD CONSTRAINT "Coupon_value_valid" CHECK (
    ("type" = 'PERCENTAGE' AND "value" > 0 AND "value" <= 10000)
    OR ("type" = 'FIXED' AND "value" > 0)
  ),
  ADD CONSTRAINT "Coupon_used_count_valid" CHECK ("usedCount" >= 0 AND ("usageLimit" IS NULL OR "usedCount" <= "usageLimit"));

-- At most one default address per customer.
CREATE UNIQUE INDEX "Address_one_default_per_user" ON "Address" ("userId") WHERE "isDefault";

-- Case-insensitive product search support.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Product_name_trgm" ON "Product" USING gin (lower("name") gin_trgm_ops);
CREATE INDEX "Product_keywords_trgm" ON "Product" USING gin (lower("searchKeywords") gin_trgm_ops);
