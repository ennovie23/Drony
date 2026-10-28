import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floodHeight, floodTrend, mapEmbedUrl, sensorHealth, sensorPositions, toAirCalibrated, trueDistance } from '../src/utils/floodSensor.js';

const FLOAT_WATER = { mount: 'float', medium: 'water', probeDepthCm: 5, referenceCm: 100 };
const FIXED = { mount: 'fixed', medium: 'water', probeDepthCm: 0, referenceCm: 100 };

test('floating in water converts to the speed of sound in water and adds probe depth', () => {
    assert.equal(Math.round(trueDistance(34.3, FLOAT_WATER)), 148);
    assert.equal(Math.round(floodHeight(34.3, FLOAT_WATER)), 153);
    assert.equal(floodHeight(34.3, { ...FLOAT_WATER, medium: 'air' }), 39.3);
});

test('fixed mount subtracts the reading from the height to dry ground, in air', () => {
    assert.equal(floodHeight(60, FIXED), 40);
    assert.equal(floodHeight(null, FIXED), null);
});

test('old firmware water readings are brought back to air-calibrated', () => {
    const item = toAirCalibrated({ distanceCm: 148, medium: 'water' });
    assert.equal(Math.round(item.distanceCm * 10) / 10, 34.3);
    assert.equal(item.medium, 'air');
});

test('trend needs 30 s of history and reports cm per minute', () => {
    assert.equal(floodTrend([{ timestamp: 0, heightCm: 10 }, { timestamp: 20_000, heightCm: 20 }]), null);
    const rising = floodTrend([{ timestamp: 0, heightCm: 10 }, { timestamp: 60_000, heightCm: 13 }]);
    assert.equal(rising.direction, 'RISING');
    assert.equal(rising.ratePerMin, 3);
    assert.equal(floodTrend([{ timestamp: 0, heightCm: 10 }, { timestamp: 60_000, heightCm: 10.2 }]).direction, 'STEADY');
});

const station = { ready: true, frequencyMHz: 433, sf: 9, rx: 3, lost: 0, unknown: 0, timestamp: 9_000 };
const packet = (patch = {}) => ({
    node: 'FS01', seq: 3, distanceCm: 50, rssi: -70, snr: 8, source: 'lora', lora: null,
    gps: { fix: true, lat: 14.65, lng: 121.05, satellites: 7, chars: 900 }, timestamp: 8_000, ...patch,
});

test('health: all green when the station and sensor are live', () => {
    const h = sensorHealth({ status: 'connected', station, last: packet(), now: 10_000, connectedAt: 0 });
    assert.equal(h.verdict.tone, 'ok');
    assert.deepEqual(h.rows.map((r) => r.tone), ['ok', 'ok', 'ok', 'ok']);
});

test('health: points at the depth sensor on no echo', () => {
    const h = sensorHealth({ status: 'connected', station, last: packet({ distanceCm: null }), now: 10_000, connectedAt: 0 });
    assert.equal(h.verdict.tone, 'danger');
    assert.match(h.verdict.text, /depth sensor/);
});

test('health: a silent flood sensor is a radio-link problem', () => {
    const h = sensorHealth({ status: 'connected', station: { ...station, timestamp: 59_000 }, last: packet(), now: 60_000, connectedAt: 0 });
    assert.equal(h.rows[1].tone, 'danger');
});

test('health: no ground-station status after connecting means the wrong port', () => {
    const h = sensorHealth({ status: 'connected', station: null, last: undefined, now: 10_000, connectedAt: 0 });
    assert.equal(h.rows[0].tone, 'danger');
});

test('health: everything grey before connecting', () => {
    const h = sensorHealth({ status: 'disconnected', station: null, last: undefined, now: 0, connectedAt: null });
    assert.equal(h.verdict.tone, 'off');
    assert.ok(h.rows.every((r) => r.tone === 'off'));
});

test('positions keep the last fix per sensor, newest sensor first', () => {
    const noFix = { fix: false, lat: null, lng: null, satellites: 2, chars: 400 };
    const list = sensorPositions([
        packet({ node: 'FS01', timestamp: 1_000 }),
        packet({ node: 'FS02', timestamp: 2_000, gps: noFix }),
        packet({ node: 'FS01', timestamp: 3_000, gps: noFix }),
        { distanceCm: 40, source: 'serial', timestamp: 4_000 },
    ]);
    assert.deepEqual(list.map((p) => p.node), ['FS01', 'FS02']);
    assert.deepEqual(list[0].fix, { lat: 14.65, lng: 121.05, satellites: 7, timestamp: 1_000 });
    assert.equal(list[0].current, false);
    assert.equal(list[1].fix, null);
});

test('map url centres on the fix with a marker', () => {
    const url = mapEmbedUrl(14.65, 121.05);
    assert.match(url, /bbox=121\.0480,14\.6480,121\.0520,14\.6520/);
    assert.match(url, /marker=14\.6500,121\.0500$/);
});
