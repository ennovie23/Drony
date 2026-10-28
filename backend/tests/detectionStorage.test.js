import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSaveThrottle, assessmentKey } from '../lib/saveThrottle.js';
import { pruneOldRows, retentionSettings } from '../lib/retention.js';
import { createDetectionsRouter } from '../routes/detections.js';

const CLEAR = { fireDetected: false, smokeDetected: false, threatScore: 5 };
const FIRE = { fireDetected: true, smokeDetected: true, fireSeverity: 'Moderate', threatScore: 60 };

test('a frame is saved when a change holds, or every interval', () => {
  let clock = 0;
  const t = createSaveThrottle({ intervalMs: 5000, settleMs: 2000, now: () => clock });
  const at = (ms, a) => { clock = ms; return t.take(a); };
  assert.equal(at(0, CLEAR), true);                 // first frame
  assert.equal(at(300, CLEAR), false);              // same, too soon
  assert.equal(at(600, FIRE), false);               // fire appeared, not yet held 2 s
  assert.equal(at(2599, FIRE), false);
  assert.equal(at(2600, FIRE), true);               // fire held 2 s
  assert.equal(at(3000, { ...FIRE, threatScore: 70 }), false); // same band
  assert.equal(at(7600, FIRE), true);               // 5 s heartbeat
});

test('a threat score flickering across a band edge is not a change', () => {
  let clock = 0;
  const t = createSaveThrottle({ intervalMs: 5000, settleMs: 2000, now: () => clock });
  const saves = [];
  for (let ms = 0; ms <= 20_000; ms += 500) {
    clock = ms;
    if (t.take({ ...FIRE, threatScore: ms % 1000 ? 20 : 66 })) saves.push(ms);
  }
  assert.deepEqual(saves, [0, 5000, 10000, 15000, 20000]);
});

test('severity only matters while there is fire', () => {
  assert.equal(assessmentKey({ ...CLEAR, fireSeverity: 'Severe' }), assessmentKey(CLEAR));
});

test('a failed save lets the next frame try again', () => {
  const t = createSaveThrottle({ now: () => 0 });
  assert.equal(t.take(CLEAR), true);
  t.forget();
  assert.equal(t.take(CLEAR), true);
});

async function serve(options) {
  const app = express();
  app.use(express.json());
  app.use('/api/detections', createDetectionsRouter(options));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/detections`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('every frame reaches the live view, only some are saved', async () => {
  const saved = [];
  const db = { frameAssessment: { create: async ({ data }) => { saved.push(data); return data; } } };
  const { base, close } = await serve({ db, saveIntervalMs: 5000 });
  try {
    assert.equal((await post(base, { ...FIRE, boxes: [{ id: 1 }] })).status, 201);
    const second = await post(base, { ...FIRE, boxes: [{ id: 2 }] });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).saved, false);
    assert.equal(saved.length, 1);

    // The unsaved second frame is still what the dashboard sees
    assert.deepEqual(await (await fetch(`${base}/live`)).json(), [{ id: 2 }]);
    const latest = (await (await fetch(`${base}/latest`)).json()).data;
    assert.equal(latest.primaryHazard, 'fire');
  } finally { await close(); }
});

test('retention deletes only rows past their keep period', async () => {
  const calls = {};
  const db = {
    frameAssessment: { deleteMany: async (args) => { calls.fire = args; return { count: 3 }; } },
    floodReading: { deleteMany: async (args) => { calls.flood = args; return { count: 1 }; } },
  };
  const now = Date.parse('2026-10-31T00:00:00Z');
  const result = await pruneOldRows({ db, detectionDays: 30, floodDays: 90, now });
  assert.deepEqual(result, { detections: 3, flood: 1 });
  assert.equal(calls.fire.where.createdAt.lt.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(calls.flood.where.recordedAt.lt.toISOString(), '2026-08-02T00:00:00.000Z');
});

test('0 days keeps a table forever; bad values fall back to defaults', async () => {
  const db = { frameAssessment: { deleteMany: async () => assert.fail('should keep') }, floodReading: { deleteMany: async () => ({ count: 0 }) } };
  assert.deepEqual(await pruneOldRows({ db, detectionDays: 0, floodDays: 90 }), { detections: null, flood: 0 });
  assert.deepEqual(retentionSettings({ DETECTION_RETENTION_DAYS: '7', FLOOD_RETENTION_DAYS: 'lots' }), { detectionDays: 7, floodDays: 90 });
  assert.deepEqual(retentionSettings({}), { detectionDays: 30, floodDays: 90 });
});
