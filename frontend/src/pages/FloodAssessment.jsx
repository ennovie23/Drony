import { useState } from 'react';
import styles from './Assessment.module.css';
import ui from '../components/shared/ui.module.css';
import PageHeader from '../components/shared/PageHeader';
import TacticalMap from '../components/shared/TacticalMap';
import LineChart from '../components/shared/LineChart';
import StatusDot from '../components/shared/StatusDot';
import { useAppData } from '../context/AppDataContext';
import { jsnSpec } from '../data/mock';
import { echoMicros, readingStatus, distanceChange, formatChange, reportingSensors } from '../utils/flood';
import { timeAgo } from '../utils/format';
import useNow from '../hooks/useNow';

// History keeps one distance sample every 5 minutes.
const SAMPLE_MINUTES = 5;
const SERIES_COLORS = ['var(--flood)', 'var(--teal)', '#a78bfa', '#f472b6', '#facc15'];
const MAP_LAYERS = { path: false, fire: false, flood: true };

export default function FloodAssessment() {
    useNow(5000);
    const { drone, site, modules } = useAppData();
    const [selectedId, setSelectedId] = useState(null);

    const sensors = reportingSensors(modules);
    const docked = modules.filter((m) => m.status === 'DOCKED');
    const valid = sensors.filter((m) => readingStatus(m.distance) === 'VALID');
    const latest = sensors.reduce((top, m) => (m.lastReadingAt > (top?.lastReadingAt ?? '') ? m : top), null);
    const weakest = sensors.reduce((low, m) => (m.battery < (low?.battery ?? Infinity) ? m : low), null);
    const selected = sensors.find((m) => m.id === selectedId) ?? sensors[0];
    const colorOf = (id) => SERIES_COLORS[sensors.findIndex((m) => m.id === id) % SERIES_COLORS.length];

    const kpis = [
        { label: 'SENSORS REPORTING', value: `${sensors.length}/${modules.length}`, sub: `${docked.length} STILL IN DOCK` },
        { label: 'LAST READING', value: latest ? timeAgo(latest.lastReadingAt) : '—', sub: `EVERY ${jsnSpec.sampleSeconds} S` },
        { label: 'VALID READINGS', value: `${valid.length}/${sensors.length}`, sub: `RANGE ${jsnSpec.minCm}–${jsnSpec.maxCm} CM` },
        { label: 'LOWEST BATTERY', value: weakest ? `${weakest.battery}%` : '—', sub: weakest ? weakest.id : 'NO DATA' },
    ];

    return (
        <div className={styles.container}>
            <PageHeader
                eyebrow={<span>{drone.id} · FLOATING {jsnSpec.model} MODULES</span>}
                title="FLOOD SENSORS"
                subtitle={`${site.area} · ${site.city}`}
                stats={[
                    { label: 'SENSOR', value: jsnSpec.model },
                    { label: 'LINK', value: 'ESP32 · LORA' },
                ]}
            />

            <div className={styles.body}>
                <div className={styles.kpiRow}>
                    {kpis.map((k) => (
                        <div key={k.label} className={styles.kpi}>
                            <p className={ui.label}>{k.label}</p>
                            <p className={ui.bigValue}>{k.value}</p>
                            <p className={styles.kpiSub}>{k.sub}</p>
                        </div>
                    ))}
                </div>

                <div className={styles.grid}>
                    <div className={styles.column}>
                        <div>
                            <div className={styles.cardHead}>
                                <p className={ui.sectionTag}>— SENSOR POSITIONS</p>
                                <span className={ui.label}>CLICK A SENSOR</span>
                            </div>
                            <TacticalMap layers={MAP_LAYERS} selectedId={selected?.id} onSelect={setSelectedId} />
                        </div>

                        <div className={styles.card}>
                            <div className={styles.cardHead}>
                                <p className={ui.sectionTag}>— MEASURED DISTANCE</p>
                                <span className={ui.label}>CM / {SAMPLE_MINUTES} MIN</span>
                            </div>
                            <LineChart
                                series={sensors.map((m) => ({ id: m.id, values: m.history, color: colorOf(m.id) }))}
                                max={250}
                                height={190}
                            />
                            <div className={styles.legend}>
                                {sensors.map((m) => (
                                    <span key={m.id} className={styles.legendItem}>
                                        <span className={styles.swatch} style={{ backgroundColor: colorOf(m.id) }}></span>
                                        {m.id} · {m.place}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className={styles.column}>
                        <div className={styles.card}>
                            {selected ? (
                                <>
                                    <div className={styles.cardHead}>
                                        <p className={ui.sectionTag}>— {selected.id} · {selected.place}</p>
                                        <span className={ui.status}>
                                            <StatusDot value={readingStatus(selected.distance)} />
                                            {readingStatus(selected.distance)}
                                        </span>
                                    </div>
                                    <p className={styles.sensorValue}>
                                        {selected.distance}
                                        <span className={ui.unit}>cm measured distance</span>
                                    </p>
                                    <div className={styles.kv}>
                                        <div className={styles.kvRow}><span>CHANGE (LAST {SAMPLE_MINUTES} MIN)</span><span>{formatChange(distanceChange(selected))}</span></div>
                                        <div className={styles.kvRow}><span>FIRST READING</span><span>{selected.history[0]} cm</span></div>
                                        <div className={styles.kvRow}><span>ECHO TIME</span><span>{echoMicros(selected.distance)} µs</span></div>
                                        <div className={styles.kvRow}><span>LAST READING</span><span>{timeAgo(selected.lastReadingAt)}</span></div>
                                        <div className={styles.kvRow}><span>DEPLOYED</span><span>{timeAgo(selected.deployedAt)}</span></div>
                                        <div className={styles.kvRow}><span>BATTERY</span><span>{selected.battery}%</span></div>
                                        <div className={styles.kvRow}>
                                            <span>SIGNAL</span>
                                            <span className={ui.status}>
                                                <StatusDot value={selected.lora} /> {selected.lora} · {selected.signal} dBm
                                            </span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <p className={ui.empty}>NO SENSORS REPORTING</p>
                            )}
                        </div>

                        <div className={styles.card}>
                            <p className={ui.sectionTag}>— SENSOR · {jsnSpec.model}</p>
                            <div className={styles.kv}>
                                <div className={styles.kvRow}><span>TYPE</span><span>WATERPROOF ULTRASONIC</span></div>
                                <div className={styles.kvRow}><span>RANGE</span><span>{jsnSpec.minCm}–{jsnSpec.maxCm} cm</span></div>
                                <div className={styles.kvRow}><span>ACCURACY</span><span>± {jsnSpec.accuracyCm} cm</span></div>
                                <div className={styles.kvRow}><span>FREQUENCY</span><span>{jsnSpec.frequencyKhz} kHz</span></div>
                                <div className={styles.kvRow}><span>SAMPLE RATE</span><span>EVERY {jsnSpec.sampleSeconds} S</span></div>
                                <div className={styles.kvRow}><span>MODULE</span><span>FLOATING · ESP32 · LORA</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <p className={ui.sectionTag}>— LATEST READINGS ({sensors.length})</p>
                    {sensors.length === 0 ? (
                        <p className={ui.empty}>NO SENSORS REPORTING</p>
                    ) : (
                        <div className={styles.table}>
                            <div className={`${styles.sensorRow} ${styles.th}`}>
                                <span>SENSOR</span>
                                <span>PLACE</span>
                                <span>DISTANCE</span>
                                <span>CHANGE</span>
                                <span>ECHO</span>
                                <span>READING</span>
                                <span>BATTERY</span>
                                <span>SIGNAL</span>
                                <span>UPDATED</span>
                            </div>
                            {sensors.map((m) => (
                                <button
                                    key={m.id}
                                    className={`${styles.sensorRow} ${styles.trBody} ${selected?.id === m.id ? styles.trActive : ''}`}
                                    onClick={() => setSelectedId(m.id)}>
                                    <span className={styles.sensorId}>
                                        <span className={styles.swatch} style={{ backgroundColor: colorOf(m.id) }}></span>
                                        {m.id}
                                    </span>
                                    <span className={styles.muted}>{m.place}</span>
                                    <span>{m.distance} cm</span>
                                    <span>{formatChange(distanceChange(m))}</span>
                                    <span className={styles.muted}>{echoMicros(m.distance)} µs</span>
                                    <span className={ui.status}>
                                        <StatusDot value={readingStatus(m.distance)} /> {readingStatus(m.distance)}
                                    </span>
                                    <span>{m.battery}%</span>
                                    <span className={styles.muted}>{m.signal} dBm</span>
                                    <span className={styles.muted}>{timeAgo(m.lastReadingAt)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
