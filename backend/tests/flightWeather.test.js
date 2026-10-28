import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { assessFlight, toFlightWeather, forecastUrl } from '../lib/flightWeather.js';
import { createWeatherRouter } from '../routes/weather.js';
import { toPlaceName } from '../lib/placeName.js';

const CALM = { wind: 3, gust: 5, rain: 0, rainChance: 10, visibility: 20000, temp: 29, weatherCode: 1 };

test('calm weather is GO', () => {
  const { verdict, reasons } = assessFlight(CALM);
  assert.equal(verdict, 'GO');
  assert.equal(reasons.length, 1);
});

test('moderate wind or light rain is CAUTION', () => {
  assert.equal(assessFlight({ ...CALM, wind: 8 }).verdict, 'CAUTION');
  assert.equal(assessFlight({ ...CALM, rain: 1 }).verdict, 'CAUTION');
  assert.equal(assessFlight({ ...CALM, rainChance: 80 }).verdict, 'CAUTION');
  assert.equal(assessFlight({ ...CALM, visibility: 2000 }).verdict, 'CAUTION');
});

test('stronger wind at 80 m decides the wind check', () => {
  const { verdict, reasons } = assessFlight({ ...CALM, wind: 4, windAloft: 11 });
  assert.equal(verdict, 'NO-GO');
  assert.match(reasons[0].text, /at 80 m/);
  assert.equal(assessFlight({ ...CALM, wind: 4, windAloft: 3 }).verdict, 'GO');
});

test('strong wind, gusts, heavy rain, fog or storms are NO-GO, listed first', () => {
  assert.equal(assessFlight({ ...CALM, wind: 12 }).verdict, 'NO-GO');
  assert.equal(assessFlight({ ...CALM, gust: 16 }).verdict, 'NO-GO');
  assert.equal(assessFlight({ ...CALM, rain: 4 }).verdict, 'NO-GO');
  assert.equal(assessFlight({ ...CALM, visibility: 500 }).verdict, 'NO-GO');
  const storm = assessFlight({ ...CALM, weatherCode: 95, wind: 8 });
  assert.equal(storm.verdict, 'NO-GO');
  assert.deepEqual(storm.reasons.map((r) => r.level), ['NO-GO', 'CAUTION']);
});

test('missing readings do not trip limits', () => {
  assert.equal(assessFlight({ wind: null, gust: null, rain: null, rainChance: null, visibility: null, temp: null }).verdict, 'GO');
});

test('forecastUrl asks for m/s winds at the site', () => {
  const url = new URL(forecastUrl({ lat: 14.7, lon: 121 }));
  assert.equal(url.searchParams.get('latitude'), '14.7');
  assert.equal(url.searchParams.get('wind_speed_unit'), 'ms');
});

const SAMPLE = {
  timezone: 'Asia/Manila',
  current: { time: '2026-10-28T10:00', temperature_2m: 30.24, precipitation: 0, weather_code: 2, wind_speed_10m: 4.18, wind_direction_10m: 90, wind_gusts_10m: 7.5, wind_speed_80m: 6.04, visibility: 24000, cloud_cover: 40 },
  hourly: {
    time: ['2026-10-28T10:00', '2026-10-28T11:00'],
    temperature_2m: [30, 31], precipitation: [0, 3], weather_code: [2, 63],
    wind_speed_10m: [4, 6], wind_direction_10m: [90, 100], wind_gusts_10m: [7, 9], wind_speed_80m: [6, 8],
    visibility: [24000, 8000], cloud_cover: [40, 90], precipitation_probability: [20, 90],
  },
};

test('toFlightWeather maps current and assesses each hour', () => {
  const w = toFlightWeather(SAMPLE);
  assert.equal(w.current.temp, 30.2);
  assert.equal(w.current.wind, 4.2);
  assert.equal(w.current.windAloft, 6);
  assert.equal(w.current.rainChance, 20);
  assert.equal(w.assessment.verdict, 'GO');
  assert.deepEqual(w.hours.map((h) => h.verdict), ['GO', 'NO-GO']);
  assert.equal(w.hours[0].reason, null);
  assert.match(w.hours[1].reason, /Heavy rain/);
});

