import { useState } from 'react';
import { Camera } from 'lucide-react';
import base from './Assessment.module.css';
import styles from './FireAssessment.module.css';
import ui from '../components/shared/ui.module.css';
import PageHeader from '../components/shared/PageHeader';
import StatusDot from '../components/shared/StatusDot';
import MlFrame from '../components/fire/MlFrame';
import { useAppData } from '../context/AppDataContext';
import { formatTime, timeAgo } from '../utils/format';
import useNow from '../hooks/useNow';

const SEVERITY_TONE = { LOW: 'ok', MODERATE: 'warn', SEVERE: 'danger' };
const BEHAVIOR_TONE = { DECLINING: 'ok', STABLE: 'warn', GROWING: 'danger' };

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
        <div className={base.container}>
            <PageHeader
                eyebrow={<span>{drone.id} · ML FIRE DETECTION</span>}
                title="FIRE ASSESSMENT"
                subtitle={`${site.area} · ${site.city}`}
                actions={
                    <button className={ui.btnAccent} onClick={captureSnapshot} disabled={analyzing}>
                        <Camera size={14} />
                        <span>{analyzing ? 'ANALYZING…' : 'CAPTURE SNAPSHOT'}</span>
                    </button>
                }
            />

            <div className={base.body}>
                <div className={base.grid}>
                    <div className={base.column}>
                        <div>
                            <div className={base.cardHead}>
                                <p className={ui.sectionTag}>— ANALYZED SNAPSHOT · FRAME {snap.frame}</p>
                                <span className={ui.label}>
                                    {isLatest ? 'LATEST · ' : ''}
                                    {formatTime(snap.capturedAt)}
                                </span>
                            </div>
                            <div className={base.mediaFrame}>
                                <MlFrame snapshot={snap} highlightId={highlightId} />
                            </div>
                        </div>

                        <div>
                            <p className={ui.sectionTag}>— DETECTIONS ({detections.length})</p>
                            {detections.length === 0 ? (
                                <p className={ui.empty}>NO FIRE DETECTED IN THIS FRAME</p>
                            ) : (
                                <div className={base.table}>
                                    <div className={`${styles.detRow} ${base.th}`}>
                                        <span>BOX</span>
                                        <span>LABEL</span>
                                        <span>SCORE</span>
                                        <span>POSITION (X, Y)</span>
                                        <span>SIZE (W × H)</span>
                                    </div>
                                    {detections.map((d) => (
                                        <div
                                            key={d.id}
                                            className={`${styles.detRow} ${base.trBody} ${highlightId === d.id ? base.trActive : ''}`}
                                            onMouseEnter={() => setHighlightId(d.id)}
                                            onMouseLeave={() => setHighlightId(null)}>
                                            <span>{d.id}</span>
                                            <span className={styles.fireLabel}>{d.label}</span>
                                            <span className={styles.score}>
                                                <span className={base.barTrack}>
                                                    <span className={base.barFill} style={{ display: 'block', width: `${d.confidence * 100}%` }}></span>
                                                </span>
                                                <span>{d.confidence.toFixed(2)}</span>
                                            </span>
                                            <span className={base.muted}>{d.box.x}%, {d.box.y}%</span>
                                            <span className={base.muted}>{d.box.w}% × {d.box.h}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={base.column}>
                        <div className={base.card}>
                            <div className={base.cardHead}>
                                <p className={ui.sectionTag}>— INTELLIGENCE REPORT</p>
                                <span className={ui.label}>FRAME: {snap.frame}</span>
                            </div>

                            <div className={styles.reportBlock}>
                                <p className={ui.label}>ACTIVE FIRE FRONT</p>
                                <p className={styles.confidence}>{snap.fireConfidence}% CONFIDENCE</p>
                                <div className={base.kv}>
                                    <div className={base.kvRow}>
                                        <span>SEVERITY LABEL</span>
                                        <span className={`${styles.badge} ${styles[SEVERITY_TONE[snap.severity]]}`}>{snap.severity}</span>
                                    </div>
                                    <div className={base.kvRow}>
                                        <span>BEHAVIOR TREND</span>
                                        <span className={`${styles.badge} ${styles[BEHAVIOR_TONE[snap.behavior]]}`}>{snap.behavior}</span>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.reportBlock}>
                                <p className={ui.label}>SMOKE PLUME TRACKING</p>
                                {snap.smoke.detected ? (
                                    <p className={`${styles.smokeStatus} ${styles.smokeOn}`}>
                                        PLUME DETECTED · {snap.smoke.confidence.toFixed(2)}
                                    </p>
                                ) : (
                                    <p className={styles.smokeStatus}>CLEAR AIR</p>
                                )}
                            </div>

                            <div className={base.kv}>
                                <div className={base.kvRow}><span>CAPTURED</span><span>{timeAgo(snap.capturedAt)}</span></div>
                                <div className={base.kvRow}><span>BOXES</span><span>{snap.detections.length}</span></div>
                                <div className={base.kvRow}><span>SOURCE</span><span>{drone.id} CAMERA</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <div className={base.cardHead}>
                        <p className={ui.sectionTag}>— DRONE SNAPSHOTS ({fireSnapshots.length})</p>
                        <span className={ui.label}>CLICK A SNAPSHOT TO VIEW ITS RESULT</span>
                    </div>
                    <div className={styles.gallery}>
                        {analyzing && (
                            <div className={`${styles.snapCard} ${styles.pending}`}>
                                <div className={styles.pendingThumb}>
                                    <StatusDot tone="warn" pulse /> ANALYZING…
                                </div>
                                <span className={styles.snapMeta}>NEW SNAPSHOT</span>
                            </div>
                        )}
                        {fireSnapshots.map((s) => (
                            <button
                                key={s.id}
                                className={`${styles.snapCard} ${s.id === snap.id ? styles.snapOn : ''}`}
                                onClick={() => selectSnapshot(s.id)}>
                                <MlFrame snapshot={s} small />
                                <span className={styles.snapHead}>
                                    <span>FRAME {s.frame}</span>
                                    {s.id === latest.id && <span className={styles.latestTag}>LATEST</span>}
                                </span>
                                <span className={styles.snapMeta}>
                                    {s.fireConfidence}% · <span className={styles[SEVERITY_TONE[s.severity]]}>{s.severity}</span>
                                </span>
                                <span className={styles.snapMeta}>{timeAgo(s.capturedAt)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
