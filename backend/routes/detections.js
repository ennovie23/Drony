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

router.post('/', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];

    const data = items.map(({ timestamp, label, confidence, bboxX1, bboxY1, bboxX2, bboxY2, severity, severityConf, trend, trendSlope }) => ({
      // Use the frame's capture time when provided, since batches are inserted later
      ...(timestamp && { timestamp: new Date(timestamp) }),
      label,
      confidence,
      bboxX1,
      bboxY1,
      bboxX2,
      bboxY2,
      severity,
      severityConf,
      trend,
      trendSlope,
    }));

    const result = await prisma.fireDetection.createMany({ data });

    res.status(201).json({ success: true, count: result.count });
  } catch (error) {
    console.error('Error saving detection:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});


router.get('/live', async (req, res) => {
  try {
    const latest = await prisma.fireDetection.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });

    if (!latest) {
      return res.json([]);
    }

    // Only return boxes from the most recent detection frame (300ms window)
    const windowStart = new Date(latest.timestamp.getTime() - 300);
    const rows = await prisma.fireDetection.findMany({
      where: {
        timestamp: {
          gte: windowStart,
          lte: latest.timestamp,
        },
      },
      orderBy: { confidence: 'desc' },
    });

    res.json(rows);
  } catch (error) {
    console.error('Error fetching live detections:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/latest', async (req, res) => {
  try {
    // 1. Find the most recent timestamp in the table
    const latestRecord = await prisma.fireDetection.findFirst({
      orderBy: {
        timestamp: 'desc',
      },
      select: {
        timestamp: true,
      },
    });

    if (!latestRecord) {
      return res.status(404).json({ success: false, message: 'No detection found.' });
    }

    // 2. Fetch all hazard rows sharing that exact same latest timestamp
    const frameDetections = await prisma.fireDetection.findMany({
      where: {
        timestamp: latestRecord.timestamp,
      },
      select: {
        label: true,
        confidence: true,
        timestamp: true,
        severity: true,
        severityConf: true,
        trend: true,
        trendSlope: true,
      },
    });

    // 3. Separate them into fire and smoke lists
    const fireDetections = frameDetections.filter(d => d.label === 'fire');
    const smokeDetections = frameDetections.filter(d => d.label === 'smoke');

    // 4. Pick the dominant fire and smoke records (e.g., highest confidence)
    const primaryFire = fireDetections.length > 0 
      ? fireDetections.reduce((prev, current) => (prev.confidence > current.confidence) ? prev : current)
      : null;

    const primarySmoke = smokeDetections.length > 0 
      ? smokeDetections.reduce((prev, current) => (prev.confidence > current.confidence) ? prev : current)
      : null;

    // Format timestamp PHT for convenience
    const timestampPHT = new Date(latestRecord.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' });

    const data = {
      timestamp: latestRecord.timestamp,
      timestampPHT,
      // If there's fire, it takes visual priority for the main card display. 
      // If no fire exists, it falls back to primarySmoke so the card focuses on smoke instead.
      primaryHazard: primaryFire ? 'fire' : (primarySmoke ? 'smoke' : null),
      fire: primaryFire,       
      smoke: primarySmoke,     
    };

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching latest detection: ', error);
    res.status(500).json({ success: false, error: 'Database query failed.' });
  }
});

export default router;