// Fire-model words that utils/status.js toneOf() doesn't know about.
export const SEVERITY_TONE = { LOW: 'ok', MODERATE: 'warn', SEVERE: 'danger' };
export const BEHAVIOR_TONE = { DECLINING: 'ok', STABLE: 'warn', GROWING: 'danger' };

export function toneFor(map, word) {
    return map[word] ?? 'off';
}
