import express from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/db.js';
import { isFresh } from '../lib/freshness.js';
import { createSaveThrottle, DEFAULT_SAVE_INTERVAL_MS } from '../lib/saveThrottle.js';

const IDLE_ASSESSMENT = {
  stale: true,
  timestamp: null,
  fireDetected: false,
  smokeDetected: false,
  threatScore: 0,
  boxes: [],
  primaryHazard: null,
  fire: null,
  smoke: null,
};

// Seconds between "nothing changed" rows; DETECTION_SAVE_INTERVAL_S in .env
const envSaveInterval = () => {
  const s = Number(process.env.DETECTION_SAVE_INTERVAL_S);
  return Number.isFinite(s) && s >= 0 ? s * 1000 : DEFAULT_SAVE_INTERVAL_MS;
};

export function createDetectionsRouter({ db = prisma, saveIntervalMs = envSaveInterval(), now = Date.now } = {}) {
  const router = express.Router();
  const throttle = createSaveThrottle({ intervalMs: saveIntervalMs, now });

  // In-memory cache for ultra-fast polling response
  let latestAssessmentCache = null;
  // Whether fire/smoke rows may still be open; starts true so the first clear frame
  // closes anything left active by an earlier run
  let hazardOpen = true;

  // Fire/smoke has left the video: every still-active fire record is resolved
  async function resolveIfCleared(data) {
    const hazard = data.fireDetected || data.smokeDetected;
    if (hazard) { hazardOpen = true; return; }
    if (!hazardOpen) return;
    hazardOpen = false;
    try {
      await db.frameAssessment.updateMany({ where: { resolvedAt: null }, data: { resolvedAt: data.timestamp } });
    } catch (error) {
      hazardOpen = true; // try again on the next clear frame
      console.error('Error resolving fire records:', error);
    }
  }

  // POST unified frame assessment snapshot from Python. Every frame updates the live
  // view; only some are saved (see lib/saveThrottle.js): 201 when saved, 200 when not.
  router.post('/', async (req, res) => {
    const payload = req.body ?? {};
    const data = {
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      fireDetected: payload.fireDetected ?? false,
      fireConfidence: payload.fireConfidence ?? null,
      fireSeverity: payload.fireSeverity ?? null,
      fireSeverityConf: payload.fireSeverityConf ?? null,
      fireTrend: payload.fireTrend ?? null,
      fireTrendSlope: payload.fireTrendSlope ?? null,
      smokeDetected: payload.smokeDetected ?? false,
      smokeConfidence: payload.smokeConfidence ?? null,
      smokeTrend: payload.smokeTrend ?? null,
      smokeTrendSlope: payload.smokeTrendSlope ?? null,
      threatScore: payload.threatScore ?? 0,
      boxes: payload.boxes ?? [],
    };
    latestAssessmentCache = { id: randomUUID(), ...data, receivedAt: now() };
    await resolveIfCleared(data);

    if (!throttle.take(data)) return res.json({ success: true, saved: false });
    try {
      // A frame with nothing in it was never an active hazard
      const resolvedAt = data.fireDetected || data.smokeDetected ? null : data.timestamp;
      const record = await db.frameAssessment.create({ data: { ...data, resolvedAt, id: latestAssessmentCache.id } });
      res.status(201).json({ success: true, saved: true, record });
    } catch (error) {
      throttle.forget();
      console.error('Error saving frame assessment:', error);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  });

  // GET live bounding boxes for canvas overlays from the latest frame record.
  // Only a frame detect.py sent in the last few seconds counts as live.
  router.get('/live', (req, res) => {
    res.json(isFresh(latestAssessmentCache) ? latestAssessmentCache.boxes ?? [] : []);
  });

  // GET latest unified frame assessment for the command center dashboard
  router.get('/latest', async (req, res) => {
    try {
      const latest = latestAssessmentCache;

      // Detector stopped or never started: report "nothing detected" rather than
      // replaying the last frame it sent as if it were live.
      if (!isFresh(latest)) {
        return res.status(200).json({ success: true, data: IDLE_ASSESSMENT });
      }

      // Format timestamp PHT for convenience
      const timestampPHT = new Date(latest.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' });

      // Primary hazard: Fire has priority if detected. If no fire, fallback to smoke.
      const primaryHazard = latest.fireDetected ? 'fire' : (latest.smokeDetected ? 'smoke' : null);

      // Construct response object mapping side-by-side columns and legacy nested properties for UI safety
      const data = {
        ...latest,
        timestampPHT,
        primaryHazard,
        fire: latest.fireDetected ? {
          confidence: latest.fireConfidence,
          severity: latest.fireSeverity,
          severityConf: latest.fireSeverityConf,
          trend: latest.fireTrend,
          trendSlope: latest.fireTrendSlope,
        } : null,
        smoke: latest.smokeDetected ? {
          confidence: latest.smokeConfidence,
          trend: latest.smokeTrend,
          trendSlope: latest.smokeTrendSlope,
        } : null,
      };

      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Error fetching latest frame assessment:', error);
      res.status(500).json({ success: false, error: 'Database query failed.' });
    }
  });

  return router;
}

export default createDetectionsRouter();
