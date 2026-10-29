import { ALERT_CM, floodSeverity, isFloodHazard } from './floodLevel.js';

// Turns FrameAssessment rows and FloodReading rows into hazard incidents for the History
// page: one entry per continuous fire/smoke episode or per stretch of flood water above
// the alert level, instead of one per saved frame.

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const validDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());
const httpsUrl = (url) => (typeof url === 'string' && url.startsWith('https://') ? url : null);
const iso = (d) => (validDate(d) ? d.toISOString() : null);
const round2 = (v) => Math.round(v * 100) / 100;

// Fire or smoke confidence as a 0–100 percent (the detector sends percents)
const percent = (v) => (isNum(v) && v > 0 && v <= 100 ? round2(v) : null);

const SEVERITY_RANK = { Minor: 1, Moderate: 2, Severe: 3 };
const worse = (a, b) => ((SEVERITY_RANK[b] ?? 0) > (SEVERITY_RANK[a] ?? 0) ? b : a);
const maxOf = (a, b) => (b == null ? a : a == null ? b : Math.max(a, b));

// A fire episode survives clear frames shorter than this (detector flicker) …
export const CLEAR_GRACE_MS = 30_000;
// … and ends when no frames arrive for this long (detector stopped)
export const GAP_MS = 120_000;
// FrameAssessment.trigger of the marker row written when detection is stopped
export const STOP_TRIGGER = 'stop';
// Timeline points sent per incident; longer incidents are evenly sampled
const TIMELINE_POINTS = 120;

// One FrameAssessment row → a frame, or null for rows that can't be shown meaningfully.
// A row that claims fire/smoke but has no confidence and no severity is anomalous.
export function toFireFrame(row) {
  if (!row || !validDate(row.timestamp)) return null;
  const fireConfidence = percent(row.fireConfidence);
  const smokeConfidence = percent(row.smokeConfidence);
  const severity = typeof row.fireSeverity === 'string' && row.fireSeverity.trim() ? row.fireSeverity.trim() : null;
  const hazard = Boolean(row.fireDetected || row.smokeDetected);
  if (hazard && fireConfidence == null && smokeConfidence == null && !severity) return null;
  return {
    id: row.id,
    capturedAt: row.timestamp,
    hazard,
    fireConfidence,
    smokeConfidence,
    severity: hazard ? severity : null,
    threatScore: isNum(row.threatScore) ? row.threatScore : null,
    resolvedAt: validDate(row.resolvedAt) ? row.resolvedAt : null,
    snapshotId: row.snapshotId ?? null,
    imageUrl: httpsUrl(row.imageUrl),
    trigger: row.trigger ?? null,
  };
}

export function toFloodFrame(row) {
  if (!row || !validDate(row.recordedAt)) return null;
  // No echo (or a nonsense height) means there is no water level to report
  if (!isNum(row.heightCm) || row.heightCm < 0 || row.heightCm > 1000) return null;
  return {
    id: row.id,
    capturedAt: row.recordedAt,
    nodeId: row.nodeId,
    source: row.source,
    heightCm: Math.round(row.heightCm * 10) / 10,
    resolvedAt: validDate(row.resolvedAt) ? row.resolvedAt : null,
    location: row.gpsFix && isNum(row.latitude) && isNum(row.longitude)
      ? { latitude: row.latitude, longitude: row.longitude }
      : null,
  };
}

function sample(items, n = TIMELINE_POINTS) {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]);
}

const serializeFrame = (f) => ({ ...f, capturedAt: iso(f.capturedAt), resolvedAt: iso(f.resolvedAt) });

function finishFire(frames, { clearedAt, open }, { withFrames }) {
  const first = frames[0];
  const last = frames.at(-1);
  let severity = null, fire = null, smoke = null, threat = null;
  for (const f of frames) {
    severity = worse(severity, f.severity);
    fire = maxOf(fire, f.fireConfidence);
    smoke = maxOf(smoke, f.smokeConfidence);
    threat = maxOf(threat, f.threatScore);
  }
  const snapshots = frames
    .filter((f) => f.snapshotId)
    .map((f) => ({
      id: f.id,
      snapshotId: f.snapshotId,
      capturedAt: iso(f.capturedAt),
      imageUrl: f.imageUrl,
      confidence: f.fireConfidence ?? f.smokeConfidence,
      severity: f.severity,
      trigger: f.trigger ?? 'auto',
    }));
  // The clearest picture of the incident: the snapshot the model was most sure about
  const cover = snapshots.filter((s) => s.imageUrl).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null;
  // Still showing in the video and not resolved by hand
  const active = open && frames.some((f) => !f.resolvedAt);
  return {
    id: `fire-${first.id}`,
    hazardType: 'fire',
    startedAt: iso(first.capturedAt),
    endedAt: iso(last.capturedAt),
    clearedAt: iso(clearedAt),
    durationMs: last.capturedAt - first.capturedAt,
    status: active ? 'active' : 'resolved',
    severity,
    confidence: fire ?? smoke,
    fireConfidence: fire,
    smokeConfidence: smoke,
    smokeSeen: smoke != null,
    threatScore: threat,
    frameCount: frames.length,
    snapshotCount: snapshots.length,
    manualCount: snapshots.filter((s) => s.trigger === 'manual').length,
    imageUrl: cover?.imageUrl ?? null,
    snapshots,
    timeline: sample(frames).map((f) => ({ t: iso(f.capturedAt), fire: f.fireConfidence ?? 0, smoke: f.smokeConfidence ?? 0 })),
    ...(withFrames ? { frames: frames.map(serializeFrame) } : {}),
  };
}

