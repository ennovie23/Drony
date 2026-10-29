// Helpers for the History page: filtering, paging and CSV export of the fire + flood
// incidents from GET /api/history.

const PHT = 'Asia/Manila';

// "2026-10-28" in Philippine time, matching an <input type="date"> value
export const phtDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: PHT });
const phtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { timeZone: PHT, hour12: false }) : '');

export const isActive = (r) => r.status === 'active';

export const hazardLabel = (type) => (type === 'flood' ? 'Flood' : 'Fire');

// 0 → "<1 min", 3_296_000 → "54 min", 9_000_000 → "2 h 30 min"
export function formatDuration(ms) {
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return '<1 min';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}

// filters: { date: 'YYYY-MM-DD' | '', hazard: 'all' | 'fire' | 'flood', status: 'all' | 'active' | 'resolved' }.
// An incident matches a date when it was ongoing at any point that day.
export function filterHistory(incidents, { date = '', hazard = 'all', status = 'all' } = {}) {
    return incidents.filter((r) =>
        (hazard === 'all' || r.hazardType === hazard) &&
        (status === 'all' || r.status === status) &&
        (!date || (phtDay(r.startedAt) <= date && date <= phtDay(r.endedAt))));
}

// One page of rows plus the numbers the pager shows; `page` is clamped into range
export function paginate(rows, page, pageSize) {
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const current = Math.min(Math.max(1, page), pageCount);
    const start = (current - 1) * pageSize;
    return {
        rows: rows.slice(start, start + pageSize),
        page: current,
        pageCount,
        from: rows.length ? start + 1 : 0,
        to: Math.min(start + pageSize, rows.length),
    };
}

// A small, cropped rendition of a Cloudinary image for table rows
export function cloudinaryThumb(url, { width = 120, height = 68 } = {}) {
    if (!url?.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
    return url.replace('/upload/', `/upload/c_fill,w_${width},h_${height},q_auto,f_auto/`);
}

// Only full https links, so image columns work outside this machine
const httpsOnly = (url) => (url?.startsWith('https://') ? url : '');

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = (columns, rows) => [
    columns.map(([h]) => esc(h)).join(','),
    ...rows.map((r) => columns.map(([, get]) => esc(get(r))).join(',')),
].join('\n');

const INCIDENT_COLUMNS = [
    ['Incident ID', (r) => r.id],
    ['Hazard Type', (r) => hazardLabel(r.hazardType)],
    ['Started (ISO)', (r) => r.startedAt],
    ['Ended (ISO)', (r) => r.endedAt],
    ['Date (PHT)', (r) => phtDay(r.startedAt)],
    ['Start Time (PHT)', (r) => phtTime(r.startedAt)],
    ['End Time (PHT)', (r) => phtTime(r.endedAt)],
    ['Duration (min)', (r) => Math.round(r.durationMs / 6000) / 10],
    ['Status', (r) => (isActive(r) ? 'Active' : 'Not active')],
    ['Cleared At (ISO)', (r) => r.clearedAt],
    ['Peak Severity', (r) => r.severity],
    ['Peak Fire Confidence (%)', (r) => r.fireConfidence],
    ['Peak Smoke Confidence (%)', (r) => r.smokeConfidence],
    ['Peak Threat Score', (r) => r.threatScore],
    ['Peak Water Height (cm)', (r) => r.heightCm],
    ['Node', (r) => r.nodeId],
    ['Latitude', (r) => r.location?.latitude],
    ['Longitude', (r) => r.location?.longitude],
    ['Frames / Readings', (r) => r.frameCount],
    ['Snapshots', (r) => r.snapshotCount],
    ['Image URL', (r) => httpsOnly(r.imageUrl)],
    ['Snapshot URLs', (r) => (r.snapshots ?? []).map((s) => httpsOnly(s.imageUrl)).filter(Boolean).join(' ')],
];

// The history report: one line per incident
export const toCSV = (incidents) => csv(INCIDENT_COLUMNS, incidents);

const FRAME_COLUMNS = [
    ['Incident ID', (f) => f.incident.id],
    ['Hazard Type', (f) => hazardLabel(f.incident.hazardType)],
    ['Frame ID', (f) => f.id],
    ['Captured (ISO)', (f) => f.capturedAt],
    ['Date (PHT)', (f) => phtDay(f.capturedAt)],
    ['Time (PHT)', (f) => phtTime(f.capturedAt)],
    ['Severity', (f) => f.severity],
    ['Fire Confidence (%)', (f) => f.fireConfidence],
    ['Smoke Confidence (%)', (f) => f.smokeConfidence],
    ['Threat Score', (f) => f.threatScore],
    ['Water Height (cm)', (f) => f.heightCm],
    ['Node', (f) => f.nodeId],
    ['Trigger', (f) => (f.snapshotId ? f.trigger ?? 'auto' : '')],
    ['Image URL', (f) => httpsOnly(f.imageUrl)],
];

// Every frame/reading of the given incidents (fetched with ?frames=1), oldest first per incident
export const toFramesCSV = (incidents) =>
    csv(FRAME_COLUMNS, incidents.flatMap((incident) => (incident.frames ?? []).map((f) => ({ ...f, incident }))));
