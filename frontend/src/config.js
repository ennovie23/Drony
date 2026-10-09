// ─── Backend base URL ─────────────────────────────────────────────────────────
// Change this when deploying to production.
export const API_BASE_URL = 'http://localhost:5001';

// ─── Video paths ──────────────────────────────────────────────────────────────
// Served by the backend via express.static at /videos/*
export const VIDEO_PATH = `${API_BASE_URL}/videos/smoke.mp4`;
