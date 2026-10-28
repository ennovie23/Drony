// Flood-height maths and the system check for the live flood sensor (see floodSerial.js).
//
// The sensor always sends "air-calibrated" distances (echo time × 343 m/s ÷ 2), so
// switching between a desk test (air) and the field (water) needs no reflash.
//   Floating: probe just under the surface pointing down at the ground
//             → flood height = distance through water + probe depth
//   Fixed:    probe mounted above the water pointing down
//             → flood height = reference height − distance

export const AIR_SPEED = 343;
export const WATER_SPEED = 1480; // m/s, fresh water ~20 °C
// Older flood_node.ino builds converted to water themselves and said medium "water"
const OLD_FIRMWARE_FACTOR = 0.148 / 0.0343;

// The flood sensor sends every ~10 s, so allow two missed packets; the ground
// station beats every 2 s; a plain USB sensor streams several times a second.
export const NODE_STALE_MS = 25_000;
export const STATION_STALE_MS = 6_000;
export const SERIAL_STALE_MS = 3_000;

export const DEFAULT_SETTINGS = { mount: 'float', medium: 'water', probeDepthCm: 0, referenceCm: 100 };

// Undo an old firmware's own water conversion, so every distance is air-calibrated
export function toAirCalibrated(item) {
    if (item.medium !== 'water' || item.distanceCm == null) return item;
    return { ...item, distanceCm: item.distanceCm / OLD_FIRMWARE_FACTOR, medium: 'air' };
}

// Air-calibrated distance → distance through what the sound actually travelled in
export function trueDistance(distanceCm, settings) {
    if (distanceCm == null) return null;
    const throughWater = settings.mount === 'float' && settings.medium === 'water';
    return throughWater ? (distanceCm * WATER_SPEED) / AIR_SPEED : distanceCm;
}

export function floodHeight(distanceCm, settings) {
    const d = trueDistance(distanceCm, settings);
    if (d == null) return null;
    return settings.mount === 'float' ? d + settings.probeDepthCm : settings.referenceCm - d;
}

export function staleAfter(item) {
    return item?.source === 'serial' ? SERIAL_STALE_MS : NODE_STALE_MS;
}

// Change over about the last minute. Needs 30 s of history, or noise looks like a big rate.
export function floodTrend(points) {
    if (points.length < 2) return null;
    const last = points[points.length - 1];
    const past = points.filter((p) => p.timestamp <= last.timestamp - 55_000).at(-1) ?? points[0];
    const minutes = (last.timestamp - past.timestamp) / 60_000;
    if (minutes < 0.5) return null;
    const ratePerMin = (last.heightCm - past.heightCm) / minutes;
    if (Math.abs(ratePerMin) < 0.5) return { direction: 'STEADY', ratePerMin };
    return { direction: ratePerMin > 0 ? 'RISING' : 'FALLING', ratePerMin };
}

export function signalQuality(rssi) {
    if (rssi == null) return null;
    if (rssi > -90) return 'Excellent';
    if (rssi > -105) return 'Good';
    if (rssi > -115) return 'Weak';
    return 'Very weak';
}

const secs = (ms) => `${Math.max(0, Math.round(ms / 1000))} s`;
const row = (label, tone, detail) => ({ label, tone, detail });

