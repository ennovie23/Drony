import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import {
    Download, Trash2, RotateCcw, RefreshCw, Flame, Waves, ImageOff, FileSpreadsheet,
    ChevronLeft, ChevronRight, ChevronDown, CheckCircle2,
} from 'lucide-react';
import styles from './History.module.css';
import table from '../components/ui/Table.module.css';
import TopBar from '../components/shared/TopBar';
import LineChart from '../components/shared/LineChart';
import ImagePreview from '../components/shared/ImagePreview';
import { Card, Chip, Button, Modal } from '../components/ui';
import { useAppData } from '../context/AppDataContext';
import { formatTime, formatDate } from '../utils/format';
import { formatStatus } from '../components/ui/format';
import { SEVERITY_TONE, toneFor } from '../components/ui/tones';
import {
    filterHistory, paginate, cloudinaryThumb, toCSV, toFramesCSV, hazardLabel, isActive, formatDuration,
} from '../utils/history';
import { API_BASE_URL } from '../config';

const PAGE_SIZES = [10, 25, 50];
const NO_FILTERS = { date: '', hazard: 'all', status: 'all' };
// Snapshots shown in an expanded incident before "Show more"
const GALLERY_STEP = 24;
const FLOOD_LEVELS = [
    { label: 'Minor', value: 50, color: 'var(--attention)' },
    { label: 'Moderate', value: 100, color: 'var(--attention-text)' },
    { label: 'Severe', value: 150, color: 'var(--bad)' },
];
const COLS = 10;

function saveCSV(content, name) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

async function downloadImage(url, name) {
    try {
        const blob = await (await fetch(url)).blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = `${name}.jpg`;
        a.click();
        URL.revokeObjectURL(href);
    } catch {
        window.open(url, '_blank');
    }
}

// Fire: highest detection confidence; flood: highest water level
const peakReading = (r) => (r.hazardType === 'flood' ? `${r.heightCm} cm` : r.confidence != null ? `${r.confidence}%` : '—');
const clock = (iso) => formatTime(iso).replace(' PHT', '');
const timeRange = (r) => (r.durationMs < 60000 ? formatTime(r.startedAt) : `${clock(r.startedAt)} – ${formatTime(r.endedAt)}`);
const sameDay = (a, b) => formatDate(a) === formatDate(b);

function HazardChip({ type }) {
    const Icon = type === 'flood' ? Waves : Flame;
    return (
        <span className={`${styles.hazard} ${styles[type]}`}>
            <Icon size={13} /> {hazardLabel(type)}
        </span>
    );
}

function StatusChip({ record }) {
    return <Chip tone={isActive(record) ? 'danger' : 'off'}>{isActive(record) ? 'Active' : 'Not active'}</Chip>;
}

function Severity({ value, hazardType }) {
    if (!value) return <span className={styles.off}>{hazardType === 'flood' ? 'Normal' : '—'}</span>;
    return <span className={`${styles.sev} ${styles[toneFor(SEVERITY_TONE, value)]}`}>{formatStatus(value)}</span>;
}

