import { useState } from 'react';
import { Camera } from 'lucide-react';
import styles from './FireAssessment.module.css';
import table from '../components/ui/Table.module.css';
import TopBar from '../components/shared/TopBar';
import MlFrame from '../components/fire/MlFrame';
import { Card, Readout, Chip, KeyValue, Button } from '../components/ui';
import { SEVERITY_TONE, BEHAVIOR_TONE, toneFor } from '../components/ui/tones';
import { formatStatus } from '../components/ui/format';
import { useAppData } from '../context/AppDataContext';
import { formatTime, timeAgo } from '../utils/format';
import useNow from '../hooks/useNow';
import { VIDEO_PATH } from '../config';

export default function FireAssessment() {
    useNow(5000);
    const { drone, site, fireSnapshots, analyzing, captureSnapshot } = useAppData();
    const [selectedId, setSelectedId] = useState(null);
    const [highlightId, setHighlightId] = useState(null);

    const latest = fireSnapshots[0];
    const snap = fireSnapshots.find((s) => s.id === selectedId) ?? latest;
    const isLatest = snap.id === latest.id;
    const detections = [...snap.detections].sort((a, b) => b.confidence - a.confidence);

    const selectSnapshot = (id) => {
        setSelectedId(id);
        setHighlightId(null);
    };

    return (
        <div className={styles.page}>
            <TopBar
                title="Fire assessment"
                subtitle={`${site.area}, ${site.city}`}
                actions={
                    <Button variant="primary" onClick={captureSnapshot} disabled={analyzing}>
                        <Camera />
                        {analyzing ? 'Analysing…' : 'Capture snapshot'}
                    </Button>
                }
            />

            <div className={styles.body}>
                <div className={styles.grid}>
                    <div className={styles.column}>
                        <MlFrame
                            snapshot={snap}
                            highlightId={highlightId}
                            tag={`Frame ${snap.frame}${isLatest ? ' · latest' : ''} · ${formatTime(snap.capturedAt)}`}
                        />

                        <Card title={`Detections (${detections.length})`}>
                            {detections.length === 0 ? (
                                <p className={table.empty}>No fire detected in this frame</p>
                            ) : (
                                <table className={table.table}>
                                    <thead>
                                        <tr>
                                            <th>Box</th>
                                            <th>Label</th>
                                            <th>Score</th>
                                            <th>Position (x, y)</th>
                                            <th>Size (w × h)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detections.map((d) => (
                                            <tr
                                                key={d.id}
                                                className={highlightId === d.id ? table.active : ''}
                                                onMouseEnter={() => setHighlightId(d.id)}
                                                onMouseLeave={() => setHighlightId(null)}>
                                                <td className="mono">{d.id}</td>
                                                <td className={table.muted}>{d.label}</td>
                                                <td className="mono">
                                                    <span className={table.bar}>
                                                        <span style={{ width: `${d.confidence * 100}%` }}></span>
                                                    </span>
                                                    {d.confidence.toFixed(2)}
                                                </td>
                                                <td className="mono">{d.box.x}%, {d.box.y}%</td>
                                                <td className="mono">{d.box.w}% × {d.box.h}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </Card>
                    </div>

                    <div className={styles.column}>
                        <Card title="Model result" meta={<span>Frame <span className="mono">{snap.frame}</span></span>}>
                            <Readout label="Active fire front" value={snap.fireConfidence} unit="% confidence" size="hero" />
                            <div className={styles.verdict}>
                                <KeyValue
                                    rows={[
                                        { label: 'Severity', value: <Chip tone={toneFor(SEVERITY_TONE, snap.severity)} value={snap.severity} /> },
                                        { label: 'Behaviour', value: <Chip tone={toneFor(BEHAVIOR_TONE, snap.behavior)} value={snap.behavior} /> },
                                        {
                                            label: 'Smoke plume',
                                            value: snap.smoke.detected ? (
                                                <Chip tone="warn">Plume detected · {snap.smoke.confidence.toFixed(2)}</Chip>
                                            ) : (
                                                <Chip tone="ok">Clear air</Chip>
                                            ),
                                        },
                                    ]}
                                />
                            </div>
                        </Card>

                        <Card>
                            <KeyValue
                                rows={[
                                    { label: 'Captured', value: formatStatus(timeAgo(snap.capturedAt)) },
                                    { label: 'Boxes', value: snap.detections.length },
                                    { label: 'Source', value: `${drone.id} camera` },
                                ]}
                            />
                        </Card>
                    </div>
                </div>

                <Card title={`Snapshots (${fireSnapshots.length})`} meta="Click a snapshot to view its result">
                    <div className={styles.strip}>
                        {analyzing && (
                            <div className={`${styles.snap} ${styles.pending}`}>
                                <div className={styles.pendingThumb}>Analysing…</div>
                                <span className={styles.snapMeta}>New snapshot</span>
                            </div>
                        )}
                        {fireSnapshots.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                className={`${styles.snap} ${s.id === snap.id ? styles.snapOn : ''}`}
                                onClick={() => selectSnapshot(s.id)}>
                                <MlFrame snapshot={s} small />
                                <span className={styles.snapHead}>
                                    <span>Frame <span className="mono">{s.frame}</span></span>
                                    {s.id === latest.id && <Chip tone="off">Latest</Chip>}
                                </span>
                                <span className={styles.snapMeta}>
                                    <span className="mono">{s.fireConfidence}%</span> ·{' '}
                                    <span className={styles[toneFor(SEVERITY_TONE, s.severity)]}>{formatStatus(s.severity)}</span>
                                </span>
                                <span className={styles.snapMeta}>{formatStatus(timeAgo(s.capturedAt))}</span>
                            </button>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}
