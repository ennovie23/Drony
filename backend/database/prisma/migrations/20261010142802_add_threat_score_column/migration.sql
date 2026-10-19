-- AlterTable
ALTER TABLE "FireDetection" ADD COLUMN     "threatScore" INTEGER,
ALTER COLUMN "trend" DROP NOT NULL;