// Expanded view of one incident: summary, timeline and its snapshots
function IncidentDetail({ incident, onPreview, onDelete, onResolve, onExportFrames, exporting }) {
    const [shown, setShown] = useState(GALLERY_STEP);
    const flood = incident.hazardType === 'flood';
    const { timeline } = incident;
    const snapshots = useMemo(() => [...incident.snapshots].reverse(), [incident.snapshots]); // newest first
    const xLabels = timeline.length > 1
        ? [timeline[0], timeline[Math.floor(timeline.length / 2)], timeline.at(-1)].map((p) => clock(p.t))
        : [];
    const at = (iso) => `${formatDate(iso)} · ${formatTime(iso)}`;

    const facts = [
        ['Started', at(incident.startedAt)],
        ['Last seen', at(incident.endedAt)],
        ['Cleared', incident.clearedAt ? at(incident.clearedAt) : isActive(incident) ? 'Still active' : '—'],
        ['Duration', formatDuration(incident.durationMs)],
        ...(flood
            ? [
                ['Peak water', `${incident.heightCm} cm`],
                ['Sensor', `Node ${incident.nodeId} · ${incident.source}`],
                ['Readings', incident.frameCount],
                ['Location', incident.location ? `${incident.location.latitude.toFixed(4)}, ${incident.location.longitude.toFixed(4)}` : '—'],
            ]
            : [
                ['Peak fire conf.', incident.fireConfidence != null ? `${incident.fireConfidence}%` : '—'],
                ['Peak smoke conf.', incident.smokeConfidence != null ? `${incident.smokeConfidence}%` : '—'],
                ['Peak threat score', incident.threatScore ?? '—'],
                ['Frames analysed', incident.frameCount],
                ['Snapshots', `${incident.snapshotCount}${incident.manualCount ? ` (${incident.manualCount} manual)` : ''}`],
            ]),
    ];

    return (
        <div className={styles.detail}>
            <div className={styles.detailTop}>
                <dl className={styles.facts}>
                    {facts.map(([k, v]) => (
                        <div key={k} className={styles.fact}><dt>{k}</dt><dd>{v}</dd></div>
                    ))}
                </dl>

                <div className={styles.chart}>
                    <div className={styles.chartHead}>
                        <span>{flood ? 'Water height over the incident' : 'Detection confidence over the incident'}</span>
                        {!flood && (
                            <span className={styles.legend}>
                                <i style={{ background: 'var(--bad)' }} /> Fire
                                <i style={{ background: 'var(--text-muted)' }} /> Smoke
                            </span>
                        )}
                    </div>
                    {timeline.length > 1 ? (
                        <LineChart
                            height={140}
                            unit={flood ? '' : '%'}
                            min={0}
                            max={flood ? undefined : 100}
                            xLabels={xLabels}
                            thresholds={flood ? FLOOD_LEVELS : []}
                            series={flood
                                ? [{ id: 'height', values: timeline.map((p) => p.heightCm), color: 'var(--water)', fill: true }]
                                : [
                                    { id: 'smoke', values: timeline.map((p) => p.smoke), color: 'var(--text-muted)' },
                                    { id: 'fire', values: timeline.map((p) => p.fire), color: 'var(--bad)', fill: true },
                                ]}
                        />
                    ) : (
                        <p className={styles.note}>A single {flood ? 'reading' : 'frame'}: nothing to plot.</p>
                    )}
                    <div className={styles.detailActions}>
                        <Button size="sm" onClick={() => onExportFrames(incident)} disabled={exporting}>
                            <FileSpreadsheet size={13} />
                            {exporting ? 'Preparing…' : `Raw ${flood ? 'readings' : 'frames'} CSV (${incident.frameCount})`}
                        </Button>
                        {isActive(incident) && (
                            <Button size="sm" onClick={() => onResolve(incident)}>
                                <CheckCircle2 size={13} /> Mark incident resolved
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {!flood && (
                <section>
                    <h3 className={styles.galleryTitle}>Snapshots ({snapshots.length})</h3>
                    {snapshots.length === 0 ? (
                        <p className={styles.note}>No snapshot was saved during this incident.</p>
                    ) : (
                        <>
                            <div className={styles.gallery}>
                                {snapshots.slice(0, shown).map((s) => (
                                    <figure key={s.id} className={styles.shot}>
                                        {s.imageUrl ? (
                                            <button className={styles.shotImg} onClick={() => onPreview(s)} title="View full image">
                                                <img src={cloudinaryThumb(s.imageUrl, { width: 240, height: 135 })} alt="Snapshot" loading="lazy" />
                                            </button>
                                        ) : (
                                            <span className={`${styles.shotImg} ${styles.thumbEmpty}`} title="No image"><ImageOff size={16} /></span>
                                        )}
                                        <figcaption className={styles.shotMeta}>
                                            <span className="mono">{clock(s.capturedAt)}</span>
                                            <span className="mono">{s.confidence != null ? `${s.confidence}%` : '—'}</span>
                                            {s.trigger === 'manual' && <Chip tone="warn">Manual</Chip>}
                                            <span className={styles.shotActions}>
                                                {s.imageUrl && (
                                                    <button className={styles.iconBtn} title="Download image" onClick={() => downloadImage(s.imageUrl, s.snapshotId)}>
                                                        <Download size={12} />
                                                    </button>
                                                )}
                                                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Permanently delete" onClick={() => onDelete(s)}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </span>
                                        </figcaption>
                                    </figure>
                                ))}
                            </div>
                            {snapshots.length > shown && (
                                <Button size="sm" onClick={() => setShown((n) => n + GALLERY_STEP * 2)}>
                                    Show more ({snapshots.length - shown} left)
                                </Button>
                            )}
                        </>
                    )}
                </section>
            )}
        </div>
    );
}

export default function History() {
    const { site, destroySnapshot } = useAppData();

    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchHistory = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/history`);
            const body = await res.json();
            if (!res.ok || !body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
            setIncidents(body.data);
            setError(null);
        } catch (err) {
            setError(err.message === 'Failed to fetch' ? 'Backend not reachable' : err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const first = setTimeout(fetchHistory, 0);
        return () => clearTimeout(first);
    }, [fetchHistory]);

    const refresh = () => { setLoading(true); fetchHistory(); };

    // ── filters + paging ─────────────────────────────────────────────────
    const [filters, setFilters] = useState(NO_FILTERS);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);

    const setFilter = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };
    const filtersOn = filters.date || filters.hazard !== 'all' || filters.status !== 'all';

    const filtered = useMemo(() => filterHistory(incidents, filters), [incidents, filters]);
    const view = paginate(filtered, page, pageSize);

    // ── expand, preview, delete, resolve, export ─────────────────────────
    const [expandedId, setExpandedId] = useState(null);
    const [preview, setPreview] = useState(null);
    const [destroyTarget, setDestroyTarget] = useState(null);
    const [destroying, setDestroying] = useState(false);
    const [exportingFrames, setExportingFrames] = useState(null); // 'all' or an incident id

    const onConfirmDestroy = async () => {
        if (!destroyTarget) return;
        setDestroying(true);
        const ok = await destroySnapshot(destroyTarget.snapshotId);
        setDestroying(false);
        setDestroyTarget(null);
        if (ok) fetchHistory();
    };

    const resolve = async (incident) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/history/resolve`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hazardType: incident.hazardType, nodeId: incident.nodeId, from: incident.startedAt, to: incident.endedAt }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setIncidents((prev) => prev.map((i) => (i.id === incident.id ? { ...i, status: 'resolved' } : i)));
        } catch (err) {
            console.error('[resolveIncident]', err.message);
        }
    };

    const fetchJson = async (path) => {
        const res = await fetch(`${API_BASE_URL}${path}`);
        const body = await res.json();
        if (!res.ok || !body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body.data;
    };

    // Every frame/reading behind one incident, or behind all the filtered ones
    const exportFrames = async (incident = null) => {
        setExportingFrames(incident?.id ?? 'all');
        try {
            if (incident) {
                const full = await fetchJson(`/api/history/incidents/${encodeURIComponent(incident.id)}`);
                saveCSV(toFramesCSV([full]), `drony_${incident.id}_frames`);
            } else {
                const wanted = new Set(filtered.map((i) => i.id));
                const all = await fetchJson('/api/history?frames=1');
                saveCSV(toFramesCSV(all.filter((i) => wanted.has(i.id))), 'drony_hazard_frames');
            }
        } catch (err) {
            console.error('[exportFrames]', err.message);
        } finally {
            setExportingFrames(null);
        }
    };

    const openPreview = (imageUrl, iso, confidence) => setPreview({
        src: imageUrl,
        caption: `${formatDate(iso)} · ${formatTime(iso)}${confidence != null ? ` · ${confidence}%` : ''}`,
    });

    const thumb = (r) => (
        r.imageUrl ? (
            <button
                className={styles.thumb}
                onClick={(e) => { e.stopPropagation(); openPreview(r.imageUrl, r.startedAt, r.confidence); }}
                title="View the clearest snapshot"
            >
                <img
                    src={cloudinaryThumb(r.imageUrl)}
                    alt={`${hazardLabel(r.hazardType)} snapshot`}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.hidden = true; }}
                />
            </button>
        ) : (
            <span className={`${styles.thumb} ${styles.thumbEmpty}`} title="No image">
                {r.hazardType === 'flood' ? <Waves size={16} /> : <ImageOff size={16} />}
            </span>
        )
    );

    return (
        <div className={styles.page}>
            <Modal
                open={Boolean(destroyTarget)}
                title="Permanently delete this snapshot?"
                confirmLabel={destroying ? 'Deleting…' : 'Delete permanently'}
                confirmVariant="danger"
                onConfirm={onConfirmDestroy}
                onClose={() => setDestroyTarget(null)}
            >
                <p>
                    The snapshot captured on <strong>{formatDate(destroyTarget?.capturedAt)} · {formatTime(destroyTarget?.capturedAt)}</strong> will be{' '}
                    <strong>permanently deleted</strong> from Cloudinary, local storage and the database.{' '}
                    <span className={styles.warning}>This cannot be undone.</span>
                </p>
            </Modal>

            <ImagePreview src={preview?.src} caption={preview?.caption} alt="Drone snapshot" onClose={() => setPreview(null)} />

            <TopBar
                title="Hazard History"
                subtitle={`${site.area}, ${site.city}`}
                actions={
                    <>
                        <Button
                            onClick={() => exportFrames()}
                            disabled={filtered.length === 0 || exportingFrames !== null}
                            title="Every frame and sensor reading behind all incidents matching the filters. For one incident, use its row's export button."
                        >
                            <FileSpreadsheet size={14} />
                            {exportingFrames === 'all' ? 'Preparing…' : `Raw frames, all ${filtered.length}`}
                        </Button>
                        <Button variant="primary" onClick={() => saveCSV(toCSV(filtered), 'drony_hazard_report')} disabled={filtered.length === 0}>
                            <Download size={14} />
                            Export report ({filtered.length})
                        </Button>
                    </>
                }
            />

            <div className={styles.body}>
                <Card
                    className={styles.tableCard}
                    title="Incidents"
                    meta={
                        <button className={styles.iconBtn} onClick={refresh} title="Refresh" disabled={loading}>
                            <RefreshCw size={13} className={loading ? styles.spin : ''} />
                        </button>
                    }
                >
                    <div className={styles.tableScroll}>
                        <table className={table.table}>
                            <thead>
                                <tr>
                                    <th aria-label="Expand" />
                                    <th>Image</th>
                                    <th>Hazard</th>
                                    <th>Started</th>
                                    <th>Duration</th>
                                    <th>Peak severity</th>
                                    <th title="Fire: highest detection confidence · Flood: highest water level">Peak reading</th>
                                    <th title="Frames the model analysed (fire) or sensor readings (flood), and snapshots saved">Evidence</th>
                                    <th>Status</th>
                                    <th aria-label="Actions" />
                                </tr>
                                <tr className={styles.filterRow}>
                                    <th />
                                    <th />
                                    <th>
                                        <select className={styles.select} aria-label="Hazard type" value={filters.hazard} onChange={(e) => setFilter('hazard', e.target.value)}>
                                            <option value="all">All</option>
                                            <option value="fire">Fire</option>
                                            <option value="flood">Flood</option>
                                        </select>
                                    </th>
                                    <th>
                                        <input type="date" className={styles.select} aria-label="Date" value={filters.date} onChange={(e) => setFilter('date', e.target.value)} />
                                    </th>
                                    <th />
                                    <th />
                                    <th />
                                    <th />
                                    <th>
                                        <select className={styles.select} aria-label="Status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
                                            <option value="all">All</option>
                                            <option value="active">Active</option>
                                            <option value="resolved">Not active</option>
                                        </select>
                                    </th>
                                    <th>
                                        <button className={styles.resetBtn} onClick={() => { setFilters(NO_FILTERS); setPage(1); }} disabled={!filtersOn}>
                                            <RotateCcw size={12} /> Reset
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {view.rows.map((r) => {
                                    const open = r.id === expandedId;
                                    return (
                                        <Fragment key={r.id}>
                                            <tr
                                                className={`${table.clickable} ${open ? styles.rowActive : ''}`}
                                                onClick={() => setExpandedId(open ? null : r.id)}
                                                aria-expanded={open}
                                            >
                                                <td><ChevronDown size={14} className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} /></td>
                                                <td>{thumb(r)}</td>
                                                <td><HazardChip type={r.hazardType} /></td>
                                                <td>
                                                    <span className={styles.dateCell}>
                                                        <span>{formatDate(r.startedAt)}{!sameDay(r.startedAt, r.endedAt) && ` – ${formatDate(r.endedAt)}`}</span>
                                                        <span className={styles.timeSmall}>{timeRange(r)}</span>
                                                    </span>
                                                </td>
                                                <td className="mono">{formatDuration(r.durationMs)}</td>
                                                <td><Severity value={r.severity} hazardType={r.hazardType} /></td>
                                                <td className="mono">{peakReading(r)}</td>
                                                <td className={styles.evidence}>
                                                    {r.hazardType === 'flood'
                                                        ? `${r.frameCount} readings · Node ${r.nodeId}`
                                                        : `${r.frameCount} frames · ${r.snapshotCount} snapshots`}
                                                </td>
                                                <td><StatusChip record={r} /></td>
                                                <td onClick={(e) => e.stopPropagation()}>
                                                    <div className={styles.actions}>
                                                        <button
                                                            className={styles.iconBtn}
                                                            title={`Export this incident's raw ${r.hazardType === 'flood' ? 'readings' : 'frames'} (CSV)`}
                                                            onClick={() => exportFrames(r)}
                                                            disabled={exportingFrames !== null}
                                                        >
                                                            <FileSpreadsheet size={13} className={exportingFrames === r.id ? styles.spin : ''} />
                                                        </button>
                                                        {isActive(r) && (
                                                            <button className={styles.iconBtn} title="Mark incident resolved" onClick={() => resolve(r)}>
                                                                <CheckCircle2 size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {open && (
                                                <tr className={styles.detailRow}>
                                                    <td colSpan={COLS}>
                                                        <IncidentDetail
                                                            incident={r}
                                                            onPreview={(s) => openPreview(s.imageUrl, s.capturedAt, s.confidence)}
                                                            onDelete={setDestroyTarget}
                                                            onResolve={resolve}
                                                            onExportFrames={exportFrames}
                                                            exporting={exportingFrames !== null}
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        {view.rows.length === 0 && (
                            <p className={`${table.empty} ${styles.emptyMsg}`}>
                                {loading ? 'Loading history…' : error ? `Could not load history: ${error}` : 'No incidents match your filters.'}
                            </p>
                        )}
                    </div>

                    <footer className={styles.pager}>
                        <span className={styles.pagerInfo}>
                            {view.from}–{view.to} of {filtered.length} incidents
                        </span>
                        <label className={styles.pagerSize}>
                            Rows
                            <select className={styles.select} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <div className={styles.pagerNav}>
                            <button className={styles.iconBtn} onClick={() => setPage(view.page - 1)} disabled={view.page <= 1} aria-label="Previous page">
                                <ChevronLeft size={14} />
                            </button>
                            <span className="mono">{view.page} / {view.pageCount}</span>
                            <button className={styles.iconBtn} onClick={() => setPage(view.page + 1)} disabled={view.page >= view.pageCount} aria-label="Next page">
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </footer>
                </Card>
            </div>
        </div>
    );
}
