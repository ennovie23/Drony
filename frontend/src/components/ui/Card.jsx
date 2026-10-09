import styles from './Card.module.css';

// Surface with an optional header row: title on the left, meta on the right.
export default function Card({ title, meta, className = '', children }) {
    return (
        <section className={`${styles.card} ${className}`}>
            {(title || meta) && (
                <header className={styles.head}>
                    {title && <h2 className={styles.title}>{title}</h2>}
                    {meta && <div className={styles.meta}>{meta}</div>}
                </header>
            )}
            {children}
        </section>
    );
}
