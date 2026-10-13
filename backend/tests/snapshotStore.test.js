import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSnapshotStore } from '../lib/snapshotStore.js';

const tmpDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'snapshots-'));
const img = (s) => Buffer.from(s).toString('base64');
const exists = (p) => fs.access(p).then(() => true, () => false);

test('add writes jpeg and index entry', async () => {
  const dir = await tmpDir();
  const store = createSnapshotStore({ dir, now: () => 1000 });
  const entry = await store.add({ imageBase64: img('abc'), trigger: 'auto', assessment: { frameIndex: 7, fireDetected: true } });

  assert.equal(entry.id, 'SNAP-000007-1000');
  assert.equal(entry.imageUrl, '/snapshots/SNAP-000007-1000.jpg');
  assert.equal(entry.frame, 7);
  assert.equal(entry.trigger, 'auto');
  assert.equal(await fs.readFile(path.join(dir, 'SNAP-000007-1000.jpg'), 'utf8'), 'abc');
  assert.equal((await store.list())[0].id, entry.id);
});

test('list is newest first', async () => {
  const dir = await tmpDir();
  let t = 0;
  const store = createSnapshotStore({ dir, now: () => ++t });
  await store.add({ imageBase64: img('a'), trigger: 'auto', assessment: { frameIndex: 1 } });
  await store.add({ imageBase64: img('b'), trigger: 'auto', assessment: { frameIndex: 2 } });
  assert.deepEqual((await store.list()).map((e) => e.frame), [2, 1]);
});

test('caps at max and deletes old images', async () => {
  const dir = await tmpDir();
  let t = 0;
  const store = createSnapshotStore({ dir, max: 2, now: () => ++t });
  const first = await store.add({ imageBase64: img('a'), trigger: 'auto', assessment: { frameIndex: 1 } });
  await store.add({ imageBase64: img('b'), trigger: 'auto', assessment: { frameIndex: 2 } });
  await store.add({ imageBase64: img('c'), trigger: 'auto', assessment: { frameIndex: 3 } });
  assert.equal((await store.list()).length, 2);
  assert.equal(await exists(path.join(dir, `${first.id}.jpg`)), false);
});

test('concurrent adds keep every entry', async () => {
  const dir = await tmpDir();
  const store = createSnapshotStore({ dir });
  await Promise.all([1, 2, 3, 4, 5].map((n) =>
    store.add({ imageBase64: img(String(n)), trigger: 'auto', assessment: { frameIndex: n } })));
  assert.equal((await store.list()).length, 5);
});

test('corrupt index reads as empty and recovers', async () => {
  const dir = await tmpDir();
  await fs.writeFile(path.join(dir, 'snapshots.json'), '{oops');
  const store = createSnapshotStore({ dir });
  assert.deepEqual(await store.list(), []);
  await store.add({ imageBase64: img('a'), trigger: 'manual', assessment: { frameIndex: 1 } });
  assert.equal((await store.list()).length, 1);
});

test('missing dir lists empty', async () => {
  const dir = path.join(await tmpDir(), 'does-not-exist');
  assert.deepEqual(await createSnapshotStore({ dir }).list(), []);
});

test('adds succeed while the index is being read', async () => {
  const dir = await tmpDir();
  const store = createSnapshotStore({ dir });
  let reading = true;
  // Like polling GETs: read continuously, yielding to the event loop between reads
  const reader = (async () => {
    while (reading) {
      await store.list();
      await new Promise((resolve) => setImmediate(resolve));
    }
  })();
  try {
    for (let n = 1; n <= 30; n++) {
      await store.add({ imageBase64: img(String(n)), trigger: 'auto', assessment: { frameIndex: n } });
    }
  } finally {
    reading = false;
    await reader;
  }
  assert.equal((await store.list()).length, 30);
});

test('untrusted frameIndex and trigger cannot escape the snapshots dir', async () => {
  const dir = await tmpDir();
  const store = createSnapshotStore({ dir, now: () => 5 });
  const entry = await store.add({ imageBase64: img('x'), trigger: '../evil', assessment: { frameIndex: '/../../pwn' } });
  assert.equal(entry.id, 'SNAP-000000-5');
  assert.equal(entry.frame, 0);
  assert.equal(entry.trigger, 'auto');
  assert.equal(await exists(path.join(dir, 'SNAP-000000-5.jpg')), true);
});

test('eviction never deletes files outside the dir', async () => {
  const root = await tmpDir();
  const dir = path.join(root, 'snaps');
  await fs.mkdir(dir);
  const outside = path.join(root, 'keep.jpg');
  await fs.writeFile(outside, 'keep');
  await fs.writeFile(path.join(dir, 'snapshots.json'), JSON.stringify([{ id: '../keep', frame: 0 }]));
  const store = createSnapshotStore({ dir, max: 1 });
  await store.add({ imageBase64: img('a'), trigger: 'auto', assessment: { frameIndex: 1 } });
  assert.equal(await exists(outside), true);
});

test('a failed index read is retried, not cached as empty', async () => {
  const dir = await tmpDir();
  const indexPath = path.join(dir, 'snapshots.json');
  // A directory where the index file should be makes readFile fail with EISDIR
  await fs.mkdir(indexPath);
  const store = createSnapshotStore({ dir });
  assert.deepEqual(await store.list(), []);

  await fs.rmdir(indexPath);
  await fs.writeFile(indexPath, JSON.stringify([{ id: 'SNAP-000002-2', frame: 2 }, { id: 'SNAP-000001-1', frame: 1 }]));
  assert.equal((await store.list()).length, 2);
});
