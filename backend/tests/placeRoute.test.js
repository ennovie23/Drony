import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPlaceRouter } from '../routes/place.js';
import { toStreetName } from '../lib/placeName.js';

async function serve(options) {
  const app = express();
  app.use('/api/place', createPlaceRouter({ gapMs: 0, ...options }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/place`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

test('names a position once per ~11 m cell', async () => {
  const lookups = [];
  const lookup = async (coords) => { lookups.push(coords); return 'Malapitan Road, Bagong Silang, Caloocan'; };
  const { base, close } = await serve({ lookup });
  try {
    const first = await (await fetch(`${base}?lat=14.740123&lon=121.018534`)).json();
    assert.equal(first.data.name, 'Malapitan Road, Bagong Silang, Caloocan');
    assert.deepEqual(first.data, { lat: 14.7401, lon: 121.0185, name: 'Malapitan Road, Bagong Silang, Caloocan' });
    // A few metres away: same cell, no new lookup
    await fetch(`${base}?lat=14.740141&lon=121.018521`);
    assert.equal(lookups.length, 1);
  } finally { await close(); }
});

test('rejects bad coordinates', async () => {
  const { base, close } = await serve({ lookup: async () => 'x' });
  try {
    assert.equal((await fetch(`${base}?lat=95&lon=121`)).status, 400);
    assert.equal((await fetch(`${base}?lat=14.7`)).status, 400);
  } finally { await close(); }
});

test('a failed lookup answers 502 and is retried next time', async () => {
  let calls = 0;
  const lookup = async () => { calls += 1; if (calls === 1) throw new Error('rate limited'); return 'Deparo, Caloocan'; };
  const { base, close } = await serve({ lookup });
  try {
    assert.equal((await fetch(`${base}?lat=14.75&lon=121.02`)).status, 502);
    const body = await (await fetch(`${base}?lat=14.75&lon=121.02`)).json();
    assert.equal(body.data.name, 'Deparo, Caloocan');
  } finally { await close(); }
});

test('toStreetName adds the road to the area', () => {
  assert.equal(
    toStreetName({ address: { road: 'Malapitan Road', quarter: 'Bagong Silang', city: 'Caloocan' } }),
    'Malapitan Road, Bagong Silang, Caloocan',
  );
  assert.equal(toStreetName({ address: { quarter: 'Bagong Silang', city: 'Caloocan' } }), 'Bagong Silang, Caloocan');
  assert.equal(toStreetName({}), null);
});
