import { useEffect, useRef, useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import styles from './LiveMap.module.css';

const TILE = 256;
const MIN_ZOOM = 13;
const MAX_ZOOM = 19;
const tileUrl = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

// Web Mercator: degrees → world pixels at zoom z
function project(lat, lng, z) {
    const size = TILE * 2 ** z;
    const s = Math.sin((lat * Math.PI) / 180);
    return {
        x: ((lng + 180) / 360) * size,
        y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size,
    };
}

// OpenStreetMap drawn right in the panel, centred on the sensor. The pin is the sensor's
// live position; the line behind it is where it has drifted (`trail`, oldest first).
export default function LiveMap({ lat, lng, trail = [], label }) {
    const box = useRef(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [zoom, setZoom] = useState(17);
    const [failed, setFailed] = useState(0);

    useEffect(() => {
        const el = box.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setSize({ w: Math.round(width), h: Math.round(height) });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const centre = project(lat, lng, zoom);
    const left = centre.x - size.w / 2;
    const top = centre.y - size.h / 2;
    const max = 2 ** zoom - 1;

    const tiles = [];
    if (size.w > 0) {
        for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.w) / TILE); tx += 1) {
            for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size.h) / TILE); ty += 1) {
                if (ty < 0 || ty > max) continue;
                const wx = ((tx % (max + 1)) + max + 1) % (max + 1);
                tiles.push({ key: `${zoom}/${tx}/${ty}`, src: tileUrl(zoom, wx, ty), x: tx * TILE - left, y: ty * TILE - top });
            }
        }
    }

    const path = trail
        .map((p) => project(p.lat, p.lng, zoom))
        .map((p) => `${(p.x - left).toFixed(1)},${(p.y - top).toFixed(1)}`)
        .join(' ');

    return (
        <div className={styles.map} ref={box} role="img" aria-label={label}>
            {tiles.map((t) => (
                <img
                    key={t.key}
                    className={styles.tile}
                    src={t.src}
                    alt=""
                    draggable="false"
                    style={{ left: t.x, top: t.y }}
                    onError={() => setFailed((n) => n + 1)}
                />
            ))}

            {trail.length > 1 && (
                <svg className={styles.overlay} width={size.w} height={size.h} aria-hidden>
                    <polyline points={path} className={styles.trail} />
                </svg>
            )}

            <span className={styles.pin} aria-hidden>
                <span className={styles.ring} />
                <span className={styles.dot} />
            </span>

            <div className={styles.zoom}>
                <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
                    <Plus />
                </button>
                <button type="button" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
                    <Minus />
                </button>
            </div>

            {failed > 0 && failed >= tiles.length && (
                <p className={styles.offline}>Map tiles need internet. The pin and coordinates are still live.</p>
            )}

            <a className={styles.credit} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                © OpenStreetMap contributors
            </a>
        </div>
    );
}
