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

    const data = items.map(({ timestamp, label, confidence, bboxX1, bboxY1, bboxX2, bboxY2, severity, severityConf}) => ({
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
    const latestDetection = await prisma.fireDetection.findFirst({
      where: {
        status: 'ACTIVE',
      },
      orderBy: {
        timestamp: 'desc',
      },
      select: {
        label: true,
        confidence: true,
        timestamp: true,
        severity: true,
        severityConf: true,
      },
    });

    if (!latestDetection){
      return res.status(404).json({ success: false, message: 'No detection found.' });
    }
    const data = {
      ...latestDetection,
      timestampPHT: new Date(latestDetection.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' }),
    };
    res.status(200).json({ success: true, data });
  } catch (error){
    console.error('Error fetching latest detection: ', error);
    res.status(500).json({success:false, error: 'Database query failed.'});
  }
});

export default router;