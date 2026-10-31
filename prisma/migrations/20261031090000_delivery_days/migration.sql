-- AlterTable
ALTER TABLE "DeliveryZone" ADD COLUMN     "transitMaxDays" INTEGER,
ADD COLUMN     "transitMinDays" INTEGER;

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "handlingDays" INTEGER;
