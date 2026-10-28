// Flight-advice verdicts from /api/weather/flight → chip tone and wording.
export const VERDICT_TONE = { GO: 'ok', CAUTION: 'warn', 'NO-GO': 'danger' };
export const VERDICT_LABEL = { GO: 'Good to fly', CAUTION: 'Fly with caution', 'NO-GO': 'Do not fly' };

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Wind direction in degrees (where it blows from) → 8-point compass word
export function compass(deg) {
    if (deg == null) return '—';
    return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function formatVisibility(m) {
    if (m == null) return '—';
    return m >= 1000 ? `${Math.round(m / 1000)} km` : `${Math.round(m)} m`;
}

// WMO weather code → short description
const CONDITIONS = [
    [0, 'Clear sky'], [1, 'Mainly clear'], [2, 'Partly cloudy'], [3, 'Overcast'],
    [45, 'Fog'], [48, 'Freezing fog'],
    [51, 'Light drizzle'], [53, 'Drizzle'], [55, 'Heavy drizzle'],
    [61, 'Light rain'], [63, 'Rain'], [65, 'Heavy rain'],
    [80, 'Light showers'], [81, 'Showers'], [82, 'Violent showers'],
    [95, 'Thunderstorm'], [96, 'Thunderstorm, hail'], [99, 'Thunderstorm, hail'],
];
const CONDITION_TEXT = new Map(CONDITIONS);

export function describeWeather(code) {
    if (code == null) return '—';
    return CONDITION_TEXT.get(code) ?? 'Unsettled';
}

// Position → the ~1 km cell the backend forecasts for (same rounding as routes/weather.js)
export function weatherCell(coords) {
    if (!coords) return null;
    const round = (n) => Math.round(n * 100) / 100;
    return { lat: round(coords.lat), lon: round(coords.lon) };
}

// True once the weather shown is for this device's own position (not the default site)
export function isLiveLocation(device, weather) {
    return device.status === 'live' && weather?.location.source === 'device';
}

// 14.7392, 121.0198 → '14.7392° N · 121.0198° E'
export function formatCoords(lat, lon, digits = 4) {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(digits)}° ${ns} · ${Math.abs(lon).toFixed(digits)}° ${ew}`;
}

// '2026-10-28T14:00' (site-local) → '14:00'
export const hourOf = (time) => String(time).slice(11, 16);
