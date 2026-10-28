import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compass, describeWeather, formatCoords, formatVisibility, hourOf, weatherCell, VERDICT_TONE } from '../src/utils/flightWeather.js';

test('compass words', () => {
    assert.deepEqual([0, 44, 90, 180, 270, 350, -90].map(compass), ['N', 'NE', 'E', 'S', 'W', 'N', 'W']);
    assert.equal(compass(null), '—');
});

test('visibility and hour formatting', () => {
    assert.equal(formatVisibility(24000), '24 km');
    assert.equal(formatVisibility(800), '800 m');
    assert.equal(hourOf('2026-10-28T14:00'), '14:00');
});

test('weather code descriptions', () => {
    assert.equal(describeWeather(2), 'Partly cloudy');
    assert.equal(describeWeather(95), 'Thunderstorm');
    assert.equal(describeWeather(77), 'Unsettled');
    assert.equal(describeWeather(null), '—');
});

test('weather cell rounds to ~1 km like the backend', () => {
    assert.deepEqual(weatherCell({ lat: 14.73968, lon: 121.01917 }), { lat: 14.74, lon: 121.02 });
    assert.equal(weatherCell(null), null);
});

test('coordinates format with hemispheres', () => {
    assert.equal(formatCoords(14.7392, 121.0198), '14.7392° N · 121.0198° E');
    assert.equal(formatCoords(-33.86, -70.6, 2), '33.86° S · 70.60° W');
});

test('every verdict has a tone', () => {
    assert.deepEqual(Object.values(VERDICT_TONE), ['ok', 'warn', 'danger']);
});
