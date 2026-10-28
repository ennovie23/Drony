// Coordinates → short place name ("Deparo, Caloocan") via OpenStreetMap's Nominatim.
// Its usage policy wants an identifying User-Agent and at most ~1 request/s; callers cache.
const USER_AGENT = 'drony-drms/1.0 (disaster response dashboard)';

export function toPlaceName(body) {
  const a = body?.address ?? {};
  const local = a.quarter ?? a.suburb ?? a.village ?? a.neighbourhood ?? a.hamlet ?? body?.name;
  const city = a.city ?? a.town ?? a.municipality ?? a.county ?? a.state;
  const parts = [local, city].filter((p, i, all) => p && all.indexOf(p) === i);
  return parts.length ? parts.join(', ') : null;
}

export async function fetchPlaceName({ lat, lon, fetchImpl = fetch }) {
  const q = new URLSearchParams({ format: 'jsonv2', lat, lon, zoom: 14, 'accept-language': 'en' });
  const res = await fetchImpl(`https://nominatim.openstreetmap.org/reverse?${q}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  return toPlaceName(await res.json());
}
