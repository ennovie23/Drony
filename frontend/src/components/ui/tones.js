// Fire-model words that utils/status.js toneOf() doesn't know about.
export const SEVERITY_TONE = { MINOR: 'ok', MODERATE: 'warn', SEVERE: 'danger', LOW: 'ok' };
export const BEHAVIOR_TONE = { DECLINING: 'ok', STABLE: 'warn', GROWING: 'danger' };

export function toneFor(map, word) {
    if (!word) return 'off';
    return map[String(word).toUpperCase()] ?? map[word] ?? 'off';
}
