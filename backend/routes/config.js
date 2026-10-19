import express from 'express';
import { buildVideoConfig } from '../lib/videoConfig.js';

const router = express.Router();

router.get('/video', (req, res) => {
  res.json(buildVideoConfig(process.env));
});

export default router;
