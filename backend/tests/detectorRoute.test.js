import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createDetectorRouter } from '../routes/detector.js';

// A fake detect.py stream server reachable through fetchImpl
function fakeStream({ up = true } = {}) {
  const s = { up, paused: false, calls: [] };
  s.fetch = async (url, { method = 'GET' } = {}) => {
    const path = new URL(url).pathname;
    s.calls.push(`${method} ${path}`);
    if (!s.up) throw new Error('ECONNREFUSED');
    if (path === '/pause') s.paused = true;
    if (path === '/resume') s.paused = false;
    return { ok: true, json: async () => ({ paused: s.paused }) };
  };
  return s;
}

function fakeSupervisor() {
  return {
    state: 'running',
    start() { this.state = 'running'; },
    stop() { this.state = 'stopped'; },
  };
}

function fakeDb() {
  const db = { created: [], resolved: [] };
  db.frameAssessment = {
    create: async ({ data }) => db.created.push(data),
    updateMany: async (args) => { db.resolved.push(args); return { count: 1 }; },
  };
  return db;
}

async function serve(opts) {
  const app = express();
  app.use('/api/detector', createDetectorRouter({ streamPort: 5002, ...opts }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/detector`;
  const call = async (path, method = 'POST') => {
    const res = await fetch(`${base}${path}`, { method });
    return { status: res.status, body: await res.json() };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

test('pause, resume and stop move through the states', async () => {
  const stream = fakeStream();
  const supervisor = fakeSupervisor();
  const db = fakeDb();
  const at = new Date('2026-10-28T12:00:00Z');
  const { call, close } = await serve({ getSupervisor: () => supervisor, db, fetchImpl: stream.fetch, now: () => at });
  try {
    assert.equal((await call('/status', 'GET')).body.state, 'running');
    assert.equal((await call('/pause')).body.state, 'paused');
    assert.equal((await call('/start')).body.state, 'running', 'start resumes a paused detector');
    assert.ok(stream.calls.includes('POST /resume'));

    stream.up = false; // detect.py exits once stopped
    const stopped = await call('/stop');
    assert.equal(stopped.body.state, 'stopped');
    assert.equal(db.created[0].trigger, 'stop');
    assert.deepEqual(db.resolved[0], { where: { resolvedAt: null }, data: { resolvedAt: at } });

    await call('/stop');
    assert.equal(db.created.length, 1, 'stopping twice writes one marker');

    assert.equal((await call('/start')).body.state, 'starting', 'launched, not listening yet');
    assert.equal(supervisor.state, 'running');
    stream.up = true;
    assert.equal((await call('/status', 'GET')).body.state, 'running');
  } finally { await close(); }
});

test('a launched detector that is not listening yet is starting', async () => {
  const { call, close } = await serve({ getSupervisor: fakeSupervisor, db: fakeDb(), fetchImpl: fakeStream({ up: false }).fetch });
  try {
    assert.equal((await call('/status', 'GET')).body.state, 'starting');
    assert.equal((await call('/pause')).status, 503);
  } finally { await close(); }
});

test('without a supervisor (run by hand) start and stop are refused', async () => {
  const { call, close } = await serve({ getSupervisor: () => null, db: fakeDb(), fetchImpl: fakeStream({ up: false }).fetch });
  try {
    const status = (await call('/status', 'GET')).body;
    assert.deepEqual([status.state, status.managed], ['stopped', false]);
    assert.equal((await call('/start')).status, 409);
    assert.equal((await call('/stop')).status, 409);
  } finally { await close(); }
});

test('a detector this backend did not start is reported after stop', async () => {
  const supervisor = fakeSupervisor();
  supervisor.state = 'stopped';
  const { call, close } = await serve({ getSupervisor: () => supervisor, db: fakeDb(), fetchImpl: fakeStream().fetch });
  try {
    assert.equal((await call('/status', 'GET')).body.state, 'unmanaged');
    assert.equal((await call('/start')).status, 409, 'starting ours would only fight it for the port');
    assert.equal(supervisor.state, 'stopped');
  } finally { await close(); }
});
