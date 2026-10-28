import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { restartDelayMs, superviseDetector } from '../lib/detector.js';

test('restart delay doubles from 1 s and caps at 30 s', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(restartDelayMs), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
});

// A fake child process and clock so the supervisor runs without Python
function harness() {
  const children = [];
  const timers = [];
  let clock = 0;
  const spawn = (bin, args, opts) => {
    const child = new EventEmitter();
    child.args = args;
    child.opts = opts;
    child.killed = false;
    child.stdinEnded = false;
    child.stdin = { end: () => { child.stdinEnded = true; } };
    child.kill = () => { child.killed = true; };
    children.push(child);
    return child;
  };
  const setTimer = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const h = {
    children,
    timers,
    advance: (ms) => { clock += ms; },
    supervise: () => superviseDetector({ cwd: '/backend', env: {}, spawn, setTimer, now: () => clock, log: () => {} }),
  };
  return h;
}

test('starts detect.py at once, watching its parent pipe', () => {
  const h = harness();
  h.supervise();
  assert.equal(h.children.length, 1);
  assert.deepEqual(h.children[0].args, ['ML/detect.py']);
  assert.equal(h.children[0].opts.env.DETECT_WATCH_PARENT, '1');
});

test('restarts after a crash with growing delays', () => {
  const h = harness();
  h.supervise();
  h.children[0].emit('close', 1, null);
  assert.equal(h.timers[0].ms, 1000);
  h.timers[0].fn();
  h.children[1].emit('close', 1, null);
  assert.equal(h.timers[1].ms, 2000);
  assert.equal(h.children.length, 2);
});

test('a long healthy run resets the delay', () => {
  const h = harness();
  h.supervise();
  h.children[0].emit('close', 1, null);
  h.timers[0].fn();
  h.advance(120_000);
  h.children[1].emit('close', 1, null);
  assert.equal(h.timers[1].ms, 1000);
});

test('stop ends the child and prevents restarts', () => {
  const h = harness();
  const sup = h.supervise();
  sup.stop();
  assert.equal(h.children[0].stdinEnded, true);
  assert.equal(h.children[0].killed, true);
  h.children[0].emit('close', null, 'SIGTERM');
  assert.equal(h.timers.length, 0);
});

test('restart kills the child and starts a new one at once with the overrides', () => {
  const h = harness();
  const sup = h.supervise();
  sup.restart({ VIDEO_SOURCE: 'webcam' });
  assert.equal(h.children[0].killed, true);
  h.children[0].emit('close', null, 'SIGTERM');
  assert.equal(h.timers.length, 0);
  assert.equal(h.children.length, 2);
  assert.equal(h.children[1].opts.env.VIDEO_SOURCE, 'webcam');
});

test('a restart is not counted as a crash', () => {
  const h = harness();
  const sup = h.supervise();
  h.children[0].emit('close', 1, null);
  h.timers[0].fn();
  sup.restart({ VIDEO_SOURCE: 'file' });
  h.children[1].emit('close', null, 'SIGTERM');
  h.children[2].emit('close', 1, null);
  assert.equal(h.timers[1].ms, 1000);
});
