// Mappers between the backend's ML payloads and the shapes the Fire page renders.

// Confidence may arrive as a 0–1 fraction or a 0–100 percent; render as "85.2".
export const formatPercent = (val) => {
    if (val === null || val === undefined) return null;
    const num = Number(val);
    if (isNaN(num)) return null;
    const pct = num <= 1 && num > 0 ? num * 100 : num;
    return pct.toFixed(1);
};

const formatSlope = (val) => (val != null ? Number(val).toFixed(2) : null);

// A webcam snapshot entry from GET /api/snapshots → the snapshot shape used by the
// strip, MlFrame and the detections table (same fields as the mock snapshots).
export function toUiSnapshot(entry) {
    const a = entry.assessment ?? {};
    return {
        id: entry.id,
        frame: entry.frame,
        capturedAt: entry.capturedAt,
        imageUrl: entry.imageUrl,
        trigger: entry.trigger,
        detections: (a.boxes ?? []).map((b) => ({
            id: b.id,
            label: b.label,
            confidence: b.confidence,
            box: { x: b.bboxX1, y: b.bboxY1, w: b.bboxX2 - b.bboxX1, h: b.bboxY2 - b.bboxY1 },
        })),
        fireConfidence: a.fireConfidence ?? 0,
        severity: a.fireSeverity?.toUpperCase() ?? null,
        behavior: a.fireTrend ?? a.smokeTrend ?? null,
        smoke: { detected: Boolean(a.smokeDetected), confidence: (a.smokeConfidence ?? 0) / 100 },
        assessment: a,
    };
}

// Either the /api/detections/latest response (nested fire/smoke) or a raw frame
// assessment (flat fire*/smoke* fields) → the "Model result" card's view model.
export function toModelResult(d) {
    const fire = d.fire !== undefined
        ? d.fire
        : d.fireDetected
            ? { confidence: d.fireConfidence, severity: d.fireSeverity, severityConf: d.fireSeverityConf, trend: d.fireTrend, trendSlope: d.fireTrendSlope }
            : null;
    const smoke = d.smoke !== undefined
        ? d.smoke
        : d.smokeDetected
            ? { confidence: d.smokeConfidence, trend: d.smokeTrend, trendSlope: d.smokeTrendSlope }
            : null;

    return {
        timestamp: d.timestampPHT || d.timestamp,
        primaryHazard: d.primaryHazard ?? (fire ? 'fire' : smoke ? 'smoke' : null),
        threatScore: d.threatScore ?? 0,
        fire: fire
            ? { ...fire, confidence: formatPercent(fire.confidence), severityConf: formatPercent(fire.severityConf), trendSlope: formatSlope(fire.trendSlope) }
            : null,
        smoke: smoke
            ? { ...smoke, confidence: formatPercent(smoke.confidence), trendSlope: formatSlope(smoke.trendSlope) }
            : null,
    };
}

// Boxes of the newest snapshot; none while the list is still loading or was cleared.
export const latestDetections = (snapshots) => snapshots[0]?.detections ?? [];
