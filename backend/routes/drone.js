import express from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve to the backend root (one level up from routes/)
const backendRoot = path.resolve(__dirname, '..');

const router = express.Router();

let simulationProcess = null;

// POST /api/drone/start-simulation
// Spawns detect.py as a child process. If one is already running, it no-ops.
router.post('/start-simulation', (req, res) => {
  if (simulationProcess) {
    return res.json({ success: true, message: 'Simulation is already running.' });
  }

  console.log('[drone] Starting ML detection simulation...');
  simulationProcess = spawn('python3', ['ML/detect.py'], {
    cwd: backendRoot,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  simulationProcess.stdout.on('data', (data) => {
    console.log(`[detect.py] ${data.toString().trim()}`);
  });

  simulationProcess.stderr.on('data', (data) => {
    console.error(`[detect.py stderr] ${data.toString().trim()}`);
  });

  simulationProcess.on('close', (code, signal) => {
    console.log(`[detect.py] Process ended (code: ${code}, signal: ${signal})`);
    simulationProcess = null;
  });

  simulationProcess.on('error', (err) => {
    console.error(`[detect.py error] Failed to start process: ${err.message}`);
    simulationProcess = null;
  });

  res.json({ success: true, message: 'Simulation started' });
});

// POST /api/drone/stop-simulation
// Sends SIGTERM to the running detect.py process.
router.post('/stop-simulation', (req, res) => {
  if (simulationProcess) {
    simulationProcess.kill('SIGTERM');
    simulationProcess = null;
    return res.json({ success: true, message: 'Simulation stopped.' });
  }

  res.json({ success: false, message: 'No active simulation is currently running.' });
});

export default router;
