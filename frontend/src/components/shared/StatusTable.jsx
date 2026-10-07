import styles from './Details.module.css';
import StatusDot from './StatusDot';

// Titled two-column table. Rows with `dot: true` get a status-coloured dot.
export default function StatusTable({ title, tag, rows }) {
    return (
        <div>
            <div className={styles.statusColTitle}>
                <span>{title}</span>
                <span>{tag}</span>
            </div>
            <div className={styles.statusTable}>
                {rows.map(({ label, value, dot }) => (
                    <div key={label} className={styles.statusRow}>
                        <span className={styles.statusLabel}>{label}</span>
                        <span className={styles.statusValue}>
                            {dot && <StatusDot value={value} />}
                            <span>{value}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
