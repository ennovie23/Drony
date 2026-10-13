/*
  Warnings:

  - You are about to drop the column `status` on the `FireDetection` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FireDetection" DROP COLUMN "status",
ADD COLUMN     "trend" TEXT NOT NULL DEFAULT 'STABLE',
ADD COLUMN     "trendSlope" DOUBLE PRECISION;
