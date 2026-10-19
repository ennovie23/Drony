import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrollArrows } from '../src/utils/scrollStrip.js';

test('no arrows when everything fits', () => {
    assert.deepEqual(scrollArrows({ scrollLeft: 0, clientWidth: 800, scrollWidth: 800 }), { left: false, right: false });
});

test('only the right arrow at the start of an overflowing row', () => {
    assert.deepEqual(scrollArrows({ scrollLeft: 0, clientWidth: 800, scrollWidth: 1400 }), { left: false, right: true });
});

test('both arrows in the middle', () => {
    assert.deepEqual(scrollArrows({ scrollLeft: 300, clientWidth: 800, scrollWidth: 1400 }), { left: true, right: true });
});

test('only the left arrow at the end, tolerating sub-pixel rounding', () => {
    assert.deepEqual(scrollArrows({ scrollLeft: 599.5, clientWidth: 800, scrollWidth: 1400 }), { left: true, right: false });
});
