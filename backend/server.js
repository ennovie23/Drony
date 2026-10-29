import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ── Route modules ─────────────────────────────────────────────────────────────
import detectionRoutes from './routes/detections.js';
import { createConfigRouter } from './routes/config.js';
import snapshotRoutes, { SNAPSHOTS_DIR, snapshotStore } from './routes/snapshots.js';
import { createWeatherRouter } from './routes/weather.js';
import { createFloodRouter } from './routes/flood.js';
import { createHistoryRouter } from './routes/history.js';
import { createDetectorRouter } from './routes/detector.js';
import { prisma } from './lib/db.js';
import { startRetention } from './lib/retention.js';
import { superviseDetector } from './lib/detector.js';
import { seedMockFloodIfEmpty } from './lib/mockFlood.js';
import { syncSnapshots } from './lib/snapshotSync.js';
import { uploadToCloudinary, isCloudinaryConfigured } from './lib/cloudinary.js';

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
// Start / pause / stop for detect.py (Fire page)
app.use('/api/detector',   createDetectorRouter({
  getSupervisor: () => detector,
  db: prisma,
  streamPort: Number(process.env.STREAM_PORT) || 5002,
}));
// Fire snapshots + flood readings for the History page
app.use('/api/history',    createHistoryRouter({ db: prisma }));
// Site weather + GO / CAUTION / NO-GO flight advice
app.use('/api/weather',    createWeatherRouter());

// ── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Drony Backend API is running!' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
// Express 5 still calls this when listening fails, so a second backend started by
// mistake must stop here: otherwise its detect.py would feed frames into the first one
app.listen(PORT, (err) => {
  if (err) {
    console.error(err.code === 'EADDRINUSE'
      ? `Port ${PORT} is already in use: another backend is probably running. Stop it first.`
      : `Could not start the server: ${err.message}`);
    process.exit(1);
  }
  console.log(`Server running → http://localhost:${PORT}`);
  console.log(`Active video   → ${process.env.ACTIVE_VIDEO || 'smoke.mp4'}`);

  // Old database rows are deleted daily so storage stays bounded
  const { settings: keep } = startRetention({ db: prisma });
  console.log(`Keeping data   → detections ${keep.detectionDays || '∞'} days, flood ${keep.floodDays || '∞'} days`);

  // Snapshots saved before they were kept in the database (or whose Cloudinary upload
  // failed) get their image uploaded and a database row
  syncSnapshots({ store: snapshotStore, db: prisma, dir: SNAPSHOTS_DIR, uploader: uploadToCloudinary, isConfigured: isCloudinaryConfigured })
    .then(({ uploaded, created }) => {
      if (uploaded || created) console.log(`Snapshots      → ${uploaded} uploaded to Cloudinary, ${created} added to the database`);
    })
    .catch((err) => console.error('[snapshots] Sync failed:', err.message));

  // An empty flood table gets realistic mock readings so History has flood data;
  // SEED_MOCK_FLOOD=0 opts out
  if (process.env.SEED_MOCK_FLOOD !== '0') {
    seedMockFloodIfEmpty({ db: prisma })
      .then((count) => { if (count) console.log(`Flood          → seeded ${count} mock readings`); })
      .catch((err) => console.error('[flood] Mock seed failed:', err.message));
  }

  // Detection runs whenever the backend does; in webcam mode detect.py starts
  // analysing as soon as a camera is plugged in. DETECTOR_AUTOSTART=0 opts out
  // (e.g. to run ML/detect.py by hand).
  if (process.env.DETECTOR_AUTOSTART !== '0') {
    detector = superviseDetector({ cwd: __dirname });
  }
});