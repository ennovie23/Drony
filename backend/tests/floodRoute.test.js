import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createFloodRouter } from '../routes/flood.js';
import { toFloodRecord } from '../lib/floodRecord.js';

const READING = {
  recordedAt: '2026-10-28T10:00:00.000Z',
  nodeId: 'N1',
  seq: 42,
  source: 'lora',
  distanceCm: 30.5,
  heightCm: 131.6,
  mount: 'float',
  medium: 'water',
  probeDepthCm: 0,
  referenceCm: 100,
  rssi: -97,
  snr: 8.5,
  lost: 0,
  gpsFix: true,
  latitude: 14.7392,
  longitude: 121.0198,
  satellites: 7,
};

test('a full reading maps onto a row', () => {
  const { record, error } = toFloodRecord(READING);
  assert.equal(error, undefined);
  assert.ok(record.recordedAt instanceof Date);
  assert.equal(record.heightCm, 131.6);
  assert.equal(record.latitude, 14.7392);
});

test('no echo and no GPS fix are allowed; coordinates without a fix are dropped', () => {
  const { record } = toFloodRecord({ ...READING, distanceCm: null, heightCm: null, gpsFix: false, latitude: 1, longitude: 2 });
  assert.equal(record.distanceCm, null);
  assert.equal(record.latitude, null);
});

test('bad readings are rejected with a reason', () => {
  assert.match(toFloodRecord({ ...READING, nodeId: 'bad id!' }).error, /nodeId/);
  assert.match(toFloodRecord({ ...READING, source: 'wifi' }).error, /source/);
  assert.match(toFloodRecord({ ...READING, recordedAt: 'soon' }).error, /recordedAt/);
  assert.match(toFloodRecord({ ...READING, rssi: 'loud' }).error, /rssi/);
  assert.match(toFloodRecord({ ...READING, latitude: 200 }).error, /GPS/);
  assert.match(toFloodRecord(null).error, /object/);
});

function fakeDb() {
  const rows = [];
  return {
    rows,
    floodReading: {
      create: async ({ data }) => { const row = { id: String(rows.length + 1), ...data }; rows.push(row); return row; },
      findMany: async (args) => { fakeDb.lastQuery = args; return rows; },
      updateMany: async ({ where, data }) => {
        const hit = rows.filter((r) => r.nodeId === where.nodeId && r.resolvedAt == null && r.recordedAt <= where.recordedAt.lte);
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
  };
}

async function serve(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/flood', createFloodRouter({ db }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/flood/readings`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('POST saves a reading, GET lists with filters', async () => {
  const db = fakeDb();
  const { base, close } = await serve(db);
  try {
    const res = await post(base, READING);
    assert.equal(res.status, 201);
    assert.equal(db.rows.length, 1);

    const list = await (await fetch(`${base}?node=N1&since=2026-10-28T00:00:00Z&limit=5000`)).json();
    assert.equal(list.data.length, 1);
    assert.equal(fakeDb.lastQuery.where.nodeId, 'N1');
    assert.ok(fakeDb.lastQuery.where.recordedAt.gte instanceof Date);
    assert.equal(fakeDb.lastQuery.take, 1000);
  } finally { await close(); }
});

test('POST rejects an invalid reading without touching the database', async () => {
  const db = fakeDb();
  const { base, close } = await serve(db);
  try {
    const res = await post(base, { ...READING, mount: 'tree' });
    assert.equal(res.status, 400);
    assert.equal(db.rows.length, 0);
    assert.equal((await fetch(`${base}?since=never`)).status, 400);
  } finally { await close(); }
});

test('a database failure is a 500', async () => {
  const db = { floodReading: { create: async () => { throw new Error('down'); } } };
  const { base, close } = await serve(db);
  try {
    assert.equal((await post(base, READING)).status, 500);
  } finally { await close(); }
});

test('a flood reading stays active until its node drops below the alert level', async () => {
  const db = fakeDb();
  const { base, close } = await serve(db);
  try {
    await post(base, { ...READING, heightCm: 131.6 });
    await post(base, { ...READING, nodeId: 'N2', heightCm: 90 });
    assert.equal(db.rows[0].resolvedAt, null);

    await post(base, { ...READING, recordedAt: '2026-10-28T11:00:00.000Z', heightCm: 20 });
    assert.equal(db.rows[0].resolvedAt.toISOString(), '2026-10-28T11:00:00.000Z');
    assert.equal(db.rows[1].resolvedAt, null, 'other nodes stay active');
    assert.ok(db.rows[2].resolvedAt, 'a normal reading is never active');
  } finally { await close(); }
});
