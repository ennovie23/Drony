import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ── Route modules ─────────────────────────────────────────────────────────────
import detectionRoutes from './routes/detections.js';
import { createConfigRouter } from './routes/config.js';
import snapshotRoutes, { SNAPSHOTS_DIR } from './routes/snapshots.js';
import { createWeatherRouter } from './routes/weather.js';
import { createFloodRouter } from './routes/flood.js';
import { prisma } from './lib/db.js';
import { startRetention } from './lib/retention.js';
import { superviseDetector } from './lib/detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 5001;
let detector = null;

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
// Switching the video source restarts detect.py on the new one
app.use('/api/config',     createConfigRouter({
  onSourceChange: (source) => detector?.restart({ VIDEO_SOURCE: source }),
}));

// Flood sensor readings the dashboard receives over USB, kept in the database
app.use('/api/flood',      createFloodRouter({ db: prisma }));
// Site weather + GO / CAUTION / NO-GO flight advice
app.use('/api/weather',    createWeatherRouter());

// ── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Drony Backend API is running!' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running → http://localhost:${PORT}`);
  console.log(`Active video   → ${process.env.ACTIVE_VIDEO || 'smoke.mp4'}`);

  // Old database rows are deleted daily so storage stays bounded
  const { settings: keep } = startRetention({ db: prisma });
  console.log(`Keeping data   → detections ${keep.detectionDays || '∞'} days, flood ${keep.floodDays || '∞'} days`);

  // Detection runs whenever the backend does; in webcam mode detect.py starts
  // analysing as soon as a camera is plugged in. DETECTOR_AUTOSTART=0 opts out
  // (e.g. to run ML/detect.py by hand).
  if (process.env.DETECTOR_AUTOSTART !== '0') {
    detector = superviseDetector({ cwd: __dirname });
  }
});