import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ── Route modules ─────────────────────────────────────────────────────────────
import detectionRoutes from './routes/detections.js';
import configRoutes    from './routes/config.js';
import snapshotRoutes, { SNAPSHOTS_DIR } from './routes/snapshots.js';
import { superviseDetector } from './lib/detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
// Mounted before the global JSON parser: snapshot bodies need its own 10 MB limit
app.use('/api/snapshots', snapshotRoutes);
app.use(express.json());

// ── Static files ──────────────────────────────────────────────────────────────
// ML videos are served at /videos/<filename>
app.use('/videos', express.static(path.join(__dirname, 'ML', 'test_video')));
// Webcam snapshots are served at /snapshots/<id>.jpg
fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
app.use('/snapshots', express.static(SNAPSHOTS_DIR));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/detections', detectionRoutes);
app.use('/api/config',     configRoutes);

// ── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Drony Backend API is running!' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running → http://localhost:${PORT}`);
  console.log(`Active video   → ${process.env.ACTIVE_VIDEO || 'smoke.mp4'}`);

  // Detection runs whenever the backend does; in webcam mode detect.py starts
  // analysing as soon as a camera is plugged in. DETECTOR_AUTOSTART=0 opts out
  // (e.g. to run ML/detect.py by hand).
  if (process.env.DETECTOR_AUTOSTART !== '0') {
    superviseDetector({ cwd: __dirname });
  }
});