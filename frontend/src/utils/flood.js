import { jsnSpec } from '../data/mock';

// Ultrasonic round trip: sound covers ~1 cm in 29 µs each way, so echo ≈ distance × 58 µs.
export function echoMicros(distanceCm) {
    return Math.round(distanceCm * 58);
}

// Whether a JSN-SR04T distance is inside the sensor's usable range.
export function readingStatus(distanceCm) {
    if (distanceCm == null) return 'NO DATA';
    if (distanceCm < jsnSpec.minCm) return 'BLIND ZONE';
    if (distanceCm > jsnSpec.maxCm) return 'OUT OF RANGE';
    return 'VALID';
}

// Change between the last two history samples (cm per sample interval), e.g. -1.
export function distanceChange(module) {
    const h = module.history;
    return h.length > 1 ? h[h.length - 1] - h[h.length - 2] : 0;
}

export function formatChange(cm) {
    return `${cm > 0 ? '+' : ''}${cm} cm`;
}

// Modules floating on the water and sending readings.
export function reportingSensors(modules) {
    return modules.filter((m) => m.status === 'DEPLOYED');
}
