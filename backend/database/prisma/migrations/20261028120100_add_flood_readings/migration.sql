-- CreateTable
CREATE TABLE "FloodReading" (
    "id" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "nodeId" TEXT NOT NULL,
    "seq" INTEGER,
    "source" TEXT NOT NULL,
    "distanceCm" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "mount" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "probeDepthCm" DOUBLE PRECISION,
    "referenceCm" DOUBLE PRECISION,
    "rssi" DOUBLE PRECISION,
    "snr" DOUBLE PRECISION,
    "lost" INTEGER,
    "gpsFix" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "satellites" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloodReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FloodReading_nodeId_recordedAt_idx" ON "FloodReading"("nodeId", "recordedAt");

-- CreateIndex
CREATE INDEX "FloodReading_recordedAt_idx" ON "FloodReading"("recordedAt");
