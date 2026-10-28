import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoConfig, parseVideoSource } from '../lib/videoConfig.js';

test('defaults to the file source', () => {
  assert.deepEqual(buildVideoConfig({}), {
    source: 'file',
    filename: 'smoke.mp4',
    videoUrl: 'http://localhost:5001/videos/smoke.mp4',
    streamUrl: 'http://localhost:5002/stream',
  });
});

test('webcam source exposes the stream url', () => {
  const config = buildVideoConfig({ VIDEO_SOURCE: 'WEBCAM', STREAM_PORT: '6000' });
  assert.equal(config.source, 'webcam');
  assert.equal(config.streamUrl, 'http://localhost:6000/stream');
});

test('parseVideoSource accepts only file or webcam', () => {
  assert.equal(parseVideoSource(' Webcam '), 'webcam');
  assert.equal(parseVideoSource('file'), 'file');
  assert.equal(parseVideoSource('camera'), null);
  assert.equal(parseVideoSource(undefined), null);
});
