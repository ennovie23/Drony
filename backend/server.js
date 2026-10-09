import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import detectionRoutes from './routes/detections.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve ML videos as static files → accessible at /videos/<filename>
app.use('/videos', express.static(path.join(__dirname, 'ML', 'test_video')));

// Mount detection API routes
app.use('/api', detectionRoutes);

// ── Single source of truth for the active video ──────────────────────────────
// Set ACTIVE_VIDEO in .env (e.g. ACTIVE_VIDEO=smoke.mp4).
// The frontend fetches this endpoint so both the detect.py script and the
// browser always play the exact same file without any hardcoding.
app.get('/api/config/video', (req, res) => {
  const activeVideo = process.env.ACTIVE_VIDEO || 'smoke.mp4';
  res.json({
    filename: activeVideo,
    videoUrl: `http://localhost:${PORT}/videos/${activeVideo}`,
  });
});

// Root route
app.get('/', (req, res) => {
  res.send('Drony Backend API is running!');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Active video: ${process.env.ACTIVE_VIDEO || 'smoke.mp4'}`);
});