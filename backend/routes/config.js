import express from 'express';

const router = express.Router();

router.get('/video', (req, res) => {
  const activeVideo = process.env.ACTIVE_VIDEO || 'smoke.mp4';
  const port = process.env.PORT || 5001;
  res.json({
    filename: activeVideo,
    videoUrl: `http://localhost:${port}/videos/${activeVideo}`,
  });
});

export default router;
