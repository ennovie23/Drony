import styles from './Readout.module.css';

// One labelled number: label, big mono value + unit, optional sub-line.
export default function Readout({ label, value, unit, sub, tone, size = 'md' }) {
    return (
        <div className={styles.readout}>
            <div className={styles.label}>{label}</div>
            <div className={`${styles.value} ${styles[size]} ${tone ? styles[tone] : ''}`}>
                {value}
                {unit && <span className={styles.unit}>{unit}</span>}
            </div>
            {sub && <div className={styles.sub}>{sub}</div>}
        </div>
    );
}
