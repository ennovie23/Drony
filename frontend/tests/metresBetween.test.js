import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metresBetween } from '../src/utils/floodSensor.js';

test('metresBetween measures short GPS moves', () => {
    const a = { lat: 14.7401, lng: 121.0185 };
    assert.equal(Math.round(metresBetween(a, a)), 0);
    // 0.0001° of latitude ≈ 11 m
    assert.equal(Math.round(metresBetween(a, { lat: 14.7402, lng: 121.0185 })), 11);
});
