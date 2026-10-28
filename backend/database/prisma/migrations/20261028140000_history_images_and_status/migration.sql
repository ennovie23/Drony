-- Snapshots (webcam/video frames saved with an image) become FrameAssessment rows that
-- carry their Cloudinary image, and every fire/flood row records when its hazard was
-- resolved (null = still active) for the History page.

ALTER TABLE "FrameAssessment"
    ADD COLUMN "snapshotId" TEXT,
    ADD COLUMN "imageUrl" TEXT,
    ADD COLUMN "imagePublicId" TEXT,
    ADD COLUMN "trigger" TEXT,
    ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "FrameAssessment_snapshotId_key" ON "FrameAssessment"("snapshotId");
CREATE INDEX "FrameAssessment_timestamp_idx" ON "FrameAssessment"("timestamp");

ALTER TABLE "FloodReading" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- Rows saved before this migration belong to detector runs that have ended
UPDATE "FrameAssessment" SET "resolvedAt" = "timestamp";
UPDATE "FloodReading" SET "resolvedAt" = "recordedAt";
