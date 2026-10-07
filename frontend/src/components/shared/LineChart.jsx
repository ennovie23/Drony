import styles from './LineChart.module.css';

const W = 400;
const H = 160;
const PAD = { top: 10, right: 8, bottom: 20, left: 34 };

// Minimal SVG line chart. `series` is [{ id, values, color }]; `thresholds` draws
// labelled horizontal guides (e.g. flood depth levels).
export default function LineChart({ series, thresholds = [], max, unit = '', xLabels = [], height = H }) {
    const all = series.flatMap((s) => s.values);
    const top = max ?? Math.max(1, ...all, ...thresholds.map((t) => t.value)) * 1.1;
    const longest = Math.max(2, ...series.map((s) => s.values.length));
    const innerW = W - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;

    const x = (i) => PAD.left + (i / (longest - 1)) * innerW;
    const y = (v) => PAD.top + innerH - (v / top) * innerH;
    const ticks = [0, 0.5, 1].map((f) => Math.round(top * f * 10) / 10);

    return (
        <svg className={styles.chart} viewBox={`0 0 ${W} ${height}`} role="img">
            {ticks.map((t) => (
                <g key={t}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={styles.grid} />
                    <text x={PAD.left - 6} y={y(t)} className={styles.axis} textAnchor="end" dominantBaseline="middle">
                        {t}
                        {unit}
                    </text>
                </g>
            ))}

            {thresholds.map((t) => (
                <g key={t.label}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={y(t.value)} y2={y(t.value)} className={styles.threshold} style={{ stroke: t.color }} />
                    <text x={W - PAD.right} y={y(t.value) - 4} className={styles.axis} textAnchor="end" style={{ fill: t.color }}>
                        {t.label}
                    </text>
                </g>
            ))}

            {series.map((s) => {
                if (s.values.length < 2) return null;
                const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
                const last = s.values.length - 1;
                return (
                    <g key={s.id}>
                        {s.fill && (
                            <polygon
                                points={`${x(0)},${y(0)} ${points} ${x(last)},${y(0)}`}
                                fill={s.color}
                                fillOpacity="0.08"
                            />
                        )}
                        <polyline points={points} className={styles.line} style={{ stroke: s.color }} />
                        <circle cx={x(last)} cy={y(s.values[last])} r="3" fill={s.color} />
                    </g>
                );
            })}

            {xLabels.map((label, i) => (
                <text
                    key={i}
                    x={PAD.left + (i / Math.max(1, xLabels.length - 1)) * innerW}
                    y={height - 4}
                    className={styles.axis}
                    textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}>
                    {label}
                </text>
            ))}
        </svg>
    );
}
