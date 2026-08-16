-- AlterTable
ALTER TABLE "room_types" ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[];
