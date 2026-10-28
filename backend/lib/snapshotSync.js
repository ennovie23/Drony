import fs from 'node:fs/promises';
import path from 'node:path';

const isHazard = (a) => Boolean(a?.fireDetected || a?.smokeDetected);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// A snapshot index entry → the FrameAssessment row that keeps it in the database
export function snapshotToRow(entry, { resolvedAt = null } = {}) {
  const a = entry.assessment ?? {};
  const timestamp = new Date(a.timestamp ?? entry.capturedAt);
  return {
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    fireDetected: Boolean(a.fireDetected),
    fireConfidence: num(a.fireConfidence),
    fireSeverity: a.fireSeverity ?? null,
    fireSeverityConf: num(a.fireSeverityConf),
    fireTrend: a.fireTrend ?? null,
    fireTrendSlope: num(a.fireTrendSlope),
    smokeDetected: Boolean(a.smokeDetected),
    smokeConfidence: num(a.smokeConfidence),
    smokeTrend: a.smokeTrend ?? null,
    smokeTrendSlope: num(a.smokeTrendSlope),
    threatScore: Number.isInteger(a.threatScore) ? a.threatScore : 0,
    boxes: Array.isArray(a.boxes) ? a.boxes : [],
    snapshotId: entry.id,
    imageUrl: entry.imageUrl?.startsWith('https://') ? entry.imageUrl : null,
    imagePublicId: entry.publicId ?? null,
    trigger: entry.trigger ?? 'auto',
    // A frame with nothing in it was never an active hazard
    resolvedAt: isHazard(a) ? resolvedAt : timestamp,
  };
}

// Saves a freshly captured snapshot as a database row; failures are logged, not thrown,
// so a database hiccup never loses the snapshot itself.
export async function saveSnapshotRow(db, entry) {
  try {
    await db.frameAssessment.create({ data: snapshotToRow(entry) });
  } catch (err) {
    console.error('[snapshots] Could not save snapshot row:', err.message);
  }
}

// Startup pass over the snapshot index: uploads images that only exist on local disk to
// Cloudinary (replacing their /snapshots/... path) and gives every snapshot a database
// row. Snapshots synced here predate this run, so their hazard counts as resolved.
export async function syncSnapshots({ store, db, dir, uploader, isConfigured, log = console.log }) {
  const entries = await store.listAll();
  let uploaded = 0;
  for (const entry of entries) {
    if (entry.imageUrl?.startsWith('https://') || !isConfigured()) continue;
    try {
      const file = await fs.readFile(path.join(dir, `${entry.id}.jpg`));
      const result = await uploader(`data:image/jpeg;base64,${file.toString('base64')}`, { public_id: entry.id });
      if (result?.secure_url) {
        await store.update(entry.id, { imageUrl: result.secure_url, publicId: result.public_id ?? null });
        uploaded++;
      }
    } catch (err) {
      log(`[snapshots] Could not upload ${entry.id}: ${err.message}`);
      if (err.http_code === 401) break; // bad credentials: every other upload would fail too
    }
  }

  const current = await store.listAll();
  const known = await db.frameAssessment.findMany({
    where: { snapshotId: { in: current.map((e) => e.id) } },
    select: { snapshotId: true, imageUrl: true },
  });
  const byId = new Map(known.map((r) => [r.snapshotId, r]));
  const now = new Date();
  let created = 0;
  for (const entry of current) {
    const row = byId.get(entry.id);
    if (!row) {
      await db.frameAssessment.create({ data: snapshotToRow(entry, { resolvedAt: now }) });
      created++;
    } else if (!row.imageUrl && entry.imageUrl?.startsWith('https://')) {
      await db.frameAssessment.update({
        where: { snapshotId: entry.id },
        data: { imageUrl: entry.imageUrl, imagePublicId: entry.publicId ?? null },
      });
    }
  }
  return { uploaded, created };
}
