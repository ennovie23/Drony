import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildIncidents, groupFireIncidents, groupFloodIncidents, toFireFrame, toFloodFrame } from '../lib/history.js';
import { floodSeverity, isFloodHazard } from '../lib/floodLevel.js';
import { generateMockFloodReadings, seedMockFloodIfEmpty } from '../lib/mockFlood.js';
import { snapshotToRow, syncSnapshots } from '../lib/snapshotSync.js';
import { createHistoryRouter } from '../routes/history.js';
import { createDetectionsRouter } from '../routes/detections.js';

const FIRE_ROW = {
  id: 'f1',
  timestamp: new Date('2026-10-28T10:00:00Z'),
  fireDetected: true,
  fireConfidence: 53.46,
  fireSeverity: 'Severe',
  smokeDetected: true,
  smokeConfidence: 40,
  threatScore: 66,
  boxes: [{ id: 1 }],
  snapshotId: 'SNAP-000001-1',
  imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/drony_snapshots/SNAP-000001-1.jpg',
  trigger: 'auto',
  resolvedAt: null,
};
const FLOOD_ROW = {
  id: 'w1',
  recordedAt: new Date('2026-10-28T11:00:00Z'),
  nodeId: 'N1',
  source: 'lora',
  heightCm: 120.04,
  distanceCm: 99.96,
  gpsFix: true,
  latitude: 14.7,
  longitude: 121,
  resolvedAt: null,
};

const T0 = Date.parse('2026-10-28T10:00:00Z');
const at = (s) => new Date(T0 + s * 1000);
const fire = (s, extra = {}) => ({ ...FIRE_ROW, id: `f${s}`, timestamp: at(s), snapshotId: null, imageUrl: null, ...extra });
const clear = (s) => ({ id: `c${s}`, timestamp: at(s), fireDetected: false, smokeDetected: false, threatScore: 3, resolvedAt: at(s) });

test('frames are grouped into incidents; short clear blips do not split one', () => {
  const rows = [
    fire(0), fire(5, { fireSeverity: 'Moderate' }), clear(10), fire(20, { fireConfidence: 80 }), // 10 s blip
    clear(30), clear(40), clear(55), clear(70),                                                  // clear > 30 s
    fire(80, { snapshotId: 'SNAP-000002-2', fireConfidence: 41, imageUrl: 'https://res.cloudinary.com/x/c.jpg' }),
  ];
  const incidents = groupFireIncidents(rows, { now: T0 + 85_000 });
  assert.equal(incidents.length, 2);
  const [first, second] = incidents;
  assert.equal(first.frameCount, 3);
  assert.equal(first.startedAt, at(0).toISOString());
  assert.equal(first.endedAt, at(20).toISOString());
  assert.equal(first.clearedAt, at(30).toISOString());
  assert.equal(first.durationMs, 20_000);
  assert.equal(first.severity, 'Severe', 'peak severity');
  assert.equal(first.confidence, 80, 'peak confidence');
  assert.equal(first.status, 'resolved');
  assert.equal(second.status, 'active', 'still showing in the video');
  assert.equal(second.snapshotCount, 1);
  assert.equal(second.imageUrl, 'https://res.cloudinary.com/x/c.jpg');
});

test('a stop marker ends the incident at once, even if fire comes straight back', () => {
  const stop = { id: 's', timestamp: at(12), fireDetected: false, smokeDetected: false, trigger: 'stop', resolvedAt: at(12) };
  const incidents = groupFireIncidents([fire(0), fire(10), stop, fire(15), fire(20)], { now: T0 + 21_000 });
  assert.equal(incidents.length, 2);
  assert.equal(incidents[0].clearedAt, at(12).toISOString());
  assert.equal(incidents[0].frameCount, 2);
  assert.equal(incidents[1].status, 'active');
});

test('a detector gap ends an incident and a stale open one is not active', () => {
  const rows = [fire(0), fire(5), fire(300), fire(305)]; // 5 min with no frames
  const incidents = groupFireIncidents(rows, { now: T0 + 3_600_000 });
  assert.equal(incidents.length, 2);
  assert.ok(incidents.every((i) => i.status === 'resolved'));
});

test('a resolved-by-hand incident is not active even while open', () => {
  const [incident] = groupFireIncidents([fire(0, { resolvedAt: at(1) })], { now: T0 + 2000 });
  assert.equal(incident.status, 'resolved');
});

