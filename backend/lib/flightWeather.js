// Weather at the site from Open-Meteo (free, no API key) and a GO / CAUTION / NO-GO
// call for flying the drone in it. Limits suit a small quadcopter; tune them here.
export const LIMITS = {
  wind:       { caution: 7,    noGo: 10 },   // sustained, m/s
  gust:       { caution: 10,   noGo: 15 },   // m/s
  rain:       { caution: 0.5,  noGo: 2.5 },  // mm/h
  rainChance: { caution: 60 },               // % in the hour
  visibility: { caution: 3000, noGo: 1000 }, // m (lower is worse)
  temp:       { low: 0, high: 40 },          // °C, battery/motor comfort range
};

// WMO weather codes 95–99 are thunderstorms
const isThunderstorm = (code) => code >= 95 && code <= 99;

const RANK = { GO: 0, CAUTION: 1, 'NO-GO': 2 };

// conditions: { wind, windAloft, gust, rain, rainChance, visibility, temp, weatherCode } (any may be null)
// → { verdict, reasons: [{ level, text }] }, worst reason first
export function assessFlight(c) {
  const reasons = [];
  const flag = (level, text) => reasons.push({ level, text });

  if (isThunderstorm(c.weatherCode)) flag('NO-GO', 'Thunderstorm in the area');

  // Judge wind by the stronger of ground level (10 m) and flight height (80 m)
  const aloft = c.windAloft != null && c.windAloft > (c.wind ?? 0);
  const wind = aloft ? c.windAloft : c.wind;
  const where = aloft ? ' at 80 m' : '';
  if (wind >= LIMITS.wind.noGo) flag('NO-GO', `Wind ${wind} m/s${where} is above the ${LIMITS.wind.noGo} m/s limit`);
  else if (wind >= LIMITS.wind.caution) flag('CAUTION', `Wind ${wind} m/s${where} — expect drift, shorter battery`);

  if (c.gust >= LIMITS.gust.noGo) flag('NO-GO', `Gusts ${c.gust} m/s can overpower the drone`);
  else if (c.gust >= LIMITS.gust.caution) flag('CAUTION', `Gusts up to ${c.gust} m/s`);

  if (c.rain >= LIMITS.rain.noGo) flag('NO-GO', `Heavy rain ${c.rain} mm/h`);
  else if (c.rain >= LIMITS.rain.caution) flag('CAUTION', `Light rain ${c.rain} mm/h — protect the electronics`);
  else if (c.rainChance >= LIMITS.rainChance.caution) flag('CAUTION', `${c.rainChance}% chance of rain this hour`);

  if (c.visibility != null) {
    if (c.visibility < LIMITS.visibility.noGo) flag('NO-GO', `Visibility ${formatDistance(c.visibility)} — no line of sight`);
    else if (c.visibility < LIMITS.visibility.caution) flag('CAUTION', `Reduced visibility ${formatDistance(c.visibility)}`);
  }

  if (c.temp != null && (c.temp < LIMITS.temp.low || c.temp > LIMITS.temp.high)) {
    flag('CAUTION', `Temperature ${c.temp} °C reduces battery performance`);
  }

  reasons.sort((a, b) => RANK[b.level] - RANK[a.level]);
  const verdict = reasons[0]?.level ?? 'GO';
  if (verdict === 'GO') reasons.push({ level: 'GO', text: 'Conditions are within flight limits' });
  return { verdict, reasons };
}

const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

const VARS = 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_80m,visibility,cloud_cover';

export function forecastUrl({ lat, lon, hours = 6 }) {
  const q = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: VARS,
    hourly: `${VARS},precipitation_probability`,
    wind_speed_unit: 'ms',
    timezone: 'auto',
    forecast_hours: hours,
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

function conditionsAt(block, i) {
  const pick = (key) => (i == null ? block[key] : block[key]?.[i]);
  return {
    temp: round1(pick('temperature_2m')),
    rain: round1(pick('precipitation')),
    weatherCode: pick('weather_code') ?? null,
    wind: round1(pick('wind_speed_10m')),
    windAloft: round1(pick('wind_speed_80m')),
    windDirection: pick('wind_direction_10m') ?? null,
    gust: round1(pick('wind_gusts_10m')),
    visibility: pick('visibility') ?? null,
    cloudCover: pick('cloud_cover') ?? null,
    rainChance: pick('precipitation_probability') ?? null,
  };
}

// Open-Meteo response → { current, hours: [...], assessment } with each hour assessed too
export function toFlightWeather(body) {
  const current = conditionsAt(body.current);
  // Current block has no rain probability; borrow the first forecast hour's
  current.rainChance = body.hourly?.precipitation_probability?.[0] ?? null;

  const hours = (body.hourly?.time ?? []).map((time, i) => {
    const c = conditionsAt(body.hourly, i);
    const { verdict, reasons } = assessFlight(c);
    // Worst reason, so the outlook can say why an hour isn't GO
    return { time, ...c, verdict, reason: verdict === 'GO' ? null : reasons[0].text };
  });

  return {
    time: body.current.time,
    timezone: body.timezone,
    elevation: body.elevation ?? null,
    current,
    assessment: assessFlight(current),
    hours,
  };
}

export async function fetchFlightWeather({ lat, lon, fetchImpl = fetch }) {
  const res = await fetchImpl(forecastUrl({ lat, lon }));
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
  return toFlightWeather(await res.json());
}
