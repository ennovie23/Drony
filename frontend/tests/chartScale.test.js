import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeYScale } from '../src/components/shared/chartScale.js';

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
