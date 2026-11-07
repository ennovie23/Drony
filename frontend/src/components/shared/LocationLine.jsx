import styles from './LocationLine.module.css';
import { useLocation } from '../../context/LocationContext';
import { formatCoords } from '../../utils/flightWeather';

// The page-header location: the device's live position and place name, or the configured
// site (marked as such) until there is a fix. Same on every page.
export default function LocationLine() {
    const { live, name, coords, device } = useLocation();

    if (!live) {
        const why = device.status === 'denied' ? 'location blocked' : device.status === 'locating' ? 'finding this device' : 'no device location';
        return (
            <span className={styles.line} title={`Showing the default site: ${why}`}>
                {name}
                <span className={styles.note}> · default site</span>
            </span>
        );
    }
    return (
        <span className={styles.line} title={`This device's location, ±${device.accuracy} m`}>
            <span className={styles.liveDot} aria-hidden />
            {name}
            {' · '}
            <span className="mono">{formatCoords(coords.lat, coords.lon, 3)}</span>
        </span>
    );
}
