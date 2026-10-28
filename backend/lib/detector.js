import { spawn as nodeSpawn } from 'child_process';
import { resolvePythonBin } from './python.js';

// A run this long counts as healthy, so the next crash restarts quickly again
const HEALTHY_RUN_MS = 60_000;
const MAX_DELAY_MS = 30_000;

// 1 s, 2 s, 4 s … capped at 30 s, so a detector that crashes on start-up
// (bad weights, missing package) can't spin in a tight restart loop.
export function restartDelayMs(crashesInARow) {
  return Math.min(1000 * 2 ** Math.max(0, crashesInARow - 1), MAX_DELAY_MS);
}

// Keeps ML/detect.py running for as long as the backend runs. detect.py waits
// for the webcam itself, so "plugged in" / "unplugged" never needs a restart here;
// this only recovers from crashes. detect.py exits when its stdin pipe closes, so it
// never outlives this process (restart, crash or Ctrl+C).
export function superviseDetector({
  cwd,
  env = process.env,
  spawn = nodeSpawn,
  setTimer = setTimeout,
  now = Date.now,
  log = console.log,
} = {}) {
  let child = null;
  let crashes = 0;
  let startedAt = 0;
  let stopped = false;
  let restarting = false;
  let timer = null;

  const start = () => {
    timer = null;
    if (stopped) return;
    startedAt = now();
    log('[detector] Starting ML/detect.py');
    child = spawn(resolvePythonBin(process.platform, env), ['ML/detect.py'], {
      cwd,
      // OPENCV_LOG_LEVEL hides the "can't open camera" warning every retry while waiting
      env: { OPENCV_LOG_LEVEL: 'ERROR', ...env, PYTHONUNBUFFERED: '1', DETECT_WATCH_PARENT: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (data) => log(`[detect.py] ${data.toString().trim()}`));
    child.stderr?.on('data', (data) => log(`[detect.py stderr] ${data.toString().trim()}`));
    child.on('error', (err) => log(`[detector] Failed to start detect.py: ${err.message}`));
    child.on('close', (code, signal) => {
      child = null;
      if (stopped) return;
      if (restarting) {
        restarting = false;
        start();
        return;
      }
      crashes = now() - startedAt >= HEALTHY_RUN_MS ? 1 : crashes + 1;
      const delay = restartDelayMs(crashes);
      log(`[detector] detect.py exited (code: ${code}, signal: ${signal}); restarting in ${delay / 1000} s`);
      timer = setTimer(start, delay);
    });
  };

  start();

  return {
    // Restart detect.py at once with `overrides` merged into its env (e.g. a new
    // VIDEO_SOURCE). A deliberate restart isn't a crash, so the backoff resets.
    restart(overrides = {}) {
      env = { ...env, ...overrides };
      if (stopped) return;
      crashes = 0;
      if (child) {
        restarting = true;
        child.stdin?.end();
        child.kill('SIGTERM');
        return;
      }
      if (timer) clearTimeout(timer);
      start();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (child) {
        child.stdin?.end();
        child.kill('SIGTERM');
      }
    },
  };
}
