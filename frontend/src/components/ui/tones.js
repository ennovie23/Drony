// Fire-model words that utils/status.js toneOf() doesn't know about.
export const SEVERITY_TONE = { MINOR: 'ok', MODERATE: 'warn', SEVERE: 'danger'};
export const BEHAVIOR_TONE = {
    DECLINING: 'ok',
    DIMINISHING: 'ok',
    DISPERSING: 'ok',
    STABLE: 'warn',
    GROWING: 'danger',
    EXPANDING: 'danger',
    MONITORING: 'neutral',
    STANDBY: 'neutral',
    'CLEAR AIR': 'ok'
};

export function toneFor(map, word) {
    if (!word) return 'off';
    return map[String(word).toUpperCase()] ?? map[word] ?? 'off';
}