async function serve(options) {
  const app = express();
  app.use('/api/weather', createWeatherRouter(options));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/weather/flight`;
  return { url, close: () => new Promise((r) => server.close(r)) };
}

test('route caches Open-Meteo and serves stale data when it fails', async () => {
  let calls = 0;
  let fail = false;
  let clock = 0;
  const fetchImpl = async () => {
    calls++;
    if (fail) throw new Error('offline');
    return { ok: true, json: async () => SAMPLE };
  };
  const { url, close } = await serve({ env: {}, fetchImpl, cacheMs: 1000, now: () => clock });
  try {
    const first = await (await fetch(url)).json();
    assert.equal(first.data.assessment.verdict, 'GO');
    assert.equal(first.data.stale, false);
    assert.equal(first.data.location.name, 'Bagong Silang, Caloocan');
    assert.equal(first.data.location.source, 'site');
    await fetch(url);
    assert.equal(calls, 1);

    clock = 5000;
    fail = true;
    const stale = await (await fetch(url)).json();
    assert.equal(calls, 2);
    assert.equal(stale.data.stale, true);
  } finally { await close(); }
});

test('route returns 502 when weather was never fetched', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const { url, close } = await serve({ env: {}, fetchImpl });
  try {
    assert.equal((await fetch(url)).status, 502);
  } finally { await close(); }
});

test('route uses the device position, rounded to ~1 km, and names it once', async () => {
  const forecasts = [];
  const lookups = [];
  let clock = 0;
  const fetchImpl = async (url) => {
    forecasts.push(new URL(url).searchParams.get('latitude'));
    return { ok: true, json: async () => SAMPLE };
  };
  const placeNameImpl = async (coords) => { lookups.push(coords); return 'Deparo, Caloocan'; };
  const { url, close } = await serve({ env: {}, fetchImpl, placeNameImpl, cacheMs: 1000, now: () => clock });
  try {
    const body = await (await fetch(`${url}?lat=14.73968&lon=121.01917`)).json();
    assert.deepEqual(body.data.location, { name: 'Deparo, Caloocan', lat: 14.74, lon: 121.02, source: 'device' });
    assert.deepEqual(forecasts, ['14.74']);

    // Same ~1 km cell is served from cache; after expiry the forecast refreshes but the name is kept
    await fetch(`${url}?lat=14.7401&lon=121.0199`);
    assert.equal(forecasts.length, 1);
    clock = 5000;
    await fetch(`${url}?lat=14.74&lon=121.02`);
    assert.equal(forecasts.length, 2);
    assert.equal(lookups.length, 1);
  } finally { await close(); }
});

test('route rejects bad coordinates and survives a failed name lookup', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => SAMPLE });
  const placeNameImpl = async () => { throw new Error('rate limited'); };
  const { url, close } = await serve({ env: {}, fetchImpl, placeNameImpl });
  try {
    assert.equal((await fetch(`${url}?lat=200&lon=10`)).status, 400);
    assert.equal((await fetch(`${url}?lat=abc&lon=10`)).status, 400);
    const body = await (await fetch(`${url}?lat=10&lon=10`)).json();
    assert.equal(body.data.location.name, null);
  } finally { await close(); }
});

test('toPlaceName picks the local area and city', () => {
  assert.equal(toPlaceName({ name: 'Deparo', address: { quarter: 'Deparo', city: 'Caloocan' } }), 'Deparo, Caloocan');
  assert.equal(toPlaceName({ address: { town: 'Bulakan', state: 'Bulacan' } }), 'Bulakan');
  assert.equal(toPlaceName({ address: { city: 'Manila', suburb: 'Manila' } }), 'Manila');
  assert.equal(toPlaceName({}), null);
});
