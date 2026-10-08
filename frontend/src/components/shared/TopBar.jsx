import styles from './TopBar.module.css';
import StatusDot from './StatusDot';
import { formatStatus } from '../ui/format';
import { useAppData } from '../../context/AppDataContext';
import useNow from '../../hooks/useNow';

// One header per page: title + subtitle on the left; page actions, drone state, link and clock on the right.
export default function TopBar({ title, subtitle, actions }) {
    const now = useNow();
    const { drone } = useAppData();

    const time = new Date(now).toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    return (
        <header className={styles.bar}>
            <div className={styles.left}>
                <h1 className={styles.title}>{title}</h1>
                {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
            </div>

            <div className={styles.right}>
                {actions && <div className={styles.actions}>{actions}</div>}
                <span className={styles.status}>
                    <StatusDot value={drone.flight} />
                    <span className="mono">{drone.id}</span> · {formatStatus(drone.flight)}
                </span>
                <span className={styles.status}>
                    <StatusDot value={drone.link} />
                    Link {formatStatus(drone.link)}
                </span>
                <span className={styles.clock}>
                    <span className="mono">{time}</span> PHT
                </span>
            </div>
        </header>
    );
}
