import styles from './LiveSensor.module.css';
import { Card, Chip, KeyValue, Segmented } from '../ui';
import LineChart from '../shared/LineChart';
import StatusDot from '../shared/StatusDot';
import FloodGauge from './FloodGauge';
import { floodSummary, sensorHealth, trueDistance, secondsAgo, sourceLabel } from '../../utils/floodSensor';
import { serialSupported } from '../../utils/floodSerial';
import { FLOOD_LEVELS, floodLevel } from '../ui/tones';

// Points on the chart (~10 min at one reading every 10 s)
const CHART_POINTS = 60;
const MOUNTS = [
    { key: 'float', label: 'Floating' },
    { key: 'fixed', label: 'Fixed above' },
];
const MEDIUMS = [
    { key: 'water', label: 'Water' },
    { key: 'air', label: 'Air (desk test)' },
];

const cm = (value) => (value == null ? '—' : value.toFixed(1));

// Live flood sensor (ESP32 + JSN-SR04T + GPS) read over USB from the ground station:
// how high the water is, which flood level that is, which way it's going, and a
// plain-language system check. `sensor` is the shared flood-sensor connection.
export default function LiveSensor({ sensor, now, location }) {
    const { status, connectedAt, station, problem, storage, clearProblem, settings, setSettings } = sensor;
    const { connected, live, last, lastValid, points, height, trend } = floodSummary(sensor, now);
    const health = sensorHealth({ status, station, last, now, connectedAt });
    const level = floodLevel(live ? height : null);

    const chartValues = points.slice(-CHART_POINTS).map((p) => p.heightCm);
    // Always show the next level up, so the line has something to be measured against
    const ceiling = level.next?.value ?? FLOOD_LEVELS[0].value;
    const chartMax = Math.max(ceiling, ...chartValues) * 1.12;
    const chartMin = Math.min(0, ...chartValues);

    let state;
    if (!last) state = connected ? 'Waiting for the first reading…' : 'Sensor not connected';
    else if (last.distanceCm == null) state = 'Latest reading had no echo';
    else if (!live) state = `No reading for ${secondsAgo(now - last.timestamp).replace(' ago', '')}`;

    let rate = null;
    if (trend) rate = trend.direction === 'STEADY' ? 'Steady' : `${trend.direction === 'RISING' ? 'Rising' : 'Falling'} ${Math.abs(trend.ratePerMin).toFixed(1)} cm/min`;

    return (
        <section className={styles.section} aria-label="Live flood sensor">
            {!serialSupported() && <p className={styles.notice}>Reading the sensor needs Chrome or Edge on a computer.</p>}
            {storage.error && <p className={styles.notice}>{storage.error}</p>}
            {problem && (
                <p className={styles.notice} role="alert">
                    {problem}
                    <button type="button" className={styles.dismiss} onClick={clearProblem}>
                        Dismiss
                    </button>
                </p>
            )}

            <div className={styles.top}>
                <Card title="Water level" meta={live ? `Updated ${secondsAgo(now - last.timestamp)}` : null} className={styles.levelCard}>
                    <div className={`${styles.banner} ${live ? styles[level.tone] : styles.idle}`} role="status">
                        {live ? (level.tone === 'ok' ? 'Normal' : `${level.label} flood`) : state}
                    </div>
                    <div className={styles.levelBody}>
                        <FloodGauge height={live ? height : null} />
                        <div className={styles.levelFacts}>
                            <div className={`${styles.height} ${live ? '' : styles.dim}`}>
                                {cm(height)}
                                <span className={styles.unit}>cm</span>
                            </div>
                            <div className={styles.heightCap}>{settings.mount === 'float' ? 'Water depth' : 'Water level'}</div>

                            {rate && (
                                <div className={`${styles.rate} ${trend.direction === 'RISING' ? styles.rising : ''}`}>{rate}</div>
                            )}
                            {live && level.next && (
                                <div className={styles.toNext}>
                                    <strong>{Math.max(0, level.next.value - height).toFixed(0)} cm</strong> below {level.next.label.toLowerCase()} ({level.next.value} cm)
                                </div>
                            )}
                            {live && !level.next && <div className={styles.toNext}>Above the highest level</div>}

                            <div className={styles.facts}>
                                <KeyValue
                                    rows={[
                                        {
                                            label: 'Sensor reading',
                                            value: last && last.distanceCm == null ? 'No echo' : `${cm(trueDistance(lastValid?.distanceCm, settings))} cm`,
                                        },
                                        { label: 'Source', value: sourceLabel(last) },
                                        { label: 'Saved', value: `${storage.saved} this session` },
                                    ]}
                                />
                            </div>
                        </div>
                    </div>
                </Card>

                {location}
            </div>

            <Card title="Height over time" meta={`${points.length} readings · last 10 min`} className={styles.chartCard}>
                {chartValues.length > 1 ? (
                    <LineChart
                        series={[{ id: 'height', values: chartValues, color: 'var(--water)', fill: true }]}
                        thresholds={FLOOD_LEVELS.filter((l) => l.value <= chartMax)}
                        min={chartMin}
                        max={chartMax}
                        unit=" cm"
                        height={240}
                        width={1160}
                        fontSize={12}
                    />
                ) : (
                    <p className={styles.empty}>The chart starts after two readings.</p>
                )}
            </Card>

            <div className={styles.bottom}>
                <Card title="System check" meta={<Chip tone={health.verdict.tone}>{health.verdict.text}</Chip>}>
                    <ul className={styles.checks}>
                        {health.rows.map((r) => (
                            <li key={r.label} className={styles.check}>
                                <StatusDot tone={r.tone} />
                                <span className={styles.checkLabel}>{r.label}</span>
                                <span className={styles.checkDetail}>{r.detail}</span>
                            </li>
                        ))}
                    </ul>
                </Card>

                <Card title="Settings" className={styles.settings}>
                    <div className={styles.field}>
                        <span className={styles.fieldLabel}>Sensor mount</span>
                        <Segmented options={MOUNTS} value={settings.mount} onChange={(mount) => setSettings({ mount })} />
                    </div>
                    {settings.mount === 'float' ? (
                        <>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Sound travels through</span>
                                <Segmented options={MEDIUMS} value={settings.medium} onChange={(medium) => setSettings({ medium })} />
                            </div>
                            <NumberField
                                label="Probe depth under the surface"
                                value={settings.probeDepthCm}
                                min={0}
                                onChange={(probeDepthCm) => setSettings({ probeDepthCm })}
                                hint="Depth = reading + probe depth"
                            />
                        </>
                    ) : (
                        <NumberField
                            label="Height to dry ground"
                            value={settings.referenceCm}
                            min={1}
                            onChange={(referenceCm) => setSettings({ referenceCm })}
                            hint="Level = height to dry ground − reading"
                        />
                    )}
                </Card>
            </div>
        </section>
    );
}

function NumberField({ label, value, min, onChange, hint }) {
    return (
        <label className={styles.field}>
            <span className={styles.fieldLabel}>{label}</span>
            <span className={styles.inputWrap}>
                <input
                    className={`${styles.input} mono`}
                    type="number"
                    min={min}
                    step="0.5"
                    value={value}
                    onChange={(e) => {
                        const n = Number(e.target.value);
                        if (e.target.value !== '' && Number.isFinite(n) && n >= min) onChange(n);
                    }}
                />
                <span className={styles.inputUnit}>cm</span>
            </span>
            {hint && <span className={styles.hint}>{hint}</span>}
        </label>
    );
}
