import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';

const POLL_MS = 2000;

// detect.py's run state from /api/detector plus start / pause / stop actions.
// state: 'unknown' (first check pending) | 'running' | 'paused' | 'starting' | 'stopped' |
// 'unmanaged' (a detect.py this backend didn't start is running) | 'offline' (backend unreachable).
// managed is false when detect.py was started by hand, which rules out start and stop.
export default function useDetectorControl() {
    const [status, setStatus] = useState({ state: 'unknown', managed: true });
    const [busy, setBusy] = useState(null); // the action in flight
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        try {
            const body = await (await fetch(`${API_BASE_URL}/api/detector/status`)).json();
            if (body.success) setStatus({ state: body.state, managed: body.managed });
        } catch {
            setStatus((s) => ({ ...s, state: 'offline' }));
        }
    }, []);

    useEffect(() => {
        const first = setTimeout(refresh, 0);
        const id = setInterval(refresh, POLL_MS);
        return () => {
            clearTimeout(first);
            clearInterval(id);
        };
    }, [refresh]);

    const run = useCallback(async (action) => {
        setBusy(action);
        setError(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/detector/${action}`, { method: 'POST' });
            const body = await res.json();
            if (!res.ok || !body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
            setStatus({ state: body.state, managed: body.managed });
        } catch (err) {
            setError(err.message === 'Failed to fetch' ? 'Backend not reachable' : err.message);
        } finally {
            setBusy(null);
        }
    }, []);

    return {
        ...status,
        busy,
        error,
        start: () => run('start'),
        pause: () => run('pause'),
        stop: () => run('stop'),
    };
}
