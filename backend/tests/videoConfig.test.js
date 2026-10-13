import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoConfig } from '../lib/videoConfig.js';

test('defaults to the file source', () => {
  assert.deepEqual(buildVideoConfig({}), {
    source: 'file',
    filename: 'smoke.mp4',
    videoUrl: 'http://localhost:5001/videos/smoke.mp4',
    streamUrl: null,
  });
});

test('webcam source exposes the stream url', () => {
  const config = buildVideoConfig({ VIDEO_SOURCE: 'WEBCAM', STREAM_PORT: '6000' });
  assert.equal(config.source, 'webcam');
  assert.equal(config.streamUrl, 'http://localhost:6000/stream');
});
