import styles from './CameraFeed.module.css';
import useVideoUrl from '../../hooks/useVideoUrl';
import { useAppData } from '../../context/AppDataContext';

// Drone camera view. The image stands in for the video stream until the backend
// provides one (swap the <img> for a <video> / WebRTC element).
export default function CameraFeed({
    mode = 'rgb',
    showDetections = true,
    recording = false,
    recordTime = '',
    highlightId = null,
}) {
    const { drone, site, fireSnapshots } = useAppData();
    const latest = fireSnapshots[0];
    const modeLabel = mode === 'thermal' ? 'Thermal' : 'RGB';
    const videoUrl = useVideoUrl().videoUrl;

    return (
        <div className={`${styles.feed} ${mode === 'thermal' ? styles.thermal : ''}`}>
            <video
                className={styles.media}
                src={videoUrl}
                autoPlay
                loop
                muted
                playsInline
            />

            {showDetections &&
                latest.detections.map((d) => (
                    <div
                        key={d.id}
                        className={`${styles.box} ${highlightId === d.id ? styles.boxHighlight : ''} ${highlightId && highlightId !== d.id ? styles.boxDim : ''}`}
                        style={{ left: `${d.box.x}%`, top: `${d.box.y}%`, width: `${d.box.w}%`, height: `${d.box.h}%` }}>
                        <span className={`${styles.boxLabel} mono`}>
                            {d.label} {d.confidence.toFixed(2)}
                        </span>
                    </div>
                ))}

            <div className={styles.topRight}>
                <span className={styles.pill}>
                    {recording && <span className={styles.recDot}></span>}
                    {recording ? `Rec ${recordTime}` : 'Live'} · {modeLabel}
                </span>
                <span className={`${styles.pill} mono`}>30 fps · {mode === 'thermal' ? 'IR' : '4K'}</span>
            </div>

            <div className={styles.bottom}>
                <span className={`${styles.pill} mono`}>{site.coords}</span>
                <span className={`${styles.pill} mono`}>
                    Alt {drone.altitudeRel.toFixed(0)} m · Hdg {String(drone.heading).padStart(3, '0')}°
                </span>
            </div>
        </div>
    );
}
