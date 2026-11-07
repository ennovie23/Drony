// Tones follow the PAGASA warning ladder: 'caution' (yellow) → 'warn' (orange) → 'danger' (red).
// 'ok' is green, 'off' is grey (not known / not running).

// Fire-model words that utils/status.js toneOf() doesn't know about.
export const SEVERITY_TONE = { LOW: 'caution', MINOR: 'caution', MODERATE: 'warn', SEVERE: 'danger' };
export const BEHAVIOR_TONE = {
    DECLINING: 'ok',
    DIMINISHING: 'ok',
    DISPERSING: 'ok',
    STABLE: 'caution',
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

// Threat fusion score (0–100) → tone: above 75 is critical, above 40 elevated.
export const THREAT_BANDS = [
    { from: 40, tone: 'warn', label: 'Elevated' },
    { from: 75, tone: 'danger', label: 'Critical' },
];

export function threatTone(score) {
    if (score > 75) return 'danger';
    if (score > 40) return 'warn';
    return 'ok';
}

export function threatLabel(score) {
    if (score > 75) return 'Critical';
    if (score > 40) return 'Elevated';
    return 'Low';
}

// Flood water height bands (cm), shared by the Flood page, the sidebar and History.
export const FLOOD_LEVELS = [
    { label: 'Minor', value: 50, tone: 'caution', color: 'var(--yellow)', labelColor: 'var(--yellow-text)' },
    { label: 'Moderate', value: 100, tone: 'warn', color: 'var(--orange)', labelColor: 'var(--orange-text)' },
    { label: 'Severe', value: 150, tone: 'danger', color: 'var(--red)', labelColor: 'var(--red-text)' },
];

// 112 → { label: 'Moderate', tone: 'warn', next: { label: 'Severe', value: 150, … } }
export function floodLevel(heightCm) {
    if (heightCm == null) return { label: '—', tone: 'off', next: null };
    const reached = FLOOD_LEVELS.filter((l) => heightCm >= l.value).at(-1);
    const next = FLOOD_LEVELS.find((l) => heightCm < l.value) ?? null;
    return reached ? { label: reached.label, tone: reached.tone, next } : { label: 'Normal', tone: 'ok', next };
}
