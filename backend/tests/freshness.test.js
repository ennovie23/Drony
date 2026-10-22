import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFresh, LIVE_MAX_AGE_MS } from '../lib/freshness.js';

const now = Date.parse('2026-10-22T15:00:00Z');
const at = (msAgo) => ({ receivedAt: new Date(now - msAgo) });

test('a record just received is fresh', () => {
  assert.equal(isFresh(at(100), now), true);
});

test('a record at the limit is still fresh', () => {
  assert.equal(isFresh(at(LIVE_MAX_AGE_MS), now), true);
});

test('a record past the limit is stale', () => {
  assert.equal(isFresh(at(LIVE_MAX_AGE_MS + 1), now), false);
});

test('an hour-old record is stale', () => {
  assert.equal(isFresh(at(60 * 60 * 1000), now), false);
});

test('missing record or timestamp is stale', () => {
  assert.equal(isFresh(null, now), false);
  assert.equal(isFresh({}, now), false);
});

test('accepts ISO string timestamps', () => {
  assert.equal(isFresh({ receivedAt: new Date(now - 1000).toISOString() }, now), true);
});
