import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEVERITY_TONE, BEHAVIOR_TONE, toneFor, threatTone } from '../src/components/ui/tones.js';

test('severity and behaviour maps', () => {
    assert.equal(toneFor(SEVERITY_TONE, 'SEVERE'), 'danger');
    assert.equal(toneFor(SEVERITY_TONE, 'MODERATE'), 'warn');
    assert.equal(toneFor(BEHAVIOR_TONE, 'DECLINING'), 'ok');
});

test('unknown or missing words fall back to off', () => {
    assert.equal(toneFor(SEVERITY_TONE, 'EXTREME'), 'off');
    assert.equal(toneFor(SEVERITY_TONE, undefined), 'off');
});

test('threatTone bands match the fusion card', () => {
    assert.deepEqual([0, 40, 41, 75, 76, 100].map(threatTone), ['ok', 'ok', 'warn', 'warn', 'danger', 'danger']);
});
