import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { AppDataContext } from './AppDataContext';
import * as mock from '../data/mock';
import useVideoUrl from '../hooks/useVideoUrl';
import { API_BASE_URL } from '../config';
import { toUiSnapshot } from '../utils/snapshots';

// How long a mock drop takes before the floating module starts reporting.
const DEPLOY_DELAY_MS = 4000;
// How often the snapshot strip refreshes, and how long a manual capture waits for
// its snapshot to show up.
const SNAPSHOT_POLL_MS = 2000;
const CAPTURE_TIMEOUT_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AppDataProvider({ children }) {
    const [modules, setModules] = useState(mock.modules);
    const [analyzing, setAnalyzing] = useState(false);

    // Snapshots are real frames saved by detect.py, from the webcam or the test video
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
        const first = setTimeout(fetchLiveSnapshots, 0);
        const id = setInterval(fetchLiveSnapshots, SNAPSHOT_POLL_MS);
        return () => {
            clearTimeout(first);
            clearInterval(id);
        };
    }, [fetchLiveSnapshots]);

    // Ask detect.py to save the next frame, then wait for it to land in the strip.
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

    // Delete every saved snapshot. Returns false if the backend refused.
    const clearSnapshots = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/snapshots`, { method: 'DELETE' });
            if (!res.ok) return false;
            latestLiveIdRef.current = null;
            setLiveSnapshots([]);
            return true;
        } catch (err) {
            console.error('[clearSnapshots] Backend unreachable:', err.message);
            return false;
        }
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
            fireSnapshots: liveSnapshots,
            videoSource,
            analyzing,
            captureSnapshot: captureLiveSnapshot,
            clearSnapshots,
            modules: Object.values(modules),
            deployModule,
            recallModule,
        }),
        [modules, liveSnapshots, videoSource, analyzing, captureLiveSnapshot, clearSnapshots, deployModule, recallModule],
    );

    return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
