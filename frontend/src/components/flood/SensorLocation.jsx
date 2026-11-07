import { useState } from 'react';
import { Copy, Check, MapPin, Satellite } from 'lucide-react';
import styles from './SensorLocation.module.css';
import { Card, Chip, Segmented, Button } from '../ui';
import LiveMap from './LiveMap';
import usePlaceName from '../../hooks/usePlaceName';
import { sensorPositions, secondsAgo } from '../../utils/floodSensor';

// A GPS needs at least four satellites for a position
const MIN_SATELLITES = 4;
// Recent fixes drawn behind the pin, so drift is visible
const TRAIL_POINTS = 40;

// A value that briefly lights up each time it changes, so a new GPS update is noticed.
function Live({ value, className = '' }) {
    return (
        <span key={value} className={`${styles.flash} ${className}`}>
            {value}
        </span>
    );
}

// Where the flood sensor is, from the GPS on the sensor: satellites in view, latitude and
// longitude as they arrive, and a map once it has a fix.
export default function SensorLocation({ readings, connected, now }) {
    const positions = sensorPositions(readings);
    const [chosen, setChosen] = useState(null);
    const [copied, setCopied] = useState(false);
    const shown = positions.find((p) => p.node === chosen) ?? positions[0];
    const fix = shown?.fix;
    const plainSerial = readings.at(-1)?.source === 'serial';
    const satellites = shown?.satellites ?? 0;
    const place = usePlaceName(fix ? { lat: fix.lat, lng: fix.lng } : null);
    const trail = shown
        ? readings.filter((r) => r.node === shown.node && r.gps?.fix).slice(-TRAIL_POINTS).map((r) => ({ lat: r.gps.lat, lng: r.gps.lng }))
        : [];

    let status;
    if (!connected && !shown) status = { chip: null, text: 'Connect the ground station to see where the sensor is.' };
    else if (plainSerial && !shown) status = { chip: <Chip tone="off">No GPS</Chip>, text: 'This USB sensor has no GPS.' };
    else if (!shown) status = { chip: <Chip tone="off">Waiting</Chip>, text: 'Waiting for the sensor’s first packet…' };
    else if (shown.chars === 0) status = { chip: <Chip tone="danger">No GPS data</Chip>, text: 'Nothing is coming from the GPS. Check its wiring and power.' };
    else if (shown.current) status = { chip: <Chip tone="ok">GPS fix</Chip> };
    else if (fix) status = { chip: <Chip tone="warn">Fix lost</Chip>, text: `Lost the fix (${satellites} satellites). Showing the last known position.` };
    else {
        const text = satellites < MIN_SATELLITES
            ? `Searching for a fix: ${satellites} of the ${MIN_SATELLITES} satellites needed. The sensor needs open sky.`
            : `Searching for a fix with ${satellites} satellites in view. This can take a minute after power-on.`;
        status = { chip: <Chip tone="caution">Searching</Chip>, text };
    }

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(`${fix.lat.toFixed(6)}, ${fix.lng.toFixed(6)}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // clipboard blocked: the numbers are on screen to copy by hand
        }
    };

    return (
        <Card title="Sensor location" meta={status.chip} className={styles.card}>
            {positions.length > 1 && (
                <div className={styles.picker}>
                    <Segmented options={positions.map((p) => ({ key: p.node, label: p.node }))} value={shown.node} onChange={setChosen} />
                </div>
            )}

            {shown && shown.chars !== 0 && (
                <dl className={styles.readout}>
                    <div className={styles.sats}>
                        <dt><Satellite aria-hidden /> Satellites</dt>
                        <dd className={satellites >= MIN_SATELLITES ? '' : styles.low}>
                            <Live value={satellites} />
                        </dd>
                    </div>
                    <div>
                        <dt>Latitude</dt>
                        <dd className={fix ? '' : styles.none}>{fix ? <Live value={fix.lat.toFixed(6)} /> : '—'}</dd>
                    </div>
                    <div>
                        <dt>Longitude</dt>
                        <dd className={fix ? '' : styles.none}>{fix ? <Live value={fix.lng.toFixed(6)} /> : '—'}</dd>
                    </div>
                </dl>
            )}

            {status.text && <p className={`${styles.note} ${fix ? '' : styles.noteBig}`}>{status.text}</p>}

            {fix && (
                <>
                    <div className={styles.place}>
                        <MapPin aria-hidden />
                        <div>
                            <div className={styles.placeName}>
                                {place.name ?? (place.state === 'error' ? 'Place name unavailable' : place.state === 'ready' ? 'Unnamed spot' : 'Finding the place…')}
                            </div>
                            <div className={styles.placeSub}>
                                Sensor <span className="mono">{shown.node}</span> · fixed {secondsAgo(now - fix.timestamp)}
                                {!shown.current && ' · last known position'}
                            </div>
                        </div>
                        <Button size="sm" onClick={copy}>
                            {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy coordinates'}
                        </Button>
                    </div>
                    <LiveMap
                        lat={fix.lat}
                        lng={fix.lng}
                        trail={trail}
                        label={`Sensor ${shown.node} at ${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}${place.name ? `, ${place.name}` : ''}`}
                    />
                </>
            )}
        </Card>
    );
}
