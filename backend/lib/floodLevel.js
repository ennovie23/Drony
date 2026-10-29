// Water height bands for flood readings. A reading at or above ALERT_CM is a flood
// hazard; it stays active until the same node reports a height below ALERT_CM.
export const ALERT_CM = 50;
const BANDS = [
  { minCm: 150, severity: 'Severe' },
  { minCm: 100, severity: 'Moderate' },
  { minCm: ALERT_CM, severity: 'Minor' },
];

export const isFloodHazard = (heightCm) => Number.isFinite(heightCm) && heightCm >= ALERT_CM;

// "Minor" / "Moderate" / "Severe", or null below the alert level
export const floodSeverity = (heightCm) =>
  (Number.isFinite(heightCm) && BANDS.find((b) => heightCm >= b.minCm)?.severity) || null;
