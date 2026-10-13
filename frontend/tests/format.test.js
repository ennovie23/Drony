import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatStatus } from '../src/components/ui/format.js';

test('sentence-cases status words', () => {
    assert.equal(formatStatus('AIRBORNE'), 'Airborne');
    assert.equal(formatStatus('BLIND ZONE'), 'Blind zone');
    assert.equal(formatStatus('NO DATA'), 'No data');
});

test('empty values render as em dash', () => {
    assert.equal(formatStatus(null), '—');
    assert.equal(formatStatus(undefined), '—');
    assert.equal(formatStatus(''), '—');
});
