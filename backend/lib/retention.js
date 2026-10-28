// Deletes rows older than a set number of days, once at startup and then once a day,
// so the database stays about the same size however long the system runs.
//   DETECTION_RETENTION_DAYS  fire/smoke rows (FrameAssessment), default 30
//   FLOOD_RETENTION_DAYS      flood sensor rows (FloodReading), default 90
// 0 keeps that table's rows forever.
const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULTS = { detectionDays: 30, floodDays: 90 };

const days = (value, fallback) => {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function retentionSettings(env = process.env) {
  return {
    detectionDays: days(env.DETECTION_RETENTION_DAYS, DEFAULTS.detectionDays),
    floodDays: days(env.FLOOD_RETENTION_DAYS, DEFAULTS.floodDays),
  };
}

// One pass → { detections, flood } rows deleted (null where that table is kept forever)
export async function pruneOldRows({ db, detectionDays, floodDays, now = Date.now() }) {
  const before = (d) => new Date(now - d * DAY_MS);
  const result = { detections: null, flood: null };
  if (detectionDays > 0) {
    ({ count: result.detections } = await db.frameAssessment.deleteMany({ where: { createdAt: { lt: before(detectionDays) } } }));
  }
  if (floodDays > 0) {
    ({ count: result.flood } = await db.floodReading.deleteMany({ where: { recordedAt: { lt: before(floodDays) } } }));
  }
  return result;
}

export function startRetention({ db, env = process.env, intervalMs = DAY_MS, log = console.log }) {
  const settings = retentionSettings(env);
  const run = async () => {
    try {
      const { detections, flood } = await pruneOldRows({ db, ...settings });
      if (detections || flood) log(`[retention] Deleted ${detections ?? 0} detection and ${flood ?? 0} flood rows past their keep period`);
    } catch (err) {
      log('[retention] Cleanup failed:', err.message);
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return { settings, stop: () => clearInterval(timer) };
}
