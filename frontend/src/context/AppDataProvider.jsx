import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { AppDataContext } from './AppDataContext';
import * as mock from '../data/mock';
import useVideoUrl from '../hooks/useVideoUrl';
import { API_BASE_URL } from '../config';
import { toUiSnapshot } from '../utils/snapshots';

// How long a mock drop takes before the floating module starts reporting.
const DEPLOY_DELAY_MS = 4000;
// How long the mock ML model takes to analyse a new snapshot.
const ANALYSIS_DELAY_MS = 1500;
// Webcam mode: how often the snapshot strip refreshes, and how long a manual
// capture waits for its snapshot to show up.
const SNAPSHOT_POLL_MS = 2000;
const CAPTURE_TIMEOUT_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AppDataProvider({ children }) {
    const [modules, setModules] = useState(mock.modules);
    const [snapshots, setSnapshots] = useState(mock.fireSnapshots);
    const [analyzing, setAnalyzing] = useState(false);

    // VIDEO_SOURCE=webcam: snapshots are real frames saved by detect.py
    const { source: videoSource } = useVideoUrl();
    const [liveSnapshots, setLiveSnapshots] = useState([]);
    const latestLiveIdRef = useRef(null);

    const fetchLiveSnapshots = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/snapshots`);
            if (!res.ok) return null;
            const rows = (await res.json()).map(toUiSnapshot);
            latestLiveIdRef.current = rows[0]?.id ?? null;
            setLiveSnapshots(rows);
            return rows;
        } catch {
            return null; // backend not reachable – keep the current strip
        }
    }, []);

    useEffect(() => {
        if (videoSource !== 'webcam') return;
        const first = setTimeout(fetchLiveSnapshots, 0);
        const id = setInterval(fetchLiveSnapshots, SNAPSHOT_POLL_MS);
        return () => {
            clearTimeout(first);
            clearInterval(id);
        };
    }, [videoSource, fetchLiveSnapshots]);

    // Webcam: ask detect.py to save the next frame, then wait for it to land in the strip.
    const captureLiveSnapshot = useCallback(async () => {
        setAnalyzing(true);
        const beforeId = latestLiveIdRef.current;
        try {
            const res = await fetch(`${API_BASE_URL}/api/snapshots/capture`, { method: 'POST' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                console.error('[captureSnapshot]', body.message ?? `HTTP ${res.status}`);
                return;
            }
            const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
            while (Date.now() < deadline) {
                await sleep(500);
                const rows = await fetchLiveSnapshots();
                if (rows && rows[0]?.id !== beforeId) break;
            }
        } catch (err) {
            console.error('[captureSnapshot] Backend unreachable:', err.message);
        } finally {
            setAnalyzing(false);
        }
    }, [fetchLiveSnapshots]);

    // Ask the drone for a snapshot and run it through the fire model. Mock: reuses the
    // latest result with slightly shifted scores until the backend sends real frames.
    const captureMockSnapshot = useCallback(() => {
        setAnalyzing(true);
        setTimeout(() => {
            setSnapshots((prev) => {
                const last = prev[0];
                const nudge = (v) => Math.min(0.99, Math.max(0.05, v + (Math.random() - 0.5) * 0.1));
                const detections = last.detections.map((d) => ({ ...d, confidence: Number(nudge(d.confidence).toFixed(2)) }));
                const frame = last.frame + 5 + Math.floor(Math.random() * 10);
                return [
                    {
                        ...last,
                        id: `SNAP-${String(frame).padStart(3, '0')}`,
                        frame,
                        capturedAt: new Date().toISOString(),
                        detections,
                        fireConfidence: Number(Math.min(99.9, last.fireConfidence + (Math.random() - 0.4) * 4).toFixed(1)),
                    },
                    ...prev,
                ];
            });
            setAnalyzing(false);
        }, ANALYSIS_DELAY_MS);
    }, []);

    const deployModule = useCallback((moduleId, dropPoint) => {
        setModules((prev) => ({
            ...prev,
            [moduleId]: { ...prev[moduleId], status: 'DEPLOYING', dockSlot: null, place: dropPoint.place, position: dropPoint.position },
        }));

        setTimeout(() => {
            setModules((prev) => ({
                ...prev,
                [moduleId]: {
                    ...prev[moduleId],
                    status: 'DEPLOYED',
                    deployedAt: new Date().toISOString(),
                    // Mock first JSN reading once the module is floating.
                    distance: 192,
                    lastReadingAt: new Date().toISOString(),
                    history: [192],
                },
            }));
        }, DEPLOY_DELAY_MS);
    }, []);

    const recallModule = useCallback((moduleId) => {
        setModules((prev) => ({ ...prev, [moduleId]: { ...prev[moduleId], status: 'RECALLED' } }));
    }, []);

    const value = useMemo(
        () => ({
            drone: mock.drone,
            site: mock.site,
            map: mock.map,
            fireSnapshots: videoSource === 'webcam' ? liveSnapshots : snapshots,
            videoSource,
            analyzing,
            captureSnapshot: videoSource === 'webcam' ? captureLiveSnapshot : captureMockSnapshot,
            modules: Object.values(modules),
            deployModule,
            recallModule,
        }),
        [modules, snapshots, liveSnapshots, videoSource, analyzing, captureLiveSnapshot, captureMockSnapshot, deployModule, recallModule],
    );

    return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
