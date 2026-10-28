// detect.py posts every analysed frame (several a second). Saving each one fills the
// database with near-identical rows, so a frame is only saved when:
//   - what it shows changed (fire or smoke appeared/cleared, severity changed,
//     threat score moved into another band) and the change held for `settleMs`
//     (a score flickering across a band edge every second isn't a change), or
//   - `intervalMs` passed since the last saved frame (a "still the same" row).
// The live view doesn't depend on this; it always gets the newest frame.
export const DEFAULT_SAVE_INTERVAL_MS = 5000;
export const DEFAULT_SETTLE_MS = 2000;

// Same bands as the dashboard's threat chip: 0–40 low, 41–75 elevated, 76+ critical
const threatBand = (score) => (score > 75 ? 2 : score > 40 ? 1 : 0);

export function assessmentKey(a) {
  return [
    Boolean(a.fireDetected),
    Boolean(a.smokeDetected),
    a.fireDetected ? a.fireSeverity ?? null : null,
    threatBand(a.threatScore ?? 0),
  ].join('|');
}

export function createSaveThrottle({ intervalMs = DEFAULT_SAVE_INTERVAL_MS, settleMs = DEFAULT_SETTLE_MS, now = Date.now } = {}) {
  let last = null;    // last saved: { key, at }
  let current = null; // what frames show now and since when: { key, since }

  return {
    // Whether this frame should be saved; if so it becomes the new "last saved"
    take(assessment) {
      const key = assessmentKey(assessment);
      const t = now();
      if (current?.key !== key) current = { key, since: t };
      const changed = last && key !== last.key && t - current.since >= settleMs;
      if (last && !changed && t - last.at < intervalMs) return false;
      last = { key, at: t };
      return true;
    },
    // A save that failed shouldn't hold back the next attempt
    forget() {
      last = null;
    },
  };
}