// Four plain-language rows (ground station, radio link, depth sensor, GPS) and one
// verdict line. tone: 'ok' | 'warn' | 'danger' | 'off' (not known yet).
export function sensorHealth({ status, station, last, now, connectedAt }) {
    const connected = status === 'connected';
    const sinceConnect = connected && connectedAt != null ? now - connectedAt : 0;
    const age = last ? now - last.timestamp : null;
    const live = connected && last && age < staleAfter(last);
    const stationLive = connected && station && now - station.timestamp < STATION_STALE_MS;
    const plainSerial = last?.source === 'serial';
    const viaUsb = last?.source === 'usb';

    if (!connected) {
        return {
            verdict: { tone: 'off', text: 'Plug in the ground station and click Connect.' },
            rows: ['Ground station', 'Radio link', 'Depth sensor', 'GPS'].map((label) => row(label, 'off', '—')),
        };
    }

    let ground;
    if (plainSerial || viaUsb) ground = row('Ground station', 'off', 'Not used: sensor is plugged in directly');
    else if (stationLive) {
        ground = station.ready
            ? row('Ground station', 'ok', `Running · ${station.frequencyMHz} MHz`)
            : row('Ground station', 'danger', 'Its radio didn’t start. Check the Ra-02 wiring and 3.3 V');
    } else if (station) ground = row('Ground station', 'danger', `No status for ${secs(now - station.timestamp)}. Board reset or unplugged`);
    else if (sinceConnect > STATION_STALE_MS) ground = row('Ground station', 'danger', 'No data. Wrong COM port, or ground_station.ino isn’t uploaded');
    else ground = row('Ground station', 'off', 'Waiting for its first status…');

    let link;
    if (plainSerial) link = row('Radio link', 'off', 'Not used: plain USB sensor');
    else if (viaUsb) {
        link = !last.lora.ready
            ? row('Radio link', 'danger', 'Flood sensor’s radio didn’t start')
            : last.lora.ackOk
              ? row('Radio link', 'ok', `Ground station answers (${last.lora.acked}/${last.lora.sent})`)
              : row('Radio link', 'warn', 'Nothing answers. Ground station off or out of range');
    } else if (live) link = row('Radio link', 'ok', `${signalQuality(last.rssi)} · ${last.rssi} dBm`);
    else if (last) link = row('Radio link', 'danger', `Flood sensor silent for ${secs(age)}`);
    else if (station?.ready && sinceConnect > NODE_STALE_MS) link = row('Radio link', 'danger', `Nothing heard in ${secs(sinceConnect)}. Check the sensor’s power and antenna`);
    else link = row('Radio link', 'off', 'Listening (sensor sends every ~10 s)…');

    let depth;
    if (!last) depth = row('Depth sensor', 'off', '—');
    else if (last.distanceCm == null) depth = row('Depth sensor', 'danger', 'No echo. Check wiring, or water may be under ~1 m');
    else depth = row('Depth sensor', live ? 'ok' : 'off', live ? 'Getting echoes' : 'No recent reading');

    let gps;
    if (!last || plainSerial) gps = row('GPS', 'off', plainSerial ? 'Not on this sensor' : '—');
    else if (last.gps.chars === 0) gps = row('GPS', 'danger', 'No data. Check the GPS wiring');
    else if (last.gps.fix) gps = row('GPS', 'ok', `${last.gps.lat.toFixed(5)}, ${last.gps.lng.toFixed(5)}`);
    else gps = row('GPS', 'warn', `No fix yet (${last.gps.satellites} satellites). Needs open sky`);

    const rows = [ground, link, depth, gps];
    const problem = rows.find((r) => r.tone === 'danger');
    let verdict;
    if (problem) verdict = { tone: 'danger', text: `Check the ${problem.label.toLowerCase()}` };
    else if (rows.some((r) => r.tone === 'warn')) verdict = { tone: 'warn', text: 'Working, with warnings' };
    else if (live) verdict = { tone: 'ok', text: 'Everything is working' };
    else verdict = { tone: 'off', text: 'Waiting for data…' };
    return { verdict, rows };
}

// Latest GPS fix of each flood sensor, newest first. A fix stays as the last known
// position after the GPS loses it; `current` says whether the sensor's newest packet
// still has one.
export function sensorPositions(readings) {
    const byNode = new Map();
    for (const r of readings) {
        if (!r.node || !r.gps) continue;
        const prev = byNode.get(r.node);
        const fix = r.gps.fix ? { lat: r.gps.lat, lng: r.gps.lng, satellites: r.gps.satellites, timestamp: r.timestamp } : prev?.fix ?? null;
        byNode.set(r.node, { node: r.node, fix, current: r.gps.fix, satellites: r.gps.satellites, lastHeard: r.timestamp });
    }
    return [...byNode.values()].sort((a, b) => b.lastHeard - a.lastHeard);
}

// OpenStreetMap embed centred on a point, about 400 m across, with a marker on it.
// Rounded to ~10 m so GPS jitter doesn't reload the map on every packet.
export function mapEmbedUrl(lat, lng, span = 0.002) {
    const la = lat.toFixed(4);
    const lo = lng.toFixed(4);
    const bbox = [lng - span, lat - span, lng + span, lat + span].map((v) => v.toFixed(4)).join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${la},${lo}`;
}