test('the cover image is the most confident snapshot that has an image', () => {
  const rows = [
    fire(0, { snapshotId: 'SNAP-000001-1', fireConfidence: 90, imageUrl: null }),
    fire(5, { snapshotId: 'SNAP-000001-2', fireConfidence: 60, imageUrl: 'https://res.cloudinary.com/x/a.jpg' }),
    fire(10, { snapshotId: 'SNAP-000001-3', fireConfidence: 70, imageUrl: 'https://res.cloudinary.com/x/b.jpg' }),
  ];
  const [incident] = groupFireIncidents(rows, { now: T0 });
  assert.equal(incident.imageUrl, 'https://res.cloudinary.com/x/b.jpg');
  assert.equal(incident.snapshots.length, 3);
});

test('guardrails drop empty and anomalous rows', () => {
  assert.equal(toFireFrame({ ...FIRE_ROW, fireConfidence: 0, smokeConfidence: null, fireSeverity: '  ' }), null);
  assert.equal(toFireFrame({ ...FIRE_ROW, timestamp: new Date('nope') }), null);
  assert.equal(toFloodFrame({ ...FLOOD_ROW, heightCm: null }), null);
  assert.equal(toFloodFrame({ ...FLOOD_ROW, heightCm: -5 }), null);
  assert.equal(toFireFrame({ ...FIRE_ROW, imageUrl: '/snapshots/SNAP-000001-1.jpg' }).imageUrl, null);
  // An anomalous frame is skipped, not counted as clear or as fire
  assert.equal(groupFireIncidents([{ ...FIRE_ROW, fireConfidence: 0, smokeConfidence: 0, fireSeverity: null }]).length, 0);
});

test('flood readings above the alert level form one incident per node until it drops', () => {
  const r = (id, nodeId, h, hrs) => ({ ...FLOOD_ROW, id, nodeId, heightCm: h, recordedAt: new Date(T0 + hrs * 3_600_000) });
  const incidents = groupFloodIncidents([
    r('a', 'N1', 20, 0), r('b', 'N1', 80, 1), r('c', 'N1', 160, 2), r('d', 'N1', 30, 3),
    r('e', 'N2', 70, 1), r('f', 'N2', 75, 2),
  ]);
  assert.equal(incidents.length, 2);
  const n1 = incidents.find((i) => i.nodeId === 'N1');
  assert.equal(n1.frameCount, 2);
  assert.equal(n1.heightCm, 160);
  assert.equal(n1.severity, 'Severe');
  assert.equal(n1.status, 'resolved');
  assert.equal(n1.clearedAt, new Date(T0 + 3 * 3_600_000).toISOString());
  assert.equal(incidents.find((i) => i.nodeId === 'N2').status, 'active');
});

test('incidents of both hazards are newest first; frames only on request', () => {
  const incidents = buildIncidents({ fireRows: [FIRE_ROW], floodRows: [FLOOD_ROW], now: T0 });
  assert.deepEqual(incidents.map((i) => i.hazardType), ['flood', 'fire']);
  assert.equal(incidents[0].frames, undefined);
  const withFrames = buildIncidents({ fireRows: [FIRE_ROW], floodRows: [FLOOD_ROW], now: T0, withFrames: true });
  assert.equal(withFrames[1].frames[0].id, 'f1');
});

test('flood severity bands', () => {
  assert.equal(floodSeverity(49.9), null);
  assert.equal(floodSeverity(50), 'Minor');
  assert.equal(floodSeverity(149), 'Moderate');
  assert.equal(floodSeverity(150), 'Severe');
  assert.equal(isFloodHazard(null), false);
});

test('mock flood readings are valid, flood, and resolve when the water drops', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const rows = generateMockFloodReadings({ now, random: () => 0.5 });
  assert.equal(rows.length, 2 * 49);
  assert.ok(rows.every((r) => r.recordedAt.getTime() <= now && Number.isFinite(r.heightCm)));
  assert.ok(rows.some((r) => floodSeverity(r.heightCm) === 'Severe'));
  const incidents = groupFloodIncidents(rows);
  assert.ok(incidents.some((i) => i.status === 'active'), 'N1 is still flooded now');
  assert.ok(incidents.some((i) => i.severity === 'Severe' && i.status === 'resolved'), 'the storm peak has passed');
});

test('mock flood readings are only seeded into an empty table', async () => {
  let inserted = 0;
  const db = (count) => ({ floodReading: { count: async () => count, createMany: async ({ data }) => ({ count: (inserted = data.length) }) } });
  assert.equal(await seedMockFloodIfEmpty({ db: db(3) }), 0);
  assert.equal(inserted, 0);
  assert.ok((await seedMockFloodIfEmpty({ db: db(0) })) > 0);
});

