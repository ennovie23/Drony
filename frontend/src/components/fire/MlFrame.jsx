import { useRef, useEffect, useState } from 'react';
import styles from './MlFrame.module.css';
import useVideoUrl from '../../hooks/useVideoUrl';
import { API_BASE_URL } from '../../config';

const CAMERA_UNAVAILABLE = 'Camera unavailable — check that the simulation is running';

// Live boxes from /api/detections/live → the snapshot detection shape.
const toDetection = (d, idx) => ({
    id: d.id ?? idx,
    label: d.label,
    confidence: Number(d.confidence),
    box: { x: d.bboxX1, y: d.bboxY1, w: d.bboxX2 - d.bboxX1, h: d.bboxY2 - d.bboxY1 },
});

// One drone frame as analysed by the fire model, with the model's bounding boxes
// labelled "<label> <score>". `small` renders a thumbnail without labels. Renders, in order:
//   - a webcam snapshot (`snapshot.imageUrl`): the saved JPEG with its saved boxes
//   - the live webcam stream (VIDEO_SOURCE=webcam) with live boxes while `playing`
//   - the test video file, played with live boxes while `playing`
export default function MlFrame({ snapshot, highlightId = null, small = false, tag, playing = false }) {
    const { videoUrl, streamUrl, source, loading } = useVideoUrl();
    const videoRef = useRef(null);

    const isSnapshotImage = Boolean(snapshot?.imageUrl);
    const isLiveStream = !isSnapshotImage && source === 'webcam' && !small;

    // Live detections fetched from /api/detections/live while simulation is running
    const [liveBoxes, setLiveBoxes] = useState([]);
    const [streamError, setStreamError] = useState(false);
    // Images are letterboxed at their own aspect ratio so % boxes line up (webcams are 4:3)
    const [aspect, setAspect] = useState('4 / 3');

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
        content = (
            <div className={styles.stage} style={{ aspectRatio: aspect }}>
                <img className={styles.fill} src={`${API_BASE_URL}${snapshot.imageUrl}`} alt="" onLoad={onImageLoad} />
                {renderBoxes(snapshot.detections ?? [], true)}
            </div>
        );
    } else if (isLiveStream) {
        content = playing && streamUrl && !streamError ? (
            <div className={styles.stage} style={{ aspectRatio: aspect }}>
                <img className={styles.fill} src={streamUrl} alt="" onLoad={onImageLoad} onError={() => setStreamError(true)} />
                {renderBoxes(liveBoxes.map(toDetection), false)}
            </div>
        ) : (
            <span className={styles.placeholder}>{CAMERA_UNAVAILABLE}</span>
        );
    } else {
        content = (
            <>
                <video
                    ref={videoRef}
                    className={styles.image}
                    src={videoUrl || undefined}
                    loop
                    muted
                    playsInline
                />
                {/* Live bounding boxes from detect.py (shown only in the main frame, not thumbnails) */}
                {!small && renderBoxes(liveBoxes.map(toDetection), false)}
            </>
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
