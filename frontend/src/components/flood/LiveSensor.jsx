import { Usb, Unplug } from 'lucide-react';
import styles from './LiveSensor.module.css';
import { Card, Readout, Chip, KeyValue, Segmented, Button } from '../ui';
import LineChart from '../shared/LineChart';
import StatusDot from '../shared/StatusDot';
import { serialSupported } from '../../utils/floodSerial';
import { floodHeight, floodTrend, sensorHealth, staleAfter, trueDistance } from '../../utils/floodSensor';

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
const TREND_TONE = { RISING: 'danger', FALLING: 'ok', STEADY: 'off' };

const cm = (value) => (value == null ? '—' : value.toFixed(1));
const secondsAgo = (ms) => (ms < 1000 ? 'just now' : ms < 60_000 ? `${Math.floor(ms / 1000)} s ago` : `${Math.floor(ms / 60_000)} min ago`);

function sourceLabel(item) {
    if (!item) return '—';
    if (item.source === 'serial') return 'USB sensor';
    return `${item.source === 'usb' ? 'USB' : 'LoRa'} · ${item.node}`;
}

// Live flood sensor (ESP32 + JSN-SR04T + GPS) read over USB from the ground
// station: flood height, its trend, and a plain-language system check.
// `sensor` is useFloodSensor(), shared with the rest of the page.
export default function LiveSensor({ sensor, now }) {
    const { status, connectedAt, station, readings, problem, storage, clearProblem, settings, setSettings, connect, disconnect } = sensor;
    const connected = status === 'connected';
    const supported = serialSupported();

    const last = readings.at(-1);
    const lastValid = readings.findLast((r) => r.distanceCm != null);
    const live = connected && last && now - last.timestamp < staleAfter(last);
    const points = readings
        .filter((r) => r.distanceCm != null)
        .map((r) => ({ timestamp: r.timestamp, heightCm: floodHeight(r.distanceCm, settings) }));
    const height = lastValid ? floodHeight(lastValid.distanceCm, settings) : null;
    const trend = live ? floodTrend(points) : null;
    const health = sensorHealth({ status, station, last, now, connectedAt });

    const chartValues = points.slice(-CHART_POINTS).map((p) => p.heightCm);
    const chartMax = Math.max(50, ...chartValues) * 1.15;
    const chartMin = Math.min(0, ...chartValues);

    let heightSub;
    if (!last) heightSub = connected ? 'Waiting for the first reading…' : 'Not connected';
    else if (last.distanceCm == null) heightSub = 'Latest reading had no echo';
    else if (!live) heightSub = `Last reading ${secondsAgo(now - last.timestamp)}`;
    else if (trend) heightSub = trend.direction === 'STEADY' ? 'Steady' : `${Math.abs(trend.ratePerMin).toFixed(1)} cm/min`;
    else heightSub = 'Live';

    const action = connected ? (
        <Button size="sm" onClick={disconnect}>
            <Unplug /> Disconnect
        </Button>
    ) : (
        <Button size="sm" variant="primary" onClick={connect} disabled={!supported || status === 'connecting'}>
            <Usb /> {status === 'connecting' ? 'Choose a port…' : 'Connect'}
        </Button>
    );

    return (
        <section className={styles.section} aria-label="Live flood sensor">
            <div className={styles.head}>
                <h2 className={styles.title}>
                    <StatusDot tone={live ? 'ok' : connected ? 'warn' : 'off'} />
                    Live sensor
                </h2>
                <span className={styles.status}>
                    {connected ? (live ? `Receiving · ${sourceLabel(last)}` : 'Connected · no recent data') : 'Ground station over USB'}
                </span>
                {action}
            </div>

            {!supported && <p className={styles.notice}>Reading the sensor needs Chrome or Edge on a computer.</p>}
            {storage.error && <p className={styles.notice}>{storage.error}</p>}
            {problem && (
                <p className={styles.notice} role="alert">
                    {problem}
                    <button type="button" className={styles.dismiss} onClick={clearProblem}>
                        Dismiss
                    </button>
                </p>
            )}

            <div className={styles.grid}>
                <Card title="Flood height" meta={trend && trend.direction !== 'STEADY' && <Chip tone={TREND_TONE[trend.direction]}>{trend.direction === 'RISING' ? 'Rising' : 'Falling'}</Chip>}>
                    <Readout
                        label={settings.mount === 'float' ? 'Water depth' : 'Water level'}
                        value={cm(height)}
                        unit="cm"
                        sub={heightSub}
                        size="hero"
                        tone={live ? undefined : 'off'}
                    />
                    <div className={styles.facts}>
                        <KeyValue
                            rows={[
                                {
                                    label: 'Sensor reading',
                                    value: last && last.distanceCm == null ? 'No echo' : `${cm(trueDistance(lastValid?.distanceCm, settings))} cm`,
                                },
                                { label: 'Updated', value: last ? secondsAgo(now - last.timestamp) : '—' },
                                { label: 'Source', value: sourceLabel(last) },
                                { label: 'Saved', value: `${storage.saved} this session` },
                            ]}
                        />
                    </div>
                </Card>

                <Card title="Height over time" meta={`${points.length} readings`} className={styles.chartCard}>
                    {chartValues.length > 1 ? (
                        <LineChart
                            series={[{ id: 'height', values: chartValues, color: 'var(--water)', fill: true }]}
                            min={chartMin}
                            max={chartMax}
                            height={190}
                        />
                    ) : (
                        <p className={styles.empty}>The chart starts after two readings.</p>
                    )}
                </Card>

                <Card title="System check">
                    <div className={styles.verdict}>
                        <Chip tone={health.verdict.tone}>{health.verdict.text}</Chip>
                    </div>
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
                            />
                            <p className={styles.hint}>Depth = reading + probe depth</p>
                        </>
                    ) : (
                        <>
                            <NumberField
                                label="Height to dry ground"
                                value={settings.referenceCm}
                                min={1}
                                onChange={(referenceCm) => setSettings({ referenceCm })}
                            />
                            <p className={styles.hint}>Level = height to dry ground − reading</p>
                        </>
                    )}
                </Card>
            </div>
        </section>
    );
}

function NumberField({ label, value, min, onChange }) {
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
        </label>
    );
}