const ENTRY = {
  id: 'SNAP-000010-5',
  capturedAt: '2026-10-28T13:00:00Z',
  trigger: 'manual',
  imageUrl: '/snapshots/SNAP-000010-5.jpg',
  publicId: null,
  assessment: { timestamp: '2026-10-28T13:00:00Z', fireDetected: true, fireConfidence: 61, fireSeverity: 'Moderate', threatScore: 40, boxes: [] },
};

test('a snapshot maps onto a FrameAssessment row', () => {
  const row = snapshotToRow(ENTRY);
  assert.equal(row.snapshotId, ENTRY.id);
  assert.equal(row.imageUrl, null, 'a local path is not kept');
  assert.equal(row.resolvedAt, null, 'a fire snapshot starts active');
  assert.ok(snapshotToRow({ ...ENTRY, assessment: { timestamp: ENTRY.capturedAt } }).resolvedAt, 'an empty frame is never active');
});

test('sync uploads local-only snapshots and adds missing rows', async () => {
  const entries = [{ ...ENTRY }];
  const store = {
    listAll: async () => entries.map((e) => ({ ...e })),
    update: async (id, patch) => Object.assign(entries.find((e) => e.id === id), patch),
  };
  const created = [];
  const db = { frameAssessment: { findMany: async () => [], create: async ({ data }) => created.push(data) } };
  const uploader = async () => ({ secure_url: 'https://res.cloudinary.com/x/SNAP-000010-5.jpg', public_id: 'drony_snapshots/SNAP-000010-5' });
  const result = await syncSnapshots({ store, db, dir: new URL('.', import.meta.url).pathname, uploader, isConfigured: () => true, log: () => {} });
  // No local file in tests/, so the upload fails and the row is still added
  assert.deepEqual(result, { uploaded: 0, created: 1 });
  assert.equal(created[0].imageUrl, null);
  assert.ok(created[0].resolvedAt, 'snapshots from earlier runs are resolved');
});

async function serve(path, router) {
  const app = express();
  app.use(express.json());
  app.use(path, router);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  return { base: `http://127.0.0.1:${server.address().port}${path}`, close: () => new Promise((r) => server.close(r)) };
}

test('GET /api/history returns incidents; PATCH /resolve resolves an incident\'s rows', async () => {
  const updates = [];
  const db = {
    frameAssessment: { findMany: async () => [FIRE_ROW], updateMany: async (args) => { updates.push(args); return { count: 3 }; } },
    floodReading: { findMany: async () => [FLOOD_ROW], updateMany: async (args) => { updates.push(args); return { count: 1 }; } },
  };
  const { base, close } = await serve('/api/history', createHistoryRouter({ db, now: () => T0 }));
  const patch = (body) => fetch(`${base}/resolve`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const body = await (await fetch(base)).json();
    assert.deepEqual(body.data.map((r) => r.id), ['flood-w1', 'fire-f1']);
    assert.ok((await (await fetch(`${base}?frames=1`)).json()).data[0].frames);

    const one = await (await fetch(`${base}/incidents/fire-f1`)).json();
    assert.equal(one.data.id, 'fire-f1');
    assert.equal(one.data.frames.length, 1);
    assert.equal((await fetch(`${base}/incidents/fire-nope`)).status, 404);
    assert.equal((await fetch(`${base}/incidents/lava-1`)).status, 404);

    const res = await patch({ hazardType: 'flood', nodeId: 'N1', from: FLOOD_ROW.recordedAt, to: FLOOD_ROW.recordedAt });
    assert.equal((await res.json()).count, 1);
    assert.equal(updates[0].where.nodeId, 'N1');
    assert.equal(updates[0].where.resolvedAt, null);
    assert.equal((await patch({ hazardType: 'flood', from: T0, to: T0 })).status, 400, 'flood needs a node');
    assert.equal((await patch({ hazardType: 'fire', from: 'x', to: T0 })).status, 400);
  } finally { await close(); }
});

test('a clear frame resolves active fire records once', async () => {
  const resolves = [];
  const db = {
    frameAssessment: {
      create: async ({ data }) => data,
      updateMany: async (args) => { resolves.push(args); return { count: 2 }; },
    },
  };
  const { base, close } = await serve('/api/detections', createDetectionsRouter({ db, saveIntervalMs: 0 }));
  const post = (body) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await post({ fireDetected: true, smokeDetected: false });
    assert.equal(resolves.length, 0);
    await post({ fireDetected: false, smokeDetected: false });
    await post({ fireDetected: false, smokeDetected: false });
    assert.equal(resolves.length, 1);
    assert.deepEqual(resolves[0].where, { resolvedAt: null });
  } finally { await close(); }
});
