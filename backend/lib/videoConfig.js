// What the Fire page should play: the test video file, or the live webcam stream
// served by detect.py when VIDEO_SOURCE=webcam.
export function buildVideoConfig(env) {
  const source = env.VIDEO_SOURCE?.trim().toLowerCase() === 'webcam' ? 'webcam' : 'file';
  const filename = env.ACTIVE_VIDEO || 'smoke.mp4';
  const port = env.PORT || 5001;
  const streamPort = env.STREAM_PORT || 5002;
  return {
    source,
    filename,
    videoUrl: `http://localhost:${port}/videos/${filename}`,
    streamUrl: source === 'webcam' ? `http://localhost:${streamPort}/stream` : null,
  };
}
