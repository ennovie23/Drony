import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSnapshotStore } from '../lib/snapshotStore.js';
import { saveSnapshotRow } from '../lib/snapshotSync.js';
import { prisma } from '../lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SNAPSHOTS_DIR = path.resolve(__dirname, '..', 'ML', 'snapshots');

// Snapshots posted by detect.py: JPEG + the frame's assessment. With a `db`, each
// snapshot is also kept as a FrameAssessment row for the History page.
export function createSnapshotsRouter({ store, db = null, streamPort, fetchImpl = fetch }) {
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
      if (db) await saveSnapshotRow(db, snapshot);
      res.status(201).json({ success: true, snapshot });
    } catch (error) {
      console.error('Error saving snapshot:', error);
      res.status(500).json({ success: false, error: 'Failed to save snapshot' });
    }
  });

  // Returns all snapshots including archived — used by the History page
  router.get('/history', async (req, res) => {
    res.json(await (store.listAll?.() ?? store.list()));
  });

  // Remove every snapshot (soft-archive) so the live strip starts empty.
  // Images remain in Cloudinary and are still visible in History.
  router.delete('/', async (req, res) => {
    try {
      await store.clear();
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing snapshots:', error);
      res.status(500).json({ success: false, error: 'Failed to clear snapshots' });
    }
  });

  // Soft-archive a specific snapshot by id (removes from live strip, keeps in History)
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const removed = await store.remove?.(id);
      if (removed === false) {
        return res.status(404).json({ success: false, error: 'Snapshot not found' });
      }
      res.json({ success: true, id });
    } catch (error) {
      console.error(`Error archiving snapshot ${id}:`, error);
      res.status(500).json({ success: false, error: 'Failed to archive snapshot' });
    }
  });

  // Permanently destroy a snapshot from disk, Cloudinary, and index — History page only
  router.delete('/:id/destroy', async (req, res) => {
    const { id } = req.params;
    try {
      const destroyed = await store.destroy?.(id);
      if (destroyed === false) {
        return res.status(404).json({ success: false, error: 'Snapshot not found' });
      }
      await db?.frameAssessment.deleteMany({ where: { snapshotId: id } });
      res.json({ success: true, id });
    } catch (error) {
      console.error(`Error permanently deleting snapshot ${id}:`, error);
      res.status(500).json({ success: false, error: 'Failed to delete snapshot' });
    }
  });

  // Ask detect.py to save the next frame regardless of detections
  router.post('/capture', async (req, res) => {
    try {
      const upstream = await fetchImpl(`http://localhost:${streamPort}/capture`, { method: 'POST' });
      if (!upstream.ok) throw new Error(`stream server responded ${upstream.status}`);
      res.json({ success: true });
    } catch {
      res.status(503).json({ success: false, message: 'The detector is not running' });
    }
  });

  return router;
}

export const snapshotStore = createSnapshotStore({ dir: SNAPSHOTS_DIR });

export default createSnapshotsRouter({
  store: snapshotStore,
  db: prisma,
  streamPort: Number(process.env.STREAM_PORT) || 5002,
});
