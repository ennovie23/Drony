import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import styles from './Live.module.css';
import TopBar from '../components/shared/TopBar';
import CameraFeed from '../components/shared/CameraFeed';
import FlightWeather from '../components/shared/FlightWeather';
import { Segmented, Button, Chip } from '../components/ui';
import FireVerdict from '../components/fire/FireVerdict';
import { useAppData } from '../context/AppDataContext';
import useLatestDetection from '../hooks/useLatestDetection';
import useVideoUrl, { switchVideoSource } from '../hooks/useVideoUrl';
import { formatElapsed } from '../utils/format';
import LocationLine from '../components/shared/LocationLine';
import { useLocation } from '../context/LocationContext';
import useNow from '../hooks/useNow';

const MODES = [
    { key: 'rgb', label: 'RGB' },
    { key: 'thermal', label: 'Thermal' },
];
const LOW_BATTERY = 30;
const SOURCES = [
    { key: 'file', label: 'Video file' },
    { key: 'webcam', label: 'Webcam' },
];

export default function Live() {
    useNow();
    const { drone, site } = useAppData();
    // The Live page is where detection is watched: feed boxes + this summary
    const { result, live } = useLatestDetection();
    // Where this device is: the header names it and the weather card forecasts for it
    const { device, weather, weatherError } = useLocation();
    const [mode, setMode] = useState('rgb');
    const [showDetections, setShowDetections] = useState(true);
    // Switching restarts detect.py on the other source
    const { source } = useVideoUrl();
    const [switching, setSwitching] = useState(false);
    const changeSource = async (next) => {
        if (next === source || switching) return;
        setSwitching(true);
        await switchVideoSource(next);
        setSwitching(false);
    };

    return (
        <div className={styles.page}>
            <TopBar
                title="Live feed"
                subtitle={<LocationLine />}
                actions={
                    <span>
                        Elapsed <span className="mono">{formatElapsed(site.startedAt)}</span>
                    </span>
                }
            />

            <div className={styles.layout}>
                <div className={styles.feedColumn}>
                    <div className={styles.feedBlock}>
                        <div className={styles.toolbar}>
                            <Segmented options={SOURCES} value={source} onChange={changeSource} />
                            <Segmented options={MODES} value={mode} onChange={setMode} />
                            <Button size="sm" onClick={() => setShowDetections(!showDetections)}>
                                {showDetections ? <Eye /> : <EyeOff />}
                                Detections {showDetections ? 'on' : 'off'}
                            </Button>
                        </div>
                        <div className={styles.feed}>
                            <CameraFeed live={live} mode={mode} showDetections={showDetections} />
                        </div>
                    </div>

                    <dl className={styles.instruments} aria-label="Drone instruments">
                        <div className={drone.battery < LOW_BATTERY ? styles.low : ''}>
                            <dt>Battery</dt>
                            <dd><span className={styles.num}>{drone.battery}</span>%<small>{drone.minutesLeft} min left</small></dd>
                        </div>
                        <div>
                            <dt>Altitude</dt>
                            <dd><span className={styles.num}>{drone.altitudeRel}</span>m<small>above home</small></dd>
                        </div>
                        <div>
                            <dt>Speed</dt>
                            <dd><span className={styles.num}>{drone.velocity}</span>m/s</dd>
                        </div>
                        <div>
                            <dt>Heading</dt>
                            <dd><span className={styles.num}>{String(drone.heading).padStart(3, '0')}</span>°</dd>
                        </div>
                        <div>
                            <dt>GPS</dt>
                            <dd><Chip value={drone.gps} /><small>{drone.satellites} satellites</small></dd>
                        </div>
                        <div>
                            <dt>Link</dt>
                            <dd><Chip value={drone.link} /><small>{drone.signal} dBm</small></dd>
                        </div>
                    </dl>
                </div>

                <aside className={styles.side}>
                    <FireVerdict result={result} live={live} compact meta={live ? 'Live' : 'Detector not sending'} />
                    <FlightWeather device={device} weather={weather} error={weatherError} className={styles.weather} />
                </aside>
            </div>
        </div>
    );
}
