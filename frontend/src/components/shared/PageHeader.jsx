import styles from './PageHeader.module.css';

// Title strip used at the top of every page: eyebrow line, big title, subtitle,
// and either a row of stats or custom actions on the right.
export default function PageHeader({ eyebrow, title, subtitle, stats, actions }) {
    return (
        <div className={styles.header}>
            <div className={styles.left}>
                {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
                <h1 className={styles.title}>{title}</h1>
                {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>

            {stats && (
                <div className={styles.stats}>
                    {stats.map(({ label, value }) => (
                        <div key={label} className={styles.stat}>
                            <p className={styles.subtitle}>{label}</p>
                            <p className={styles.statValue}>{value}</p>
                        </div>
                    ))}
                </div>
            )}

            {actions && <div className={styles.actions}>{actions}</div>}
        </div>
    );
}
