import { useState } from 'react';
import styles from './FloodAssessment.module.css';
import table from '../components/ui/Table.module.css';
import TopBar from '../components/shared/TopBar';
import TacticalMap from '../components/shared/TacticalMap';
import LineChart from '../components/shared/LineChart';
import { Card, Readout, Chip, KeyValue } from '../components/ui';
import { formatStatus } from '../components/ui/format';
import { useAppData } from '../context/AppDataContext';
import { jsnSpec } from '../data/mock';
import { echoMicros, readingStatus, distanceChange, formatChange, reportingSensors } from '../utils/flood';
import { timeAgo } from '../utils/format';
import useNow from '../hooks/useNow';

// History keeps one distance sample every 5 minutes.
const SAMPLE_MINUTES = 5;
const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];
const MAP_LAYERS = { path: false, fire: false, flood: true };
// Chart window (cm). Inverted, so water rising (distance falling) draws upward.
const CHART_MIN = 120;
const CHART_MAX = 210;
const LOW_BATTERY = 50;

const ago = (iso) => formatStatus(timeAgo(iso));

export default function FloodAssessment() {
    useNow(5000);
    const { site, modules } = useAppData();
    const [selectedId, setSelectedId] = useState(null);

    const sensors = reportingSensors(modules);
    const docked = modules.filter((m) => m.status === 'DOCKED');
    const valid = sensors.filter((m) => readingStatus(m.distance) === 'VALID');
    const latest = sensors.reduce((top, m) => (m.lastReadingAt > (top?.lastReadingAt ?? '') ? m : top), null);
    const weakest = sensors.reduce((low, m) => (m.battery < (low?.battery ?? Infinity) ? m : low), null);
    const selected = sensors.find((m) => m.id === selectedId) ?? sensors[0];
    const colorOf = (id) => SERIES_COLORS[sensors.findIndex((m) => m.id === id) % SERIES_COLORS.length];

    return (
        <div className={styles.page}>
            <TopBar
                title="Flood sensors"
                subtitle={`Floating ${jsnSpec.model} modules · ${site.area}`}
                actions={
                    <>
                        <span>Sensor <span className="mono">{jsnSpec.model}</span></span>
                        <span>Link ESP32 · LoRa</span>
                    </>
                }
            />

            <div className={styles.body}>
                <div className={styles.kpis}>
                    <Card>
                        <Readout label="Sensors reporting" value={`${sensors.length}/${modules.length}`} sub={`${docked.length} still in dock`} />
                    </Card>
                    <Card>
                        <Readout label="Last reading" value={latest ? ago(latest.lastReadingAt) : '—'} sub={`Every ${jsnSpec.sampleSeconds} s`} />
                    </Card>
                    <Card>
                        <Readout label="Valid readings" value={`${valid.length}/${sensors.length}`} sub={`Range ${jsnSpec.minCm}–${jsnSpec.maxCm} cm`} />
                    </Card>
                    <Card>
                        <Readout
                            label="Lowest battery"
                            value={weakest ? weakest.battery : '—'}
                            unit={weakest ? '%' : undefined}
                            sub={weakest ? weakest.id : 'No data'}
                            tone={weakest && weakest.battery < LOW_BATTERY ? 'warn' : undefined}
                        />
                    </Card>
                </div>

                <div className={styles.middle}>
                    <Card title="Sensor positions" meta="Click a sensor" className={styles.stretch}>
                        <TacticalMap layers={MAP_LAYERS} selectedId={selected?.id} onSelect={setSelectedId} />
                    </Card>

                    <Card title="Distance to water" meta={`cm · every ${SAMPLE_MINUTES} min`} className={styles.stretch}>
                        <LineChart
                            series={sensors.map((m) => ({ id: m.id, values: m.history, color: colorOf(m.id) }))}
                            min={CHART_MIN}
                            max={CHART_MAX}
                            invert
                            height={190}
                        />
                        <div className={styles.legend}>
                            {sensors.map((m) => (
                                <span key={m.id} className={styles.legendItem}>
                                    <span className={styles.swatch} style={{ backgroundColor: colorOf(m.id) }}></span>
                                    <span className="mono">{m.id}</span> · {m.place}
                                </span>
                            ))}
                        </div>
                        <p className={styles.note}>Axis inverted: a rising line means rising water.</p>
                    </Card>

                    {selected ? (
                        <Card title={`${selected.id} · ${selected.place}`} meta={<Chip value={readingStatus(selected.distance)} />}>
                            <Readout label="Measured distance" value={selected.distance} unit="cm to water" size="hero" />
                            <div className={styles.detail}>
                                <KeyValue
                                    rows={[
                                        { label: `Change (last ${SAMPLE_MINUTES} min)`, value: formatChange(distanceChange(selected)) },
                                        { label: 'First reading', value: `${selected.history[0]} cm` },
                                        { label: 'Echo time', value: `${echoMicros(selected.distance)} µs` },
                                        { label: 'Last reading', value: ago(selected.lastReadingAt) },
                                        { label: 'Deployed', value: ago(selected.deployedAt) },
                                        { label: 'Battery', value: `${selected.battery}%` },
                                        {
                                            label: 'Signal',
                                            value: (
                                                <>
                                                    <Chip value={selected.lora} />
                                                    <span className="mono">{selected.signal} dBm</span>
                                                </>
                                            ),
                                        },
                                    ]}
                                />
                            </div>
                        </Card>
                    ) : (
                        <Card title="Selected sensor">
                            <p className={table.empty}>No sensors reporting</p>
                        </Card>
                    )}
                </div>

                <div className={styles.lower}>
                    <Card title={`Latest readings (${sensors.length})`}>
                        {sensors.length === 0 ? (
                            <p className={table.empty}>No sensors reporting</p>
                        ) : (
                            <div className={styles.tableWrap}>
                                <table className={table.table}>
                                    <thead>
                                        <tr>
                                            <th>Sensor</th>
                                            <th>Place</th>
                                            <th>Distance</th>
                                            <th>Change</th>
                                            <th>Echo</th>
                                            <th>Reading</th>
                                            <th>Battery</th>
                                            <th>Signal</th>
                                            <th>Updated</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sensors.map((m) => (
                                            <tr
                                                key={m.id}
                                                className={`${table.clickable} ${selected?.id === m.id ? table.active : ''}`}
                                                onClick={() => setSelectedId(m.id)}>
                                                <td className="mono">
                                                    <span className={styles.swatch} style={{ backgroundColor: colorOf(m.id) }}></span>
                                                    {m.id}
                                                </td>
                                                <td className={table.muted}>{m.place}</td>
                                                <td className="mono">{m.distance} cm</td>
                                                <td className="mono">{formatChange(distanceChange(m))}</td>
                                                <td className={`mono ${table.muted}`}>{echoMicros(m.distance)} µs</td>
                                                <td><Chip value={readingStatus(m.distance)} /></td>
                                                <td className="mono">{m.battery}%</td>
                                                <td className={`mono ${table.muted}`}>{m.signal} dBm</td>
                                                <td className={table.muted}>{ago(m.lastReadingAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    <Card title={`Sensor · ${jsnSpec.model}`}>
                        <KeyValue
                            rows={[
                                { label: 'Type', value: <span>Waterproof ultrasonic</span> },
                                { label: 'Range', value: `${jsnSpec.minCm}–${jsnSpec.maxCm} cm` },
                                { label: 'Accuracy', value: `± ${jsnSpec.accuracyCm} cm` },
                                { label: 'Frequency', value: `${jsnSpec.frequencyKhz} kHz` },
                                { label: 'Sample rate', value: `Every ${jsnSpec.sampleSeconds} s` },
                                { label: 'Module', value: <span>Floating · ESP32 · LoRa</span> },
                            ]}
                        />
                    </Card>
                </div>
            </div>
        </div>
    );
}
