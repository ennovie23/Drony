import { useEffect, useState } from 'react';
import styles from './MlFrame.module.css';
import useVideoUrl from '../../hooks/useVideoUrl';
import { API_BASE_URL } from '../../config';
import { toDetection } from '../../utils/snapshots';

const CAMERA_UNAVAILABLE = 'No camera connected — plug in a webcam';
const CAMERA_CONNECTING = 'Connecting to camera…';
const DETECTOR_STARTING = 'Starting the detector…';
const DETECTOR_STOPPED = 'Detector stopped — press Start to analyse';
// detect.py takes a while to load its models before the stream is up
const STREAM_RETRY_MS = 3000;


// One drone frame as analysed by the fire model, with the model's bounding boxes
// labelled "<label> <score>". `small` renders a thumbnail without labels. Renders, in order:
//   - a saved snapshot (`snapshot.imageUrl`): the JPEG with its saved boxes
//   - detect.py's live stream (webcam or test video) with live boxes while `playing`
// `playing` is true while the detector is sending frames (see useLatestDetection);
// `detectorState` comes from useDetectorControl: while 'paused' the stream stays up
// (the held video frame, or the live webcam) without live boxes.
export default function MlFrame({ snapshot, highlightId = null, small = false, tag, playing = false, detectorState }) {
    const { streamUrl, source } = useVideoUrl();
    const streaming = playing || detectorState === 'paused';

    const isSnapshotImage = Boolean(snapshot?.imageUrl);

    // Live detections fetched from /api/detections/live while simulation is running
    const [liveBoxes, setLiveBoxes] = useState([]);
    const [streamError, setStreamError] = useState(false);
    const [streamAttempt, setStreamAttempt] = useState(0);
    // Images are letterboxed at their own aspect ratio so % boxes line up (webcams are 4:3)
    const [aspect, setAspect] = useState('4 / 3');

    // Poll the live detections endpoint every 500 ms while simulation is running
    useEffect(() => {
        if (!playing || small || isSnapshotImage) return;

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
    }, [playing, small, isSnapshotImage]);

    // While running, keep retrying a stream that failed to load (e.g. models still loading)
    useEffect(() => {
        if (!streaming || !streamError) return;
        const id = setTimeout(() => {
            setStreamError(false);
            setStreamAttempt((n) => n + 1);
        }, STREAM_RETRY_MS);
        return () => clearTimeout(id);
    }, [streaming, streamError]);

    // Clear boxes when the simulation stops; retry the stream when it starts again
    const [prevPlaying, setPrevPlaying] = useState(playing);
    if (playing !== prevPlaying) {
        setPrevPlaying(playing);
        if (!playing) setLiveBoxes([]);
        else setStreamError(false);
    }

    const onImageLoad = (e) => {
        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
        if (w && h) setAspect(`${w} / ${h}`);
    };

    const renderBoxes = (detections, highlight) =>
        detections.map((d) => (
            <div
                key={d.id}
                className={`${styles.box} ${highlight && highlightId === d.id ? styles.boxOn : ''} ${highlight && highlightId && highlightId !== d.id ? styles.boxDim : ''}`}
                style={{ left: `${d.box.x}%`, top: `${d.box.y}%`, width: `${d.box.w}%`, height: `${d.box.h}%` }}>
                {!small && (
                    <span className={`${styles.label} mono`}>
                        {d.label} {d.confidence.toFixed(2)}
                    </span>
                )}
            </div>
        ));

    let content;
    if (isSnapshotImage) {
        const imageSrc = snapshot.imageUrl?.startsWith('http')
            ? snapshot.imageUrl
            : `${API_BASE_URL}${snapshot.imageUrl}`;
        content = (
            <div className={styles.stage} style={{ aspectRatio: aspect }}>
                <img className={styles.fill} src={imageSrc} alt="" onLoad={onImageLoad} />
                {renderBoxes(snapshot.detections ?? [], true)}
            </div>
        );
    } else if (small) {
        content = null;
    } else {
        content = streaming && streamUrl && !streamError ? (
            <div className={styles.stage} style={{ aspectRatio: aspect }}>
                <img
                    key={streamAttempt}
                    className={styles.fill}
                    src={`${streamUrl}?attempt=${streamAttempt}`}
                    alt=""
                    onLoad={onImageLoad}
                    onError={() => setStreamError(true)}
                />
                {renderBoxes(liveBoxes.map(toDetection), false)}
            </div>
        ) : (
            <span className={styles.placeholder}>
                {detectorState === 'stopped'
                    ? DETECTOR_STOPPED
                    : source !== 'webcam' ? DETECTOR_STARTING : playing ? CAMERA_CONNECTING : CAMERA_UNAVAILABLE}
            </span>
        );
    }

    const frameTag = tag ?? (snapshot ? `Frame ${snapshot.frame}` : null);

    return (
        <div className={`${styles.frame} ${small ? styles.small : ''}`}>
            {content}
            {!small && frameTag && <span className={styles.frameTag}>{frameTag}</span>}
        </div>
    );
}
