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

// Serve ML videos as static files → accessible at /videos/moderate.mp4, etc.
app.use('/videos', express.static(path.join(__dirname, 'ML', 'test_video')));

// Mount your detection API route
app.use('/api', detectionRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('Drony Backend API is running!');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});