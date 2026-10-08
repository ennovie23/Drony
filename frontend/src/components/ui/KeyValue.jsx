import styles from './KeyValue.module.css';

// Label/value rows. Plain strings and numbers render in mono; nodes (chips etc.) render as-is.
export default function KeyValue({ rows }) {
    return (
        <dl className={styles.list}>
            {rows.map(({ label, value }) => {
                const plain = typeof value === 'string' || typeof value === 'number';
                return (
                    <div key={label} className={styles.row}>
                        <dt className={styles.label}>{label}</dt>
                        <dd className={`${styles.value} ${plain ? 'mono' : ''}`}>{value}</dd>
                    </div>
                );
            })}
        </dl>
    );
}
