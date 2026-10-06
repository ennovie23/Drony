import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import styles from './Live.module.css';
import ui from '../components/shared/ui.module.css';
import PageHeader from '../components/shared/PageHeader';
import CameraFeed from '../components/shared/CameraFeed';
import TacticalMap from '../components/shared/TacticalMap';
import StatusDot from '../components/shared/StatusDot';
import { useAppData } from '../context/AppDataContext';
import { formatElapsed } from '../utils/format';
import useNow from '../hooks/useNow';

// Flight map shows only where the drone is and where it has flown.
const FLIGHT_LAYERS = { path: true, fire: false, flood: false };

export default function Live() {
    useNow();
    const { drone, site } = useAppData();
    const [mode, setMode] = useState('rgb');
    const [showDetections, setShowDetections] = useState(true);

    const status = [
        { label: 'BATTERY', value: `${drone.battery}%` },
        { label: 'ALTITUDE', value: `${drone.altitudeRel} m` },
        { label: 'SPEED', value: `${drone.velocity} m/s` },
        { label: 'HEADING', value: `${String(drone.heading).padStart(3, '0')}°` },
        { label: 'GPS', value: drone.gps, dot: true },
        { label: 'LINK', value: drone.link, dot: true },
    ];

    return (
        <div className={styles.container}>
            <PageHeader
                eyebrow={
                    <>
                        <span>{drone.id}</span>
                        <span className={ui.status}>
                            <StatusDot value={drone.flight} pulse />
                            {drone.flight}
                        </span>
                    </>
                }
                title="LIVE FEED"
                subtitle={`${site.area} · ${site.city}`}
                stats={[{ label: 'ELAPSED', value: formatElapsed(site.startedAt) }]}
            />

            <div className={styles.layout}>
                <div className={styles.feedColumn}>
                    <div className={styles.toolbar}>
                        <div className={ui.segment}>
                            <button className={mode === 'rgb' ? ui.segmentOn : ''} onClick={() => setMode('rgb')}>RGB</button>
                            <button className={mode === 'thermal' ? ui.segmentOn : ''} onClick={() => setMode('thermal')}>THERMAL</button>
                        </div>
                        <button className={`${ui.btn} ${ui.btnSmall}`} onClick={() => setShowDetections(!showDetections)}>
                            {showDetections ? <Eye size={12} /> : <EyeOff size={12} />}
                            <span>DETECTIONS {showDetections ? 'ON' : 'OFF'}</span>
                        </button>
                    </div>
                    <div className={styles.feed}>
                        <CameraFeed mode={mode} showDetections={showDetections} />
                    </div>
                </div>

                <aside className={styles.side}>
                    <section className={styles.section}>
                        <p className={styles.sectionLabel}>— DRONE STATUS</p>
                        <div className={styles.statusGrid}>
                            {status.map((s) => (
                                <div key={s.label} className={styles.statusItem}>
                                    <p className={ui.label}>{s.label}</p>
                                    <p className={styles.statusValue}>
                                        {s.dot && <StatusDot value={s.value} />}
                                        {s.value}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className={styles.section}>
                        <p className={styles.sectionLabel}>— FLIGHT MAP</p>
                        <TacticalMap layers={FLIGHT_LAYERS} compact />
                        <div className={styles.mapFoot}>
                            <span>{site.coords}</span>
                            <span>{drone.distanceHome} M FROM HOME</span>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
