-- The earlier migrations built a "FireDetection" table, but the app moved to
-- "FrameAssessment" and that table was created outside Migrate. This brings the
-- migration history in line with schema.prisma. IF [NOT] EXISTS keeps it safe on
-- the shared database (which already has FrameAssessment) and on a fresh one.

DROP TABLE IF EXISTS "FireDetection";

CREATE TABLE IF NOT EXISTS "FrameAssessment" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fireDetected" BOOLEAN NOT NULL DEFAULT false,
    "fireConfidence" DOUBLE PRECISION,
    "fireSeverity" TEXT,
    "fireSeverityConf" DOUBLE PRECISION,
    "fireTrend" TEXT,
    "fireTrendSlope" DOUBLE PRECISION,
    "smokeDetected" BOOLEAN NOT NULL DEFAULT false,
    "smokeConfidence" DOUBLE PRECISION,
    "smokeTrend" TEXT,
    "smokeTrendSlope" DOUBLE PRECISION,
    "threatScore" INTEGER,
    "boxes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrameAssessment_pkey" PRIMARY KEY ("id")
);
