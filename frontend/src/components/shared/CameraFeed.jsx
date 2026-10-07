import styles from './CameraFeed.module.css';
import fireImg from '../../assets/fire.webp';
import { useAppData } from '../../context/AppDataContext';

// Drone camera view with HUD overlay. The image stands in for the video stream
// until the backend provides one (swap the <img> for a <video> / WebRTC element).
export default function CameraFeed({
    mode = 'rgb',
    showDetections = true,
    recording = false,
    recordTime = '',
    highlightId = null,
}) {
    const { drone, site, fireSnapshots } = useAppData();
    const latest = fireSnapshots[0];

    return (
        <div className={`${styles.feed} ${mode === 'thermal' ? styles.thermal : ''}`}>
            <img className={styles.media} src={fireImg} alt={`Drone camera over ${site.area}`} />

            <div className={styles.scanlines}></div>

            {/* Corner brackets */}
            <span className={`${styles.corner} ${styles.tl}`}></span>
            <span className={`${styles.corner} ${styles.tr}`}></span>
            <span className={`${styles.corner} ${styles.bl}`}></span>
            <span className={`${styles.corner} ${styles.br}`}></span>

            <div className={styles.hudTop}>
                <span className={styles.rec}>
                    <span className={`${styles.recDot} ${recording ? styles.recOn : ''}`}></span>
                    {recording ? `REC ${recordTime}` : 'LIVE'} · {mode === 'thermal' ? 'THERMAL' : 'RGB'}
                </span>
                <span>30 FPS · {mode === 'thermal' ? 'IR' : '4K'}</span>
            </div>

            <div className={styles.crosshair}></div>

            {showDetections &&
                latest.detections.map((d) => (
                    <div
                        key={d.id}
                        className={`${styles.box} ${highlightId === d.id ? styles.boxHighlight : ''} ${highlightId && highlightId !== d.id ? styles.boxDim : ''}`}
                        style={{ left: `${d.box.x}%`, top: `${d.box.y}%`, width: `${d.box.w}%`, height: `${d.box.h}%` }}>
                        <span className={styles.boxLabel}>
                            {d.label} {d.confidence.toFixed(2)}
                        </span>
                    </div>
                ))}

            <div className={styles.hudBottom}>
                <span>{site.coords}</span>
                <span>
                    ALT {drone.altitudeRel.toFixed(0)} M · HDG {String(drone.heading).padStart(3, '0')}°
                </span>
            </div>
        </div>
    );
}
