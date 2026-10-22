import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { toDetection } from '../utils/snapshots';

const POLL_MS = 500;

// Polls detect.py's newest boxes while `enabled`. The backend returns [] once the
// detector stops, so the overlay clears by itself.
export default function useLiveDetections(enabled) {
    const [detections, setDetections] = useState([]);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        const poll = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/detections/live`);
                if (res.ok && !cancelled) setDetections((await res.json()).map(toDetection));
            } catch {
                // backend not reachable – keep the last boxes until it answers
            }
        };

        poll();
        const id = setInterval(poll, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [enabled]);

    return enabled ? detections : [];
}
