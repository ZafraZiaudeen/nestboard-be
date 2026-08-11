/*
  Warnings:

  - You are about to drop the column `has_ac` on the `rooms` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `rooms` table. All the data in the column will be lost.
  - You are about to drop the column `price_per_month` on the `rooms` table. All the data in the column will be lost.
  - You are about to drop the column `property_id` on the `rooms` table. All the data in the column will be lost.
  - You are about to drop the column `seat_capacity` on the `rooms` table. All the data in the column will be lost.
  - Added the required column `room_label` to the `rooms` table without a default value. This is not possible if the table is not empty.
  - Added the required column `room_type_id` to the `rooms` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_property_id_fkey";

-- DropIndex
DROP INDEX "rooms_property_id_idx";

-- AlterTable
ALTER TABLE "rooms" DROP COLUMN "has_ac",
DROP COLUMN "name",
DROP COLUMN "price_per_month",
DROP COLUMN "property_id",
DROP COLUMN "seat_capacity",
ADD COLUMN     "is_available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "room_label" TEXT NOT NULL,
ADD COLUMN     "room_type_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "room_types" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_per_month" DECIMAL(10,2) NOT NULL,
    "seat_capacity" INTEGER NOT NULL,
    "has_ac" BOOLEAN NOT NULL DEFAULT false,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_types_property_id_idx" ON "room_types"("property_id");

-- CreateIndex
CREATE INDEX "rooms_room_type_id_idx" ON "rooms"("room_type_id");

-- AddForeignKey
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
