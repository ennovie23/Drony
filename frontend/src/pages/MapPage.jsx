import { useState } from 'react';
import styles from './MapPage.module.css';
import ui from '../components/shared/ui.module.css';
import PageHeader from '../components/shared/PageHeader';
import TacticalMap from '../components/shared/TacticalMap';
import DroneTelemetry from '../components/shared/DroneTelemetry';
import StatusTable from '../components/shared/StatusTable';
import StatusDot from '../components/shared/StatusDot';
import { useAppData } from '../context/AppDataContext';

const LAYERS = [
    { key: 'path', label: 'FLIGHT PATH' },
    { key: 'fire', label: 'FIRE' },
    { key: 'flood', label: 'FLOOD' },
];

const LEGEND = [
    { swatch: styles.swDrone, label: 'DRONE' },
    { swatch: styles.swPath, label: 'FLIGHT PATH' },
    { swatch: styles.swHome, label: 'HOME POINT' },
    { swatch: styles.swModule, label: 'FLOOD MODULE' },
    { swatch: styles.swFlame, label: 'FLAME' },
    { swatch: styles.swSmoke, label: 'SMOKE' },
    { swatch: styles.swWater, label: 'FLOOD WATER' },
];

export default function MapPage() {
    const { drone, site, modules } = useAppData();
    const [layers, setLayers] = useState({ path: true, fire: true, flood: true });
    const [selectedId, setSelectedId] = useState('drone');

    const selectedModule = modules.find((m) => m.id === selectedId);
    const toggle = (key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

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
                title="SITE MAP"
                subtitle={`${site.area} · ${site.coords}`}
                actions={
                    <div className={ui.segment}>
                        {LAYERS.map((l) => (
                            <button key={l.key} className={layers[l.key] ? ui.segmentOn : ''} onClick={() => toggle(l.key)}>
                                {l.label}
                            </button>
                        ))}
                    </div>
                }
            />

            <div className={styles.layout}>
                <div className={styles.mapArea}>
                    <TacticalMap
                        layers={layers}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        tall
                    />
                </div>

                <aside className={styles.side}>
                    <div className={ui.panel}>
                        <p className={ui.sectionTag}>— SELECTED</p>
                        {selectedId === 'drone' && <DroneTelemetry drone={drone} />}
                        {selectedModule && (
                            <StatusTable
                                title="JSN SENSOR"
                                tag={selectedModule.id}
                                rows={[
                                    { label: 'STATUS', value: selectedModule.status, dot: true },
                                    { label: 'PLACE', value: selectedModule.place },
                                    { label: 'LORA', value: selectedModule.lora, dot: true },
                                    { label: 'BATTERY', value: `${selectedModule.battery}%` },
                                    { label: 'DISTANCE', value: `${selectedModule.distance} cm` },
                                ]}
                            />
                        )}
                        {!selectedModule && selectedId !== 'drone' && <p className={ui.muted}>Click a marker on the map.</p>}
                    </div>

                    <div className={ui.panel}>
                        <p className={ui.sectionTag}>— POSITION</p>
                        <div className={styles.kv}>
                            <span>COORDINATES</span>
                            <span>{site.coords}</span>
                            <span>SECTOR</span>
                            <span>{site.sector}</span>
                            <span>ALTITUDE</span>
                            <span>{drone.altitudeRel} m REL</span>
                            <span>HEADING</span>
                            <span>{String(drone.heading).padStart(3, '0')}°</span>
                            <span>FROM HOME</span>
                            <span>{drone.distanceHome} m</span>
                        </div>
                    </div>

                    <div className={ui.panel}>
                        <p className={ui.sectionTag}>— LEGEND</p>
                        <div className={styles.legend}>
                            {LEGEND.map((l) => (
                                <span key={l.label} className={styles.legendItem}>
                                    <span className={`${styles.swatch} ${l.swatch}`}></span>
                                    {l.label}
                                </span>
                            ))}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
