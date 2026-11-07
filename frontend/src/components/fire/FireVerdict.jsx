import styles from './FireVerdict.module.css';
import { Card, Chip, KeyValue } from '../ui';
import { SEVERITY_TONE, BEHAVIOR_TONE, THREAT_BANDS, threatTone, threatLabel, toneFor } from '../ui/tones';
import { formatStatus } from '../ui/format';

// What the fire model says right now (or about one saved frame), in the order an operator
// reads it: is there fire or smoke, how sure is the model, how bad, and which way is it going.
// `result` comes from toModelResult(); `live` is false when no frames are arriving.
export default function FireVerdict({ result, live = true, meta, compact = false }) {
    const hazard = live ? result?.primaryHazard : null;
    const score = result?.threatScore ?? 0;
    const tone = hazard ? (threatTone(score) === 'ok' ? 'caution' : threatTone(score)) : null;

    let headline;
    if (!live) headline = 'No camera feed';
    else if (hazard === 'fire') headline = 'Fire detected';
    else if (hazard === 'smoke') headline = 'Smoke detected';
    else headline = 'No fire or smoke';

    const fireConf = result?.fire?.confidence;
    const smokeConf = result?.smoke?.confidence;

    return (
        <Card title="Fire watch" meta={meta}>
            <div className={`${styles.banner} ${tone ? styles[tone] : live ? styles.clear : styles.idle}`} role="status">
                {headline}
            </div>

            {live && (
                <div className={styles.confs}>
                    <div>
                        <div className={`${styles.big} ${fireConf ? '' : styles.dim}`}>{fireConf ? `${fireConf}%` : '—'}</div>
                        <div className={styles.cap}>Fire confidence</div>
                    </div>
                    <div>
                        <div className={`${styles.big} ${smokeConf ? '' : styles.dim}`}>{smokeConf ? `${smokeConf}%` : '—'}</div>
                        <div className={styles.cap}>Smoke confidence</div>
                    </div>
                </div>
            )}

            <ThreatScale score={live ? score : null} />

            {!compact && (
                <div className={styles.rows}>
                    <KeyValue
                        rows={[
                            {
                                label: 'Severity',
                                value: result?.fire?.severity ? (
                                    <Chip tone={toneFor(SEVERITY_TONE, result.fire.severity)}>
                                        {formatStatus(result.fire.severity)}
                                        {result.fire.severityConf ? ` · ${result.fire.severityConf}%` : ''}
                                    </Chip>
                                ) : (
                                    <span className={styles.none}>None</span>
                                ),
                            },
                            {
                                label: 'Fire behaviour',
                                value: result?.fire?.trend ? (
                                    <Chip tone={toneFor(BEHAVIOR_TONE, result.fire.trend)} value={result.fire.trend} />
                                ) : (
                                    <span className={styles.none}>Standby</span>
                                ),
                            },
                            {
                                label: 'Smoke plume',
                                value: result?.smoke?.trend ? (
                                    <Chip tone={toneFor(BEHAVIOR_TONE, result.smoke.trend)} value={result.smoke.trend} />
                                ) : (
                                    <span className={styles.none}>Clear air</span>
                                ),
                            },
                        ]}
                    />
                </div>
            )}
        </Card>
    );
}

// 0–100 bar with the Elevated (40) and Critical (75) bands marked, so the number has context.
export function ThreatScale({ score }) {
    const known = score != null;
    const tone = known ? threatTone(score) : 'off';
    const pct = known ? Math.min(Math.max(score, 0), 100) : 0;
    return (
        <div className={styles.threat}>
            <div className={styles.threatHead}>
                <span>Threat score</span>
                <span className={`${styles.threatValue} ${styles[`t_${tone}`]}`}>
                    {known ? score : '—'}
                    <span className={styles.of}> / 100</span>
                    {known && <span className={styles.threatWord}>{threatLabel(score)}</span>}
                </span>
            </div>
            <div className={styles.track} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? score : undefined} aria-label="Threat score">
                {THREAT_BANDS.map((b) => (
                    <span key={b.from} className={`${styles.band} ${styles[`b_${b.tone}`]}`} style={{ left: `${b.from}%` }} />
                ))}
                {known && <span className={`${styles.fill} ${styles[`f_${tone}`]}`} style={{ width: `${pct}%` }} />}
            </div>
            <div className={styles.ticks}>
                <span style={{ left: 0 }}>0</span>
                {THREAT_BANDS.map((b) => (
                    <span key={b.from} style={{ left: `${b.from}%` }}>{b.from} {b.label.toLowerCase()}</span>
                ))}
            </div>
        </div>
    );
}
