// Maps backend-style status words onto a colour tone.
const TONES = {
    ok: ['ACTIVE', 'CONNECTED', 'GOOD', 'FIXED', 'AIRBORNE', 'STREAMING', 'DEPLOYED', 'READY', 'LOCKED', 'IDLE', 'LOW', 'VALID'],
    warn: ['WEAK', 'DEPLOYING', 'PLANNED', 'STANDBY', 'MODERATE', 'DOCKED', 'RISING', 'GROWING'],
    danger: ['OFFLINE', 'LOST', 'NO FIX', 'NONE', 'HIGH', 'CRITICAL', 'BLIND ZONE', 'OUT OF RANGE'],
};

export function toneOf(value) {
    const word = String(value).toUpperCase();
    return Object.keys(TONES).find((tone) => TONES[tone].includes(word)) ?? 'off';
}
