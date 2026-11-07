import styles from './FloodGauge.module.css';
import { FLOOD_LEVELS, floodLevel } from '../ui/tones';

const W = 120;
const H = 240;
const PAD = { top: 10, bottom: 10 };
const TUBE = { x: 8, w: 44 };

// Vertical water gauge: the column fills to the current height, with the Minor /
// Moderate / Severe marks beside it. `height` is cm, or null when there's no live reading.
export default function FloodGauge({ height }) {
    const top = Math.max(FLOOD_LEVELS.at(-1).value * 1.2, (height ?? 0) * 1.1);
    const y = (cm) => PAD.top + (1 - cm / top) * (H - PAD.top - PAD.bottom);
    const level = floodLevel(height);
    const waterY = height == null ? null : y(Math.max(0, height));

    return (
        <svg className={styles.gauge} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={height == null ? 'No reading' : `Water at ${Math.round(height)} cm, ${level.label}`}>
            <rect x={TUBE.x} y={PAD.top} width={TUBE.w} height={H - PAD.top - PAD.bottom} className={styles.tube} />
            {waterY != null && (
                <rect x={TUBE.x} y={waterY} width={TUBE.w} height={y(0) - waterY} className={styles.water} />
            )}
            {FLOOD_LEVELS.map((l) => (
                <g key={l.label}>
                    <line x1={TUBE.x} x2={TUBE.x + TUBE.w + 8} y1={y(l.value)} y2={y(l.value)} className={styles.mark} style={{ stroke: l.color }} />
                    <text x={TUBE.x + TUBE.w + 12} y={y(l.value)} className={styles.label} dominantBaseline="middle">
                        {l.label}
                    </text>
                    <text x={TUBE.x + TUBE.w + 12} y={y(l.value) + 13} className={styles.value} dominantBaseline="middle">
                        {l.value} cm
                    </text>
                </g>
            ))}
            <line x1={TUBE.x - 4} x2={TUBE.x + TUBE.w + 4} y1={y(0)} y2={y(0)} className={styles.ground} />
            {waterY != null && <line x1={TUBE.x} x2={TUBE.x + TUBE.w} y1={waterY} y2={waterY} className={styles.surface} />}
        </svg>
    );
}
