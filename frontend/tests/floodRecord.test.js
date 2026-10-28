import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toFloodRecord, shouldSave, SERIAL_SAVE_MS } from '../src/utils/floodRecord.js';
import { DEFAULT_SETTINGS } from '../src/utils/floodSensor.js';

const NODE = {
    node: 'N1', seq: 7, distanceCm: 34.3, rssi: -98, snr: 9, lost: 1, source: 'lora', medium: 'air',
    gps: { fix: true, lat: 14.74, lng: 121.02, satellites: 6, chars: 900 }, timestamp: Date.parse('2026-10-28T10:00:00Z'),
};

test('a node packet becomes a record with its flood height', () => {
    const r = toFloodRecord(NODE, DEFAULT_SETTINGS);
    assert.equal(r.nodeId, 'N1');
    assert.equal(r.seq, 7);
    assert.equal(r.recordedAt, '2026-10-28T10:00:00.000Z');
    assert.equal(r.heightCm, 148); // 34.3 cm in air → 148 cm through water, floating probe
    assert.deepEqual([r.gpsFix, r.latitude, r.longitude], [true, 14.74, 121.02]);
});

test('a plain USB reading is saved as node USB without radio or GPS', () => {
    const r = toFloodRecord({ distanceCm: 20, source: 'serial', timestamp: 0 }, { ...DEFAULT_SETTINGS, mount: 'fixed', referenceCm: 100 });
    assert.deepEqual([r.nodeId, r.seq, r.rssi, r.gpsFix, r.latitude], ['USB', null, null, false, null]);
    assert.equal(r.heightCm, 80);
});

test('no echo keeps a null height', () => {
    assert.equal(toFloodRecord({ ...NODE, distanceCm: null }, DEFAULT_SETTINGS).heightCm, null);
});

test('node packets always save; plain USB readings are thinned', () => {
    assert.equal(shouldSave(NODE, 0), true);
    const serial = { source: 'serial', timestamp: 10_000 };
    assert.equal(shouldSave(serial, null), true);
    assert.equal(shouldSave(serial, 10_000 - SERIAL_SAVE_MS + 1), false);
    assert.equal(shouldSave(serial, 10_000 - SERIAL_SAVE_MS), true);
});
