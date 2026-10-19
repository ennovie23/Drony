import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeYScale, chartWindow } from '../src/components/shared/chartScale.js';

test('normal: max at top', () => {
    const y = makeYScale({ min: 120, max: 210, top: 10, height: 150, invert: false });
    assert.equal(y(210), 10);
    assert.equal(y(120), 160);
});

test('inverted: min at top so falling distance rises', () => {
    const y = makeYScale({ min: 120, max: 210, top: 10, height: 150, invert: true });
    assert.equal(y(120), 10);
    assert.equal(y(210), 160);
    assert.ok(y(146) < y(188));
});

test('window keeps the default range when the data fits', () => {
    assert.deepEqual(chartWindow([146, 188], { min: 120, max: 210, pad: 10 }), { min: 120, max: 210 });
});

test('window widens so out-of-range readings stay inside the plot', () => {
    assert.deepEqual(chartWindow([95, 188, 260], { min: 120, max: 210, pad: 10 }), { min: 85, max: 270 });
});

test('window with no data falls back to the default range', () => {
    assert.deepEqual(chartWindow([], { min: 120, max: 210, pad: 10 }), { min: 120, max: 210 });
});
