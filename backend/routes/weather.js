import express from 'express';
import { fetchFlightWeather } from '../lib/flightWeather.js';
import { fetchPlaceName } from '../lib/placeName.js';

const DEFAULT_LAT = 14.7392;  // Bagong Silang, Caloocan
const DEFAULT_LON = 121.0198;
const DEFAULT_NAME = 'Bagong Silang, Caloocan';
const CACHE_MS = 10 * 60 * 1000;
const MAX_PLACES = 50;

// ~1 km cells: nearby positions share one forecast, and exact coordinates never leave the backend
const roundCoord = (n) => Math.round(n * 100) / 100;

function parseCoords(query) {
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  if (query.lat == null || query.lon == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return { lat: roundCoord(lat), lon: roundCoord(lon) };
}

// GET /flight?lat=&lon= → weather + flight recommendation for that position (the browser
// sends the device's location). Without lat/lon it uses the site from SITE_LAT / SITE_LON /
// SITE_NAME in .env. Each ~1 km cell is fetched at most once per 10 minutes; if Open-Meteo
// fails, the last good answer for that cell is served with `stale: true`.
export function createWeatherRouter({
  env = process.env,
  fetchImpl = fetch,
  placeNameImpl = (coords) => fetchPlaceName({ ...coords, fetchImpl }),
  cacheMs = CACHE_MS,
  now = Date.now,
} = {}) {
  const router = express.Router();
  const site = {
    lat: Number(env.SITE_LAT) || DEFAULT_LAT,
    lon: Number(env.SITE_LON) || DEFAULT_LON,
    name: env.SITE_NAME || DEFAULT_NAME,
  };
  const cache = new Map(); // "lat,lon" → { at, data }

  router.get('/flight', async (req, res) => {
    const coords = parseCoords(req.query);
    if (coords === undefined) {
      return res.status(400).json({ success: false, error: 'lat and lon must be valid coordinates' });
    }
    const source = coords ? 'device' : 'site';
    const { lat, lon } = coords ?? site;
    const key = `${lat},${lon}`;
    const hit = cache.get(key);

    if (hit && now() - hit.at < cacheMs) {
      return res.json({ success: true, data: hit.data });
    }
    try {
      const weather = await fetchFlightWeather({ lat, lon, fetchImpl });
      // The name only needs looking up once per cell; a failed lookup just leaves it blank
      let name = coords ? hit?.data.location.name : site.name;
      if (coords && name === undefined) name = await placeNameImpl({ lat, lon }).catch(() => null);

      const data = { ...weather, location: { name, lat, lon, source }, fetchedAt: new Date(now()).toISOString(), stale: false };
      cache.delete(key);
      cache.set(key, { at: now(), data });
      if (cache.size > MAX_PLACES) cache.delete(cache.keys().next().value);
      res.json({ success: true, data });
    } catch (err) {
      if (hit) return res.json({ success: true, data: { ...hit.data, stale: true } });
      res.status(502).json({ success: false, error: `Weather unavailable: ${err.message}` });
    }
  });

  return router;
}
