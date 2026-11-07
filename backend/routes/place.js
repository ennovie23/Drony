import express from 'express';
import { fetchPlaceName, toStreetName } from '../lib/placeName.js';

const MAX_PLACES = 500;
// Nominatim allows about one request a second; lookups queue up behind each other
const GAP_MS = 1100;

// ~11 m cells: a floating sensor drifting a few metres keeps its name without a new lookup
const roundCoord = (n) => Math.round(n * 1e4) / 1e4;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET /?lat=&lon= → { name } for a flood sensor's GPS position ("Malapitan Road, Bagong
// Silang, Caloocan"), so the Flood page can say where the sensor is. Names are cached per
// cell for as long as the backend runs; a failed lookup isn't cached, so it's retried.
export function createPlaceRouter({
  lookup = (coords) => fetchPlaceName({ ...coords, zoom: 18, format: toStreetName }),
  gapMs = GAP_MS,
  now = Date.now,
} = {}) {
  const router = express.Router();
  const cache = new Map();   // "lat,lon" → name (or null when Nominatim has none)
  const pending = new Map(); // "lat,lon" → promise, so parallel requests share one lookup
  let queue = Promise.resolve();
  let lastAt = -Infinity;

  const throttled = (coords) => {
    const run = queue.then(async () => {
      const wait = lastAt + gapMs - now();
      if (wait > 0) await sleep(wait);
      lastAt = now();
      return lookup(coords);
    });
    queue = run.catch(() => {});
    return run;
  };

  router.get('/', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (req.query.lat == null || req.query.lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)
        || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return res.status(400).json({ success: false, error: 'lat and lon must be valid coordinates' });
    }
    const coords = { lat: roundCoord(lat), lon: roundCoord(lon) };
    const key = `${coords.lat},${coords.lon}`;

    if (cache.has(key)) return res.json({ success: true, data: { ...coords, name: cache.get(key) } });
    try {
      if (!pending.has(key)) pending.set(key, throttled(coords).finally(() => pending.delete(key)));
      const name = await pending.get(key);
      cache.set(key, name ?? null);
      if (cache.size > MAX_PLACES) cache.delete(cache.keys().next().value);
      res.json({ success: true, data: { ...coords, name: name ?? null } });
    } catch (err) {
      res.status(502).json({ success: false, error: `Place name unavailable: ${err.message}` });
    }
  });

  return router;
}
