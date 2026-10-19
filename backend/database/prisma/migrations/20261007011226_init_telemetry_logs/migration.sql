-- CreateTable
CREATE TABLE "telemetry_logs" (
    "id" SERIAL NOT NULL,
    "drone_code" TEXT NOT NULL,
    "hazard_type" TEXT NOT NULL,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "battery_level" INTEGER NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_logs_pkey" PRIMARY KEY ("id")
);
