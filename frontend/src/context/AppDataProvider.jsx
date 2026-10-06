import { useState, useCallback, useMemo } from 'react';
import { AppDataContext } from './AppDataContext';
import * as mock from '../data/mock';

// How long a mock drop takes before the floating module starts reporting.
const DEPLOY_DELAY_MS = 4000;
// How long the mock ML model takes to analyse a new snapshot.
const ANALYSIS_DELAY_MS = 1500;

export default function AppDataProvider({ children }) {
    const [modules, setModules] = useState(mock.modules);
    const [snapshots, setSnapshots] = useState(mock.fireSnapshots);
    const [analyzing, setAnalyzing] = useState(false);

    // Ask the drone for a snapshot and run it through the fire model. Mock: reuses the
    // latest result with slightly shifted scores until the backend sends real frames.
    const captureSnapshot = useCallback(() => {
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
            fireSnapshots: snapshots,
            analyzing,
            captureSnapshot,
            modules: Object.values(modules),
            deployModule,
            recallModule,
        }),
        [modules, snapshots, analyzing, captureSnapshot, deployModule, recallModule],
    );

    return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