// rows: FrameAssessment rows in any order → fire incidents, oldest first
export function groupFireIncidents(rows, { now = Date.now(), graceMs = CLEAR_GRACE_MS, gapMs = GAP_MS, withFrames = false } = {}) {
  const frames = rows.map(toFireFrame).filter(Boolean).sort((a, b) => a.capturedAt - b.capturedAt);
  const incidents = [];
  let current = null; // { frames, firstClearAt }
  let lastSeen = null;

  const close = (open = false) => {
    incidents.push(finishFire(current.frames, { clearedAt: current.firstClearAt, open }, { withFrames }));
    current = null;
  };

  for (const f of frames) {
    const t = f.capturedAt.getTime();
    if (current && lastSeen != null && t - lastSeen > gapMs) close();
    // The operator stopped detection (routes/detector.js): the incident ends here
    if (f.trigger === STOP_TRIGGER) {
      if (current) {
        current.firstClearAt ??= f.capturedAt;
        close();
      }
      lastSeen = t;
      continue;
    }
    if (f.hazard) {
      if (current?.firstClearAt && t - current.firstClearAt.getTime() > graceMs) close();
      current ??= { frames: [], firstClearAt: null };
      current.frames.push(f);
      current.firstClearAt = null;
    } else if (current) {
      current.firstClearAt ??= f.capturedAt;
      if (t - current.firstClearAt.getTime() > graceMs) close();
    }
    lastSeen = t;
  }
  if (current) {
    // Open at the end of the data: active only while the detector is still sending frames
    // and the video hasn't been clear for longer than the grace period
    const live = now - lastSeen <= gapMs && !(current.firstClearAt && now - current.firstClearAt.getTime() > graceMs);
    close(live);
  }
  return incidents;
}

function finishFlood(frames, { clearedAt, open }, { withFrames }) {
  const first = frames[0];
  const last = frames.at(-1);
  const peak = frames.reduce((p, f) => (f.heightCm > p.heightCm ? f : p), first);
  return {
    id: `flood-${first.id}`,
    hazardType: 'flood',
    startedAt: iso(first.capturedAt),
    endedAt: iso(last.capturedAt),
    clearedAt: iso(clearedAt),
    durationMs: last.capturedAt - first.capturedAt,
    status: open && frames.some((f) => !f.resolvedAt) ? 'active' : 'resolved',
    severity: floodSeverity(peak.heightCm),
    confidence: null,
    heightCm: peak.heightCm,
    nodeId: first.nodeId,
    source: first.source,
    location: peak.location ?? first.location,
    frameCount: frames.length,
    snapshotCount: 0,
    imageUrl: null,
    snapshots: [],
    timeline: sample(frames).map((f) => ({ t: iso(f.capturedAt), heightCm: f.heightCm })),
    ...(withFrames ? { frames: frames.map(serializeFrame) } : {}),
  };
}

// rows: FloodReading rows → flood incidents per node: a run of readings at or above the
// alert level, ended by the node's first reading below it.
export function groupFloodIncidents(rows, { withFrames = false } = {}) {
  const byNode = new Map();
  for (const f of rows.map(toFloodFrame).filter(Boolean)) {
    if (!byNode.has(f.nodeId)) byNode.set(f.nodeId, []);
    byNode.get(f.nodeId).push(f);
  }
  const incidents = [];
  for (const readings of byNode.values()) {
    readings.sort((a, b) => a.capturedAt - b.capturedAt);
    let run = null;
    for (const f of readings) {
      if (isFloodHazard(f.heightCm)) (run ??= []).push(f);
      else if (run) {
        incidents.push(finishFlood(run, { clearedAt: f.capturedAt, open: false }, { withFrames }));
        run = null;
      }
    }
    if (run) incidents.push(finishFlood(run, { clearedAt: null, open: true }, { withFrames }));
  }
  return incidents;
}

// Both hazards, newest incident first
export function buildIncidents({ fireRows = [], floodRows = [], now, withFrames = false }) {
  return [...groupFireIncidents(fireRows, { now, withFrames }), ...groupFloodIncidents(floodRows, { withFrames })]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export { ALERT_CM };
