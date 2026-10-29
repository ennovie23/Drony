import express from 'express';
import { buildIncidents } from '../lib/history.js';

const MAX_ROWS = 50_000; // per hazard type; retention keeps the tables far smaller

const FIRE_FIELDS = {
  id: true, timestamp: true, fireDetected: true, fireConfidence: true, fireSeverity: true,
  smokeDetected: true, smokeConfidence: true, threatScore: true,
  snapshotId: true, imageUrl: true, trigger: true, resolvedAt: true,
};

// Fire + flood incident history for the History page.
//   GET   /?frames=1   → { success, data: [incident] } newest first; frames=1 adds every
//                        frame/reading of each incident (for the raw CSV export)
//   GET   /incidents/:id → { success, data: incident } one incident with its frames
//   PATCH /resolve     { hazardType, from, to, nodeId? } → resolves an incident's rows
export function createHistoryRouter({ db, now = Date.now }) {
  const router = express.Router();
  router.use(express.json());

  // Incidents are grouped from the rows on every read, so one incident needs only its
  // hazard's table: fire ids start "fire-", flood ids "flood-"
  async function incidents({ withFrames, hazard } = {}) {
    const [fireRows, floodRows] = await Promise.all([
      hazard === 'flood' ? [] : db.frameAssessment.findMany({ select: FIRE_FIELDS, orderBy: { timestamp: 'desc' }, take: MAX_ROWS }),
      hazard === 'fire' ? [] : db.floodReading.findMany({ orderBy: { recordedAt: 'desc' }, take: MAX_ROWS }),
    ]);
    return buildIncidents({ fireRows, floodRows, now: now(), withFrames });
  }

  router.get('/incidents/:id', async (req, res) => {
    const hazard = req.params.id.split('-')[0];
    if (hazard !== 'fire' && hazard !== 'flood') {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }
    try {
      const incident = (await incidents({ withFrames: true, hazard })).find((i) => i.id === req.params.id);
      if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
      res.json({ success: true, data: incident });
    } catch (err) {
      console.error('Error reading incident:', err);
      res.status(500).json({ success: false, error: 'Database query failed.' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const data = await incidents({ withFrames: req.query.frames === '1' });
      res.json({ success: true, data });
    } catch (err) {
      console.error('Error reading hazard history:', err);
      res.status(500).json({ success: false, error: 'Database query failed.' });
    }
  });

  router.patch('/resolve', async (req, res) => {
    const { hazardType, nodeId } = req.body ?? {};
    const from = new Date(req.body?.from);
    const to = new Date(req.body?.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return res.status(400).json({ success: false, error: 'from and to must be dates, from first' });
    }
    let table, where;
    if (hazardType === 'fire') {
      table = db.frameAssessment;
      where = { timestamp: { gte: from, lte: to }, resolvedAt: null };
    } else if (hazardType === 'flood' && typeof nodeId === 'string') {
      table = db.floodReading;
      where = { nodeId, recordedAt: { gte: from, lte: to }, resolvedAt: null };
    } else {
      return res.status(400).json({ success: false, error: 'hazardType must be fire, or flood with a nodeId' });
    }
    try {
      const { count } = await table.updateMany({ where, data: { resolvedAt: new Date(now()) } });
      res.json({ success: true, count });
    } catch (err) {
      console.error('Error resolving incident:', err);
      res.status(500).json({ success: false, error: 'Database update failed.' });
    }
  });

  return router;
}
