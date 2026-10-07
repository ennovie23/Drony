import { useLocation } from 'react-router-dom';
import styles from './Header.module.css';
import StatusDot from './StatusDot';
import { useAppData } from '../../context/AppDataContext';
import useNow from '../../hooks/useNow';

const PAGE_NAMES = {
    '/live': 'Live',
    '/fire': 'Fire Assessment',
    '/flood': 'Flood Sensors',
    '/flight': 'Flight',
    '/map': 'Map',
};

export default function Header() {
    const now = useNow();
    const { pathname } = useLocation();
    const { drone } = useAppData();

    const timeString = new Date(now).toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    return (
        <header className={styles.header}>
            <div className={styles.leftSection}>
                <span>Disaster Response Management System</span>
                <span>•</span>
                <span>{PAGE_NAMES[pathname] ?? ''}</span>
            </div>

            <div className={styles.rightSection}>
                <div className={styles.statusIndicator}>
                    <StatusDot value={drone.link} />
                    <span>LINK {drone.link}</span>
                </div>

                <div className={styles.timestamp}>{timeString} PHT</div>

                <div className={styles.droneBadge}>
                    <StatusDot value={drone.flight} pulse={drone.flight === 'AIRBORNE'} />
                    <span>{drone.id} · {drone.flight}</span>
                </div>
            </div>
        </header>
    );
}
