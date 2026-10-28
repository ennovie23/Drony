import { useEffect, useState } from 'react';
import styles from './CameraFeed.module.css';
import useVideoUrl from '../../hooks/useVideoUrl';
import useLiveDetections from '../../hooks/useLiveDetections';
import { useAppData } from '../../context/AppDataContext';

// The stream can briefly fail while detect.py (re)starts, so keep retrying
const STREAM_RETRY_MS = 3000;
const NO_CAMERA = 'No camera connected — plug in a webcam';
const NO_DETECTOR = 'Starting the detector…';

// Drone camera view: detect.py's stream of the frames it analysed (webcam or test
// video) with the model's live boxes for those frames.
// `live` (from useLatestDetection) is true while the detector is sending frames.
export default function CameraFeed({
    live = false,
    mode = 'rgb',
    showDetections = true,
    recording = false,
    recordTime = '',
    highlightId = null,
}) {
    const { drone, site } = useAppData();
    const { streamUrl, source } = useVideoUrl();
    const isWebcam = source === 'webcam';
    const detections = useLiveDetections(live && showDetections);
    const modeLabel = mode === 'thermal' ? 'Thermal' : 'RGB';

    const [streamError, setStreamError] = useState(false);
    const [streamAttempt, setStreamAttempt] = useState(0);
    // Boxes are percentages of the image, so the stage takes the stream's aspect ratio
    const [aspect, setAspect] = useState('4 / 3');

    useEffect(() => {
        if (!streamError) return;
        const id = setTimeout(() => {
            setStreamError(false);
            setStreamAttempt((n) => n + 1);
        }, STREAM_RETRY_MS);
        return () => clearTimeout(id);
    }, [streamError]);

    const onStreamLoad = (e) => {
        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
        if (w && h) setAspect(`${w} / ${h}`);
    };

    const boxes =
        showDetections &&
        detections.map((d) => (
            <div
                key={d.id}
                className={`${styles.box} ${highlightId === d.id ? styles.boxHighlight : ''} ${highlightId && highlightId !== d.id ? styles.boxDim : ''}`}
                style={{ left: `${d.box.x}%`, top: `${d.box.y}%`, width: `${d.box.w}%`, height: `${d.box.h}%` }}>
                <span className={`${styles.boxLabel} mono`}>
                    {d.label} {d.confidence.toFixed(2)}
                </span>
            </div>
        ));

    let media;
    if (!streamUrl || !live || streamError) {
        media = <span className={styles.placeholder}>{isWebcam ? NO_CAMERA : NO_DETECTOR}</span>;
    } else {
        media = (
            <div className={styles.stage} style={{ aspectRatio: aspect }}>
                <img
                    key={streamAttempt}
                    className={styles.stream}
                    src={`${streamUrl}?attempt=${streamAttempt}`}
                    alt=""
                    onLoad={onStreamLoad}
                    onError={() => setStreamError(true)}
                />
                {boxes}
            </div>
        );
    }

    return (
        <div className={`${styles.feed} ${mode === 'thermal' ? styles.thermal : ''}`}>
            {media}

            <div className={styles.topRight}>
                <span className={styles.pill}>
                    {recording && <span className={styles.recDot}></span>}
                    {recording ? `Rec ${recordTime}` : 'Live'} · {modeLabel}
                </span>
                <span className={`${styles.pill} mono`}>
                    {isWebcam ? 'Webcam' : 'Test video'}
                </span>
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
