import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toUiSnapshot, toModelResult } from '../src/utils/snapshots.js';

const entry = (assessment) => ({
    id: 'SNAP-000001-1',
    frame: 1,
    capturedAt: '2026-10-13T08:00:00.000Z',
    trigger: 'auto',
    imageUrl: '/snapshots/SNAP-000001-1.jpg',
    assessment: { boxes: [], ...assessment },
});

test('maps boxes to percent rects', () => {
    const ui = toUiSnapshot(entry({
        boxes: [{ id: 'fire_0', label: 'fire', confidence: 0.8, bboxX1: 10, bboxY1: 20, bboxX2: 50, bboxY2: 80 }],
    }));
    assert.deepEqual(ui.detections, [{ id: 'fire_0', label: 'fire', confidence: 0.8, box: { x: 10, y: 20, w: 40, h: 60 } }]);
    assert.equal(ui.imageUrl, '/snapshots/SNAP-000001-1.jpg');
    assert.equal(ui.frame, 1);
});

test('uppercases severity', () => {
    assert.equal(toUiSnapshot(entry({ fireDetected: true, fireSeverity: 'Severe' })).severity, 'SEVERE');
});

test('smoke-only entry maps without severity', () => {
    const ui = toUiSnapshot(entry({ fireDetected: false, smokeDetected: true, smokeConfidence: 62, smokeTrend: 'EXPANDING' }));
    assert.equal(ui.fireConfidence, 0);
    assert.equal(ui.severity, null);
    assert.equal(ui.behavior, 'EXPANDING');
    assert.deepEqual(ui.smoke, { detected: true, confidence: 0.62 });
});

test('toModelResult on flat snapshot assessment', () => {
    const r = toModelResult({
        fireDetected: true, fireConfidence: 85.2, fireSeverity: 'Severe', fireSeverityConf: 91,
        fireTrend: 'GROWING', fireTrendSlope: 0.1234, threatScore: 77,
    });
    assert.equal(r.primaryHazard, 'fire');
    assert.equal(r.threatScore, 77);
    assert.equal(r.fire.confidence, '85.2');
    assert.equal(r.fire.severity, 'Severe');
    assert.equal(r.fire.trendSlope, '0.12');
    assert.equal(r.smoke, null);
});

test('toModelResult on /latest shape', () => {
    const r = toModelResult({
        primaryHazard: 'smoke', fire: null, threatScore: 10, timestampPHT: 'x',
        smoke: { confidence: 0.5, trend: 'STABLE', trendSlope: 0 },
    });
    assert.equal(r.timestamp, 'x');
    assert.equal(r.smoke.confidence, '50.0');
    assert.equal(r.smoke.trendSlope, '0.00');
    assert.equal(r.fire, null);
});
