import express from 'express';
import { STOP_TRIGGER } from '../lib/history.js';

const STATUS_TIMEOUT_MS = 1000;

// Writes the end of a detection run: a marker row that closes the open fire incident
// in History (see lib/history.js) and resolves every still-active fire record.
export async function closeDetectionRun(db, at = new Date()) {
  await db.frameAssessment.create({
    data: { timestamp: at, fireDetected: false, smokeDetected: false, threatScore: 0, boxes: [], trigger: STOP_TRIGGER, resolvedAt: at },
  });
  await db.frameAssessment.updateMany({ where: { resolvedAt: null }, data: { resolvedAt: at } });
}

// Start / pause / stop for detect.py, used by the Fire page.
//   GET  /status → { state: 'running' | 'paused' | 'starting' | 'stopped' | 'unmanaged', managed }
//                  'unmanaged': this backend's detector is stopped but another detect.py
//                  (e.g. from a second backend) still answers on the stream port
//   POST /start  → launches detect.py, or resumes it when paused
//   POST /pause  → detect.py keeps running but stops analysing
//   POST /stop   → ends detect.py and closes the open fire incident
// getSupervisor() returns null when DETECTOR_AUTOSTART=0 (detect.py run by hand):
// pause and resume still work, start and stop don't.
export function createDetectorRouter({ getSupervisor, db, streamPort, fetchImpl = fetch, now = () => new Date() }) {
  const router = express.Router();
  const stream = (path, method = 'GET') =>
    fetchImpl(`http://localhost:${streamPort}${path}`, { method, signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`stream server responded ${r.status}`))));

  async function state(supervisor = getSupervisor()) {
    if (supervisor?.state === 'stopped') {
      try {
        await stream('/status');
        return 'unmanaged';
      } catch {
        return 'stopped';
      }
    }
    try {
      return (await stream('/status')).paused ? 'paused' : 'running';
    } catch {
      // Launched but not listening yet (loading the models), or not running at all
      return supervisor ? 'starting' : 'stopped';
    }
  }

  const reply = async (res) => res.json({ success: true, state: await state(), managed: Boolean(getSupervisor()) });

  router.get('/status', (req, res) => reply(res));

  router.post('/start', async (req, res) => {
    const supervisor = getSupervisor();
    const current = await state(supervisor);
    if (current === 'paused') {
      try { await stream('/resume', 'POST'); } catch {
        return res.status(503).json({ success: false, error: 'The detector is not responding' });
      }
    } else if (current === 'unmanaged') {
      return res.status(409).json({ success: false, error: 'Another detect.py is already running (is a second backend open?). Stop it first.' });
    } else if (current === 'stopped') {
      if (!supervisor) return res.status(409).json({ success: false, error: 'detect.py is run by hand (DETECTOR_AUTOSTART=0); start it there' });
      supervisor.start();
    }
    reply(res);
  });

  router.post('/pause', async (req, res) => {
    try {
      await stream('/pause', 'POST');
      reply(res);
    } catch {
      res.status(503).json({ success: false, error: 'The detector is not running' });
    }
  });

  router.post('/stop', async (req, res) => {
    const supervisor = getSupervisor();
    if (!supervisor) return res.status(409).json({ success: false, error: 'detect.py is run by hand (DETECTOR_AUTOSTART=0); stop it there' });
    const wasRunning = supervisor.state !== 'stopped';
    supervisor.stop();
    try {
      if (wasRunning) await closeDetectionRun(db, now());
    } catch (err) {
      console.error('Error closing the detection run:', err);
    }
    reply(res);
  });

  return router;
}
