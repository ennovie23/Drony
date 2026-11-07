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

// Street level, for a sensor's exact spot: "Malapitan Road, Bagong Silang, Caloocan"
export function toStreetName(body) {
  const a = body?.address ?? {};
  const road = a.road ?? a.pedestrian ?? a.footway ?? a.path ?? a.waterway;
  const area = toPlaceName(body);
  const parts = [road, area].filter((p) => p && !(area && p !== area && area.startsWith(`${p},`)));
  return parts.length ? parts.join(', ') : null;
}

// zoom 14 names the neighbourhood; 18 names the street. `format` turns the answer into a name.
export async function fetchPlaceName({ lat, lon, fetchImpl = fetch, zoom = 14, format = toPlaceName }) {
  const q = new URLSearchParams({ format: 'jsonv2', lat, lon, zoom, 'accept-language': 'en' });
  const res = await fetchImpl(`https://nominatim.openstreetmap.org/reverse?${q}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  return format(await res.json());
}
