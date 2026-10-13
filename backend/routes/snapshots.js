import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSnapshotStore } from '../lib/snapshotStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SNAPSHOTS_DIR = path.resolve(__dirname, '..', 'ML', 'snapshots');

// Webcam snapshots posted by detect.py: JPEG + the frame's assessment.
export function createSnapshotsRouter({ store, streamPort, fetchImpl = fetch }) {
  const router = express.Router();
  // Base64 JPEGs are well over express.json()'s 100 KB default
  router.use(express.json({ limit: '10mb' }));

  router.get('/', async (req, res) => {
    res.json(await store.list());
  });

  router.post('/', async (req, res) => {
    const { imageBase64, trigger = 'auto', assessment } = req.body ?? {};
    if (typeof imageBase64 !== 'string' || !imageBase64 || !assessment || typeof assessment !== 'object') {
      return res.status(400).json({ success: false, error: 'imageBase64 and assessment are required' });
    }
    try {
      const snapshot = await store.add({ imageBase64, trigger, assessment });
      res.status(201).json({ success: true, snapshot });
    } catch (error) {
      console.error('Error saving snapshot:', error);
      res.status(500).json({ success: false, error: 'Failed to save snapshot' });
    }
  });

  // Ask detect.py to save the next frame regardless of detections
  router.post('/capture', async (req, res) => {
    try {
      const upstream = await fetchImpl(`http://localhost:${streamPort}/capture`, { method: 'POST' });
      if (!upstream.ok) throw new Error(`stream server responded ${upstream.status}`);
      res.json({ success: true });
    } catch {
      res.status(503).json({ success: false, message: 'Simulation is not running in webcam mode' });
    }
  });

  return router;
}

export default createSnapshotsRouter({
  store: createSnapshotStore({ dir: SNAPSHOTS_DIR }),
  streamPort: Number(process.env.STREAM_PORT) || 5002,
});
