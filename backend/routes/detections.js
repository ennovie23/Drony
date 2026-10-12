import express from 'express';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkgPg from 'pg';

const { Pool } = pkgPg;
const { PrismaClient } = pkg;

const router = express.Router();

// Reuse a single shared pool with a capped connection limit
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5, // limits concurrent connections to avoid hitting Neon limits
});
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter });

// In-memory cache for ultra-fast polling response
let latestAssessmentCache = null;

// POST unified frame assessment snapshot from Python
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    const record = await prisma.frameAssessment.create({
      data: {
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
      },
    });

    latestAssessmentCache = record;

    res.status(201).json({ success: true, record });
  } catch (error) {
    console.error('Error saving frame assessment:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// GET live bounding boxes for canvas overlays from the latest frame record
router.get('/live', async (req, res) => {
  try {
    if (latestAssessmentCache && latestAssessmentCache.boxes) {
      return res.json(latestAssessmentCache.boxes);
    }

    const latest = await prisma.frameAssessment.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { boxes: true },
    });

    if (!latest || !latest.boxes) {
      return res.json([]);
    }

    // Return the raw boxes JSON array for canvas rendering
    res.json(latest.boxes);
  } catch (error) {
    console.error('Error fetching live boxes:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET latest unified frame assessment for the command center dashboard
router.get('/latest', async (req, res) => {
  try {
    let latest = latestAssessmentCache;

    if (!latest) {
      latest = await prisma.frameAssessment.findFirst({
        orderBy: { timestamp: 'desc' },
      });
    }

    if (!latest) {
      return res.status(404).json({ success: false, message: 'No frame assessments found.' });
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

export default router;