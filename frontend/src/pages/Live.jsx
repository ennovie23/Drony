import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import styles from './Live.module.css';
import TopBar from '../components/shared/TopBar';
import CameraFeed from '../components/shared/CameraFeed';
import TacticalMap from '../components/shared/TacticalMap';
import { Card, Readout, Chip, KeyValue, Segmented, Button } from '../components/ui';
import { useAppData } from '../context/AppDataContext';
import useLatestDetection from '../hooks/useLatestDetection';
import { threatTone } from '../components/ui/tones';
import { formatElapsed } from '../utils/format';
import useNow from '../hooks/useNow';

// Flight map shows only where the drone is and where it has flown.
const FLIGHT_LAYERS = { path: true, fire: false, flood: false };
const MODES = [
    { key: 'rgb', label: 'RGB' },
    { key: 'thermal', label: 'Thermal' },
];

export default function Live() {
    useNow();
    const { drone, site } = useAppData();
    // The Live page is where detection is watched: feed boxes + this summary
    const { result, live } = useLatestDetection();
    const hazard = result.primaryHazard;
    const confidence = hazard === 'fire' ? result.fire?.confidence : result.smoke?.confidence;
    const [mode, setMode] = useState('rgb');
    const [showDetections, setShowDetections] = useState(true);

    return (
        <div className={styles.page}>
            <TopBar
                title="Live feed"
                subtitle={`${site.area}, ${site.city}`}
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

                    <div className={styles.readouts}>
                        <Card><Readout label="Battery" value={drone.battery} unit="%" /></Card>
                        <Card><Readout label="Altitude" value={drone.altitudeRel} unit="m" /></Card>
                        <Card><Readout label="Speed" value={drone.velocity} unit="m/s" /></Card>
                        <Card><Readout label="Heading" value={String(drone.heading).padStart(3, '0')} unit="°" /></Card>
                    </div>
                </div>

                <aside className={styles.side}>
                    <Card title="Detection" meta={<span>{live ? 'Live' : 'No camera'}</span>}>
                        <KeyValue
                            rows={[
                                {
                                    label: 'Detected',
                                    value: hazard
                                        ? <Chip tone="danger">{hazard === 'fire' ? 'Fire' : 'Smoke'}</Chip>
                                        : <Chip tone={live ? 'ok' : 'off'}>{live ? 'Clear' : '—'}</Chip>,
                                },
                                { label: 'Confidence', value: <span className="mono">{confidence ? `${confidence}%` : '—'}</span> },
                                {
                                    label: 'Threat',
                                    value: <Chip tone={live ? threatTone(result.threatScore) : 'off'}>{`${result.threatScore} / 100`}</Chip>,
                                },
                            ]}
                        />
                    </Card>

                    <Card>
                        <KeyValue
                            rows={[
                                { label: 'GPS', value: <Chip value={drone.gps} /> },
                                { label: 'Link', value: <Chip value={drone.link} /> },
                            ]}
                        />
                    </Card>

                    <Card title="Flight map" meta={<span><span className="mono">{drone.distanceHome}</span> m from home</span>} className={styles.mapCard}>
                        <div className={styles.map}>
                            <TacticalMap layers={FLIGHT_LAYERS} compact />
                        </div>
                        <div className={`${styles.coords} mono`}>{site.coords}</div>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
