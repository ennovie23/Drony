import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import styles from './SensorPosition.module.css';
import { Card, Chip, KeyValue, Segmented } from '../ui';
import { mapEmbedUrl, sensorPositions } from '../../utils/floodSensor';

const ago = (ms) => (ms < 1000 ? 'just now' : ms < 60_000 ? `${Math.floor(ms / 1000)} s ago` : `${Math.floor(ms / 60_000)} min ago`);

// Where each flood sensor is, from the GPS on the sensor itself.
export default function SensorPosition({ readings, connected, now }) {
    const positions = sensorPositions(readings);
    const [chosen, setChosen] = useState(null);
    const shown = positions.find((p) => p.node === chosen) ?? positions[0];
    const fix = shown?.fix;
    const plainSerial = readings.at(-1)?.source === 'serial';

    let empty;
    if (!connected && !shown) empty = 'Connect the ground station to see where the sensor is.';
    else if (plainSerial && !shown) empty = 'This USB sensor has no GPS.';
    else if (!shown) empty = 'Waiting for the sensor’s first packet…';
    else if (!fix) empty = `Waiting for a GPS fix (${shown.satellites} satellites). The sensor needs open sky.`;

    const meta = fix && (shown.current ? <Chip tone="ok">GPS fix</Chip> : <Chip tone="warn">Last known</Chip>);

    return (
        <Card title="Sensor position" meta={meta} className={styles.card}>
            {positions.length > 1 && (
                <div className={styles.picker}>
                    <Segmented options={positions.map((p) => ({ key: p.node, label: p.node }))} value={shown.node} onChange={setChosen} />
                </div>
            )}

            {empty ? (
                <p className={styles.empty}>{empty}</p>
            ) : (
                <div className={styles.layout}>
                    <iframe
                        className={styles.map}
                        title={`Map of sensor ${shown.node}`}
                        src={mapEmbedUrl(fix.lat, fix.lng)}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                    />
                    <div className={styles.facts}>
                        <KeyValue
                            rows={[
                                { label: 'Sensor', value: <span className="mono">{shown.node}</span> },
                                { label: 'Latitude', value: <span className="mono">{fix.lat.toFixed(6)}</span> },
                                { label: 'Longitude', value: <span className="mono">{fix.lng.toFixed(6)}</span> },
                                { label: 'Satellites', value: fix.satellites },
                                { label: 'Fixed', value: ago(now - fix.timestamp) },
                            ]}
                        />
                        {!shown.current && <p className={styles.hint}>GPS lost its fix ({shown.satellites} satellites). Showing the last known position.</p>}
                        <div className={styles.links}>
                            <a href={`https://www.openstreetmap.org/?mlat=${fix.lat}&mlon=${fix.lng}#map=18/${fix.lat}/${fix.lng}`} target="_blank" rel="noreferrer">
                                OpenStreetMap <ExternalLink size={12} />
                            </a>
                            <a href={`https://www.google.com/maps?q=${fix.lat},${fix.lng}`} target="_blank" rel="noreferrer">
                                Google Maps <ExternalLink size={12} />
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}
