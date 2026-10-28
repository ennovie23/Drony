import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSnapshotsRouter } from '../routes/snapshots.js';

function fakeStore() {
  const entries = [];
  return {
    entries,
    list: async () => entries,
    add: async ({ trigger, assessment }) => {
      const entry = { id: `SNAP-${entries.length}`, trigger, assessment };
      entries.unshift(entry);
      return entry;
    },
    clear: async () => { entries.length = 0; },
    remove: async (id) => {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return false;
      entries.splice(idx, 1);
      return true;
    },
  };
}

async function serve(options) {
  const app = express();
  app.use('/api/snapshots', createSnapshotsRouter({ streamPort: 5002, ...options }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/snapshots`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

const postJson = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('GET returns list', async () => {
  const store = fakeStore();
  store.entries.push({ id: 'SNAP-A' });
  const { base, close } = await serve({ store });
  try {
    const res = await fetch(base);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [{ id: 'SNAP-A' }]);
  } finally { await close(); }
});

test('POST missing fields → 400', async () => {
  const { base, close } = await serve({ store: fakeStore() });
  try {
    const res = await postJson(base, { trigger: 'auto' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).success, false);
  } finally { await close(); }
});

test('POST valid → 201 with snapshot', async () => {
  const store = fakeStore();
  const { base, close } = await serve({ store });
  try {
    const res = await postJson(base, { imageBase64: 'YWJj', trigger: 'auto', assessment: { frameIndex: 1 } });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.snapshot.id, 'SNAP-0');
    assert.equal(store.entries.length, 1);
  } finally { await close(); }
});

test('accepts large image bodies', async () => {
  const { base, close } = await serve({ store: fakeStore() });
  try {
    const imageBase64 = Buffer.alloc(150 * 1024, 1).toString('base64'); // ~200 KB
    const res = await postJson(base, { imageBase64, trigger: 'auto', assessment: {} });
    assert.equal(res.status, 201);
  } finally { await close(); }
});

test('capture proxies to stream server', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init?.method]); return { ok: true }; };
  const { base, close } = await serve({ store: fakeStore(), fetchImpl });
  try {
    const res = await fetch(`${base}/capture`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.deepEqual(calls, [['http://localhost:5002/capture', 'POST']]);
  } finally { await close(); }
});

test('capture when stream down → 503', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const { base, close } = await serve({ store: fakeStore(), fetchImpl });
  try {
    const res = await fetch(`${base}/capture`, { method: 'POST' });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { success: false, message: 'The detector is not running' });
  } finally { await close(); }
});

test('DELETE clears all snapshots', async () => {
  const store = fakeStore();
  store.entries.push({ id: 'SNAP-A' }, { id: 'SNAP-B' });
  const { base, close } = await serve({ store });
  try {
    const res = await fetch(base, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { success: true });
    assert.equal(store.entries.length, 0);
  } finally { await close(); }
});

test('DELETE reports a failed clear as 500', async () => {
  const store = { ...fakeStore(), clear: async () => { throw new Error('EBUSY'); } };
  const { base, close } = await serve({ store });
  try {
    const res = await fetch(base, { method: 'DELETE' });
    assert.equal(res.status, 500);
    assert.equal((await res.json()).success, false);
  } finally { await close(); }
});

test('DELETE /:id removes single snapshot or returns 404', async () => {
  const store = fakeStore();
  store.entries.push({ id: 'SNAP-A' }, { id: 'SNAP-B' });
  const { base, close } = await serve({ store });
  try {
    const resA = await fetch(`${base}/SNAP-A`, { method: 'DELETE' });
    assert.equal(resA.status, 200);
    assert.deepEqual(await resA.json(), { success: true, id: 'SNAP-A' });
    assert.deepEqual(store.entries.map((e) => e.id), ['SNAP-B']);

    const resUnknown = await fetch(`${base}/SNAP-UNKNOWN`, { method: 'DELETE' });
    assert.equal(resUnknown.status, 404);
  } finally { await close(); }
});
