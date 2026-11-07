import { NavLink } from 'react-router-dom';
import { Radio, Flame, Waves, Drone, Map, History as HistoryIcon, Sun, Moon, ArrowUp, ArrowDown } from 'lucide-react';
import styles from './Sidebar.module.css';
import StatusDot from './StatusDot';
import useTheme from '../../hooks/useTheme';
import useNow from '../../hooks/useNow';
import useLatestDetection from '../../hooks/useLatestDetection';
import useDetectorControl from '../../hooks/useDetectorControl';
import { useAppData } from '../../context/AppDataContext';
import { useLocation } from '../../context/LocationContext';
import { useFloodSensorContext } from '../../context/FloodSensorContext';
import { floodSummary } from '../../utils/floodSensor';
import { threatTone, threatLabel, floodLevel } from '../ui/tones';
import { formatStatus } from '../ui/format';

const LOW_BATTERY = 30;
const CRITICAL_BATTERY = 15;

const DETECTOR_LABEL = {
    unknown: 'Checking…', running: 'Running', paused: 'Paused', starting: 'Starting…',
    stopped: 'Stopped', unmanaged: 'Second detector', offline: '—',
};
const DETECTOR_TONE = { running: 'ok', paused: 'caution', starting: 'caution', unmanaged: 'danger' };

// What the fire tile says. Tone is only set when the operator should look.
function fireStatus(result, live) {
    if (!live) return { value: 'No feed', sub: 'Detector not sending', muted: true };
    const hazard = result.primaryHazard;
    if (!hazard) return { value: 'Clear', sub: `Threat ${result.threatScore}` };
    const conf = hazard === 'fire' ? result.fire?.confidence : result.smoke?.confidence;
    const tone = threatTone(result.threatScore);
    return {
        value: `${hazard === 'fire' ? 'Fire' : 'Smoke'}${conf ? ` ${Math.round(conf)}%` : ''}`,
        sub: `Threat ${result.threatScore} · ${threatLabel(result.threatScore)}`,
        // A detection is always worth a look, even when the fused threat is still low
        tone: tone === 'ok' ? 'caution' : tone,
    };
}

function floodStatus(summary) {
    if (!summary.connected) return { value: 'Not connected', sub: 'Ground station', muted: true };
    if (summary.height == null) return { value: 'Waiting…', sub: 'No reading yet', muted: true };
    const level = floodLevel(summary.height);
    const t = summary.trend?.direction;
    return {
        value: `${Math.round(summary.height)} cm`,
        trend: t === 'RISING' ? 'up' : t === 'FALLING' ? 'down' : null,
        sub: summary.live ? level.label : 'No recent reading',
        tone: summary.live && level.tone !== 'ok' ? level.tone : undefined,
        muted: !summary.live,
    };
}

function flightStatus(drone) {
    let tone;
    if (drone.battery < CRITICAL_BATTERY) tone = 'danger';
    else if (drone.battery < LOW_BATTERY) tone = 'warn';
    else if (String(drone.link).toUpperCase() !== 'GOOD') tone = 'caution';
    return {
        value: `${drone.battery}%`,
        sub: `${drone.minutesLeft} min left · Link ${formatStatus(drone.link).toLowerCase()}`,
        tone,
    };
}

export default function SideBar() {
    const now = useNow();
    const [theme, toggleTheme] = useTheme();
    const { drone } = useAppData();
    const location = useLocation();
    const { result, live } = useLatestDetection();
    const detector = useDetectorControl();
    const sensor = useFloodSensorContext();
    const flood = floodSummary(sensor, now);
    const isLightMode = theme === 'light';
    const backendUp = detector.state !== 'offline';

    const items = [
        { to: '/live', label: 'Live feed', icon: Radio, status: { value: live ? 'Camera on' : 'No camera', muted: !live } },
        { to: '/fire', label: 'Fire', icon: Flame, status: fireStatus(result, live) },
        { to: '/flood', label: 'Flood', icon: Waves, status: floodStatus(flood) },
        { to: '/flight', label: 'Drone', icon: Drone, status: flightStatus(drone) },
        { to: '/map', label: 'Map', icon: Map, status: { value: `${drone.distanceHome} m`, sub: 'From home point' } },
        { to: '/history', label: 'History', icon: HistoryIcon, status: { value: 'Incidents', sub: 'Records and exports', muted: true } },
    ];

    const time = new Date(now).toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });

    return (
        <aside className={styles.container}>
            <div className={styles.head}>
                <div className={styles.mark}>DRMS</div>
                <div className={styles.site} title={location.live ? `${location.name} (this device)` : `${location.name} (default site)`}>
                    {location.shortName}
                </div>
            </div>

            <nav className={styles.nav} aria-label="Pages and live status">
                {items.map(({ to, label, icon: Icon, status }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                            [styles.tile, isActive && styles.active, status.tone && styles[status.tone]].filter(Boolean).join(' ')
                        }>
                        <Icon className={styles.icon} aria-hidden />
                        <span className={styles.label}>{label}</span>
                        <span className={`${styles.value} ${status.muted ? styles.muted : ''}`}>
                            {status.value}
                            {status.trend === 'up' && <ArrowUp className={styles.trend} aria-label="rising" />}
                            {status.trend === 'down' && <ArrowDown className={styles.trend} aria-label="falling" />}
                        </span>
                        {status.sub && <span className={styles.sub}>{status.sub}</span>}
                    </NavLink>
                ))}
            </nav>

            <div className={styles.system}>
                <div className={styles.sysRow}>
                    <StatusDot tone={backendUp ? 'ok' : 'danger'} />
                    <span>Backend</span>
                    <strong className={backendUp ? '' : styles.down}>{backendUp ? 'Online' : 'Offline'}</strong>
                </div>
                <div className={styles.sysRow}>
                    <StatusDot tone={DETECTOR_TONE[detector.state] ?? 'off'} />
                    <span>Detector</span>
                    <strong>{DETECTOR_LABEL[detector.state]}</strong>
                </div>
                <div className={styles.clock}>
                    <span className="mono">{time}</span> PHT
                </div>
                <button type="button" className={styles.theme} onClick={toggleTheme}>
                    {isLightMode ? <Moon aria-hidden /> : <Sun aria-hidden />}
                    {isLightMode ? 'Dark theme' : 'Light theme'}
                </button>
            </div>
        </aside>
    );
}
