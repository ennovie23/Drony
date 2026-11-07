import styles from './TopBar.module.css';

// One header per page: title and context on the left, page actions on the right.
// Drone, link, backend state and the clock live in the sidebar, so they're on every page once.
export default function TopBar({ title, subtitle, actions }) {
    return (
        <header className={styles.bar}>
            <div className={styles.left}>
                <h1 className={styles.title}>{title}</h1>
                {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
            </div>
            {actions && <div className={styles.actions}>{actions}</div>}
        </header>
    );
}
