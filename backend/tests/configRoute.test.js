import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createConfigRouter } from '../routes/config.js';

async function serve(options) {
  const app = express();
  app.use(express.json());
  app.use('/api/config', createConfigRouter(options));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/config/video`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

const putJson = (url, body) =>
  fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('PUT switches the source and notifies once', async () => {
  const changes = [];
  const { base, close } = await serve({ env: { VIDEO_SOURCE: 'file' }, onSourceChange: (s) => changes.push(s) });
  try {
    const res = await putJson(base, { source: 'webcam' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).source, 'webcam');
    assert.equal((await (await fetch(base)).json()).source, 'webcam');
    await putJson(base, { source: 'webcam' });
    assert.deepEqual(changes, ['webcam']);
  } finally { await close(); }
});

test('PUT rejects an unknown source', async () => {
  const changes = [];
  const { base, close } = await serve({ env: {}, onSourceChange: (s) => changes.push(s) });
  try {
    const res = await putJson(base, { source: 'camera' });
    assert.equal(res.status, 400);
    assert.deepEqual(changes, []);
  } finally { await close(); }
});
