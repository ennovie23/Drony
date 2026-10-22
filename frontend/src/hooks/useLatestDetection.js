import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { toModelResult } from '../utils/snapshots';

const POLL_MS = 1000;
const IDLE = { timestamp: '', primaryHazard: null, threatScore: 0, fire: null, smoke: null };

// The detector's newest assessment, polled from /api/detections/latest.
// `live` is true while detect.py is sending frames, i.e. a camera is connected
// (or the test video is playing); the backend marks older results `stale`.
export default function useLatestDetection() {
    const [state, setState] = useState({ result: IDLE, live: false });

    useEffect(() => {
        let cancelled = false;
        const poll = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/detections/latest`);
                const body = await res.json();
                if (cancelled || !body.success || !body.data) return;
                setState({ result: toModelResult(body.data), live: !body.data.stale });
            } catch {
                if (!cancelled) setState({ result: IDLE, live: false });
            }
        };

        poll();
        const id = setInterval(poll, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);

    return state;
}
