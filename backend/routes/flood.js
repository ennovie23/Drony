import express from 'express';
import { toFloodRecord } from '../lib/floodRecord.js';

const MAX_LIMIT = 1000;

// Flood sensor history. The sensor reaches the dashboard over USB (browser Web Serial),
// so the dashboard posts each reading here to keep it.
//   POST /readings          one reading → 201 { success, record }
//   GET  /readings?node=&since=&limit=   newest first (default 100, max 1000)
export function createFloodRouter({ db }) {
  const router = express.Router();

  router.post('/readings', async (req, res) => {
    const { record, error } = toFloodRecord(req.body);
    if (error) return res.status(400).json({ success: false, error });
    try {
      const saved = await db.floodReading.create({ data: record });
      res.status(201).json({ success: true, record: saved });
    } catch (err) {
      console.error('Error saving flood reading:', err);
      res.status(500).json({ success: false, error: 'Could not save the reading' });
    }
  });

  router.get('/readings', async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), MAX_LIMIT);
    const since = req.query.since ? new Date(req.query.since) : null;
    if (since && Number.isNaN(since.getTime())) {
      return res.status(400).json({ success: false, error: 'since must be a date' });
    }
    const where = {
      ...(req.query.node ? { nodeId: String(req.query.node) } : {}),
      ...(since ? { recordedAt: { gte: since } } : {}),
    };
    try {
      const readings = await db.floodReading.findMany({ where, orderBy: { recordedAt: 'desc' }, take: limit });
      res.json({ success: true, data: readings });
    } catch (err) {
      console.error('Error reading flood history:', err);
      res.status(500).json({ success: false, error: 'Database query failed.' });
    }
  });

  return router;
}
