import { useRef, useEffect, useState } from 'react';
import styles from './MlFrame.module.css';
import useVideoUrl from '../../hooks/useVideoUrl';
import { API_BASE_URL } from '../../config';

// One drone snapshot as analysed by the fire model: the video feed with the model's
// bounding boxes labelled "<label> <score>". `small` renders a thumbnail without labels.
// When `playing` is true the video plays and live detections are polled from the backend.
export default function MlFrame({ snapshot, highlightId = null, small = false, tag, playing = false }) {
    const { videoUrl, loading } = useVideoUrl();
    const videoRef = useRef(null);

    // Live detections fetched from /api/detections/live while simulation is running
    const [liveBoxes, setLiveBoxes] = useState([]);

    // Play / pause the video element when `playing` changes
    useEffect(() => {
        const video = videoRef.current;
        if (!video || loading) return;
        if (playing) {
            video.play().catch(() => {}); // ignore autoplay policy errors
        } else {
            video.pause();
        }
    }, [playing, loading, videoUrl]);

    // Poll the live detections endpoint every 500 ms while simulation is running
    useEffect(() => {
        if (!playing || small) return;

        const poll = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/detections/live`);
                if (res.ok) {
                    const rows = await res.json();
                    setLiveBoxes(rows);
                }
            } catch {
                // backend not reachable – silently ignore
            }
        };

        poll(); // fetch immediately
        const id = setInterval(poll, 500);
        return () => clearInterval(id);
    }, [playing, small]);

    // Clear boxes when the simulation stops
    useEffect(() => {
        if (!playing) setLiveBoxes([]);
    }, [playing]);

    return (
        <div className={`${styles.frame} ${small ? styles.small : ''}`}>
            <video
                ref={videoRef}
                className={styles.image}
                src={videoUrl}
                loop
                muted
                playsInline
            />

            {/* Live bounding boxes from detect.py (shown only in the main frame, not thumbnails) */}
            {!small && liveBoxes.map((d) => {
                const x = d.bboxX1;
                const y = d.bboxY1;
                const w = d.bboxX2 - d.bboxX1;
                const h = d.bboxY2 - d.bboxY1;
                return (
                    <div
                        key={d.id}
                        className={styles.box}
                        style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
                    >
                        <span className={`${styles.label} mono`}>
                            {d.label} {Number(d.confidence).toFixed(2)}
                        </span>
                    </div>
                );
            })}

            {/* Snapshot bounding boxes (static analysis results) – kept for future use
            {snapshot?.detections?.map((d) => (
                <div
                    key={d.id}
                    className={`${styles.box} ${highlightId === d.id ? styles.boxOn : ''} ${highlightId && highlightId !== d.id ? styles.boxDim : ''}`}
                    style={{ left: `${d.box.x}%`, top: `${d.box.y}%`, width: `${d.box.w}%`, height: `${d.box.h}%` }}>
                    {!small && (
                        <span className={`${styles.label} mono`}>
                            {d.label} {d.confidence.toFixed(2)}
                        </span>
                    )}
                </div>
            ))} */}

            {!small && <span className={styles.frameTag}>{tag ?? `Frame ${snapshot.frame}`}</span>}
        </div>
    );
}
