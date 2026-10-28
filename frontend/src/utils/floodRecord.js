import { floodHeight } from './floodSensor.js';

// A plain USB ultrasonic sensor streams several readings a second; one per this
// interval is kept. Node packets (every ~10 s) are all kept.
export const SERIAL_SAVE_MS = 5_000;

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// A reading from useFloodSensor + the mount settings at that moment → the body
// for POST /api/flood/readings
export function toFloodRecord(item, settings) {
    const plain = item.source === 'serial';
    return {
        recordedAt: new Date(item.timestamp).toISOString(),
        nodeId: plain ? 'USB' : item.node,
        seq: plain ? null : item.seq,
        source: item.source,
        distanceCm: item.distanceCm,
        heightCm: round1(floodHeight(item.distanceCm, settings)),
        mount: settings.mount,
        medium: settings.medium,
        probeDepthCm: settings.probeDepthCm,
        referenceCm: settings.referenceCm,
        rssi: item.rssi ?? null,
        snr: item.snr ?? null,
        lost: item.lost ?? null,
        gpsFix: item.gps?.fix ?? false,
        latitude: item.gps?.lat ?? null,
        longitude: item.gps?.lng ?? null,
        satellites: item.gps?.satellites ?? null,
    };
}

// Whether to save this reading, given when the last plain-serial one was saved
export function shouldSave(item, lastSerialSavedAt) {
    if (item.source !== 'serial') return true;
    return lastSerialSavedAt == null || item.timestamp - lastSerialSavedAt >= SERIAL_SAVE_MS;
}
