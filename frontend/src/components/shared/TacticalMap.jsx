import styles from './TacticalMap.module.css';
import StatusDot from './StatusDot';
import { useAppData } from '../../context/AppDataContext';

// Topographic site map. Marker positions are percentages of the frame; the SVG
// layer (path, zones, water) uses a 500 × 360 viewBox stretched to fit.
const DEFAULT_LAYERS = { path: true, fire: true, flood: true, dropPoints: false };

export default function TacticalMap({ layers = DEFAULT_LAYERS, dropPoints = [], selectedId, onSelect, tall = false, compact = false }) {
    const { map, site, drone, modules } = useAppData();
    const placed = modules.filter((m) => m.position && (m.status === 'DEPLOYED' || m.status === 'DEPLOYING'));
    const select = (id) => onSelect?.(id);

    return (
        <div className={`${styles.frame} ${tall ? styles.tall : ''} ${compact ? styles.compact : ''}`}>
            <div className={styles.overlayHeader}>
                <div className={styles.overlayLeft}>
                    <StatusDot tone="ok" />
                    <span>{compact ? 'FLIGHT PATH' : 'SITE OVERLAY'}</span>
                </div>
                <div className={styles.overlayRight}>
                    {!compact && <span>FIRE · FLOOD · TRACKING</span>}
                    <div className={styles.liveBadge}>
                        <StatusDot tone="ok" pulse />
                        <span>LIVE</span>
                    </div>
                </div>
            </div>

            <div className={styles.compass}>
                <span>N</span>
                <div className={styles.compassLine}></div>
            </div>

            <svg className={styles.canvas} viewBox="0 0 500 360" preserveAspectRatio="none">
                <defs>
                    <pattern id="siteGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" className={styles.gridLine} />
                    </pattern>
                </defs>

                <rect width="100%" height="100%" fill="url(#siteGrid)" />

                <path d="M 0,90 Q 120,110 240,80 T 500,120" className={styles.contour} />
                <path d="M 0,140 Q 150,170 300,120 T 500,170" className={styles.contour} />
                <path d="M 0,210 Q 160,250 320,180 T 500,240" className={styles.contour} />
                <ellipse cx="380" cy="140" rx="90" ry="70" className={styles.contour} />
                <ellipse cx="380" cy="140" rx="60" ry="45" className={styles.contour} />

                {layers.flood && <path d={map.water} className={styles.water} />}

                {layers.fire &&
                    map.zones.map((z, i) => (
                        <circle key={i} cx={z.cx} cy={z.cy} r={z.r} className={i === 0 ? styles.zoneInner : styles.zoneOuter} />
                    ))}

                {layers.path && <path d={map.path} className={styles.flightPath} />}
            </svg>

            <div className={styles.markerHome} style={{ left: `${map.home.x}%`, top: `${map.home.y}%` }}>
                <span className={styles.homeBox}>H</span>
            </div>

            {layers.fire &&
                map.hazards.map((h, i) => (
                    <div key={i} className={styles.marker} style={{ left: `${h.x}%`, top: `${h.y}%` }}>
                        <span className={h.kind === 'flame' ? styles.flameBox : styles.smokeBox}>{h.kind.toUpperCase()}</span>
                        <div className={h.kind === 'flame' ? styles.flameRing : styles.smokeRing}></div>
                    </div>
                ))}

            {layers.dropPoints &&
                dropPoints.map((p) => (
                    <button
                        key={p.id}
                        className={`${styles.marker} ${styles.dropPoint} ${selectedId === p.id ? styles.selected : ''}`}
                        style={{ left: `${p.position.x}%`, top: `${p.position.y}%` }}
                        onClick={() => select(p.id)}>
                        <span className={styles.dropRing}></span>
                        <span className={styles.dropLabel}>{p.id}</span>
                    </button>
                ))}

            {layers.flood &&
                placed.map((m) => (
                    <button
                        key={m.id}
                        className={`${styles.markerModule} ${selectedId === m.id ? styles.selected : ''}`}
                        style={{ left: `${m.position.x}%`, top: `${m.position.y}%` }}
                        onClick={() => select(m.id)}>
                        <div className={styles.moduleBox}>
                            <div className={styles.moduleDot}></div>
                        </div>
                        <div className={styles.moduleText}>
                            <div className={styles.moduleLabel}>
                                {m.id}
                                {m.status === 'DEPLOYED' && <span className={styles.moduleLevel}> · {m.distance} CM</span>}
                            </div>
                            <div className={styles.moduleSub}>{m.status}</div>
                        </div>
                    </button>
                ))}

            <button
                className={`${styles.markerDrone} ${selectedId === 'drone' ? styles.selected : ''}`}
                style={{ left: `${map.drone.x}%`, top: `${map.drone.y}%` }}
                onClick={() => select('drone')}>
                <span className={styles.droneIcon}>
                    <span></span>
                </span>
                <span className={styles.droneAlt}>ALT {Math.round(drone.altitudeRel)}M</span>
            </button>

            <div className={styles.overlayFooter}>
                <div className={styles.scaleBar}>
                    <span>—</span>
                    <span>100 M</span>
                    <span>—</span>
                </div>
                <span className={styles.sectorBadge}>{site.sector}</span>
            </div>
        </div>
    );
}
