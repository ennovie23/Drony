import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Route modules ─────────────────────────────────────────────────────────────
import detectionRoutes from './routes/detections.js';
import droneRoutes     from './routes/drone.js';
import configRoutes    from './routes/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Static files ──────────────────────────────────────────────────────────────
// ML videos are served at /videos/<filename>
app.use('/videos', express.static(path.join(__dirname, 'ML', 'test_video')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/detections', detectionRoutes);
app.use('/api/drone',      droneRoutes);
app.use('/api/config',     configRoutes);

// ── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Drony Backend API is running!' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running → http://localhost:${PORT}`);
  console.log(`Active video   → ${process.env.ACTIVE_VIDEO || 'smoke.mp4'}`);
});