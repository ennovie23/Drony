import { useState } from 'react';
import styles from './MapPage.module.css';
import TopBar from '../components/shared/TopBar';
import TacticalMap from '../components/shared/TacticalMap';
import { Card, Chip, KeyValue, Segmented } from '../components/ui';
import { useAppData } from '../context/AppDataContext';

const LAYERS = [
    { key: 'path', label: 'Flight path' },
    { key: 'fire', label: 'Fire' },
    { key: 'flood', label: 'Flood' },
];

// Swatches use the same tokens TacticalMap draws with.
const LEGEND = [
    { swatch: styles.swDrone, label: 'Drone' },
    { swatch: styles.swPath, label: 'Flight path' },
    { swatch: styles.swHome, label: 'Home point' },
    { swatch: styles.swModule, label: 'Flood module' },
    { swatch: styles.swFlame, label: 'Flame' },
    { swatch: styles.swSmoke, label: 'Smoke' },
    { swatch: styles.swWater, label: 'Flood water' },
];

export default function MapPage() {
    const { drone, site, modules } = useAppData();
    const [layers, setLayers] = useState({ path: true, fire: true, flood: true });
    const [selectedId, setSelectedId] = useState('drone');

    const selectedModule = modules.find((m) => m.id === selectedId);
    const toggle = (key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

    return (
        <div className={styles.page}>
            <TopBar
                title="Site map"
                subtitle={`${site.area} · ${site.coords}`}
                actions={<Segmented options={LAYERS} value={layers} onChange={toggle} multi />}
            />

            <div className={styles.layout}>
                <div className={styles.mapArea}>
                    <TacticalMap layers={layers} selectedId={selectedId} onSelect={setSelectedId} tall />
                </div>

                <aside className={styles.side}>
                    {selectedId === 'drone' && (
                        <Card title="Selected · Drone" meta={<span className="mono">{drone.id}</span>}>
                            <KeyValue
                                rows={[
                                    { label: 'Battery', value: `${drone.battery}%` },
                                    { label: 'GPS', value: <Chip value={drone.gps} /> },
                                    { label: 'Link', value: <Chip value={drone.link} /> },
                                    { label: 'Status', value: <Chip value={drone.status} /> },
                                    { label: 'Flight', value: <Chip value={drone.flight} /> },
                                ]}
                            />
                        </Card>
                    )}
                    {selectedModule && (
                        <Card title="Selected · JSN sensor" meta={<span className="mono">{selectedModule.id}</span>}>
                            <KeyValue
                                rows={[
                                    { label: 'Status', value: <Chip value={selectedModule.status} /> },
                                    { label: 'Place', value: <span>{selectedModule.place}</span> },
                                    { label: 'LoRa', value: <Chip value={selectedModule.lora} /> },
                                    { label: 'Battery', value: `${selectedModule.battery}%` },
                                    { label: 'Distance', value: selectedModule.distance == null ? '—' : `${selectedModule.distance} cm` },
                                ]}
                            />
                        </Card>
                    )}
                    {!selectedModule && selectedId !== 'drone' && (
                        <Card title="Selected">
                            <p className={styles.hint}>Click a marker on the map.</p>
                        </Card>
                    )}

                    <Card title="Position" meta={site.sector}>
                        <KeyValue
                            rows={[
                                { label: 'Coordinates', value: site.coords },
                                { label: 'Altitude', value: `${drone.altitudeRel} m rel` },
                                { label: 'Heading', value: `${String(drone.heading).padStart(3, '0')}°` },
                                { label: 'From home', value: `${drone.distanceHome} m` },
                            ]}
                        />
                    </Card>

                    <Card title="Legend">
                        <div className={styles.legend}>
                            {LEGEND.map((l) => (
                                <span key={l.label} className={styles.legendItem}>
                                    <span className={`${styles.swatch} ${l.swatch}`}></span>
                                    {l.label}
                                </span>
                            ))}
                        </div>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
