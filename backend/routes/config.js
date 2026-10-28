import express from 'express';
import { buildVideoConfig, parseVideoSource } from '../lib/videoConfig.js';

// The video source starts from VIDEO_SOURCE in .env and can be switched at runtime
// from the Live page; a switch lasts until the backend restarts.
// `onSourceChange(source)` restarts detect.py on the new source.
export function createConfigRouter({ env = process.env, onSourceChange = () => {} } = {}) {
  const router = express.Router();
  const settings = { ...env };

  router.get('/video', (req, res) => {
    res.json(buildVideoConfig(settings));
  });

  router.put('/video', (req, res) => {
    const source = parseVideoSource(req.body?.source);
    if (!source) {
      return res.status(400).json({ success: false, error: "source must be 'file' or 'webcam'" });
    }
    if (source !== buildVideoConfig(settings).source) {
      settings.VIDEO_SOURCE = source;
      onSourceChange(source);
    }
    res.json(buildVideoConfig(settings));
  });

  return router;
}
