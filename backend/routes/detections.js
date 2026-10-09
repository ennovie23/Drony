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
  max: 5 // limits concurrent connections to avoid hitting Neon limits
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// POST endpoint for yolo detections (accepts a single detection or a batch array)
router.post('/detections', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];

    const data = items.map(({ timestamp, label, confidence, bboxX1, bboxY1, bboxX2, bboxY2 }) => ({
      // Use the frame's capture time when provided, since batches are inserted later
      ...(timestamp && { timestamp: new Date(timestamp) }),
      label,
      confidence,
      bboxX1,
      bboxY1,
      bboxX2,
      bboxY2,
    }));

    const result = await prisma.fireDetection.createMany({ data });

    res.status(201).json({ success: true, count: result.count });
  } catch (error) {
    console.error('Error saving detection:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default router;