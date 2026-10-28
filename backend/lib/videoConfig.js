// 'file' or 'webcam' (any case), otherwise null
export function parseVideoSource(value) {
  const source = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return source === 'file' || source === 'webcam' ? source : null;
}

// What the detector analyses: the test video file or the webcam. Either way the
// pages show detect.py's stream of the frames it analysed, so the live boxes match.
export function buildVideoConfig(env) {
  const source = parseVideoSource(env.VIDEO_SOURCE) === 'webcam' ? 'webcam' : 'file';
  const filename = env.ACTIVE_VIDEO || 'smoke.mp4';
  const port = env.PORT || 5001;
  const streamPort = env.STREAM_PORT || 5002;
  return {
    source,
    filename,
    videoUrl: `http://localhost:${port}/videos/${filename}`,
    streamUrl: `http://localhost:${streamPort}/stream`,
  };
}
