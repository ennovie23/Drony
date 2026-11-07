import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config';
import { metresBetween } from '../utils/floodSensor';

// Look the name up again only after the sensor has moved this far (metres)
const MOVE_M = 25;

// Street name for a GPS position from the backend (/api/place, OpenStreetMap Nominatim).
// GPS jitter doesn't trigger new lookups; only a move of more than MOVE_M does.
// state: 'idle' (no position) | 'loading' | 'ready' | 'error'.
export default function usePlaceName(position) {
    const [result, setResult] = useState({ name: null, state: 'loading' });
    const lastAt = useRef(null);
    const latest = useRef(0);
    const lat = position?.lat;
    const lng = position?.lng;

    useEffect(() => {
        if (lat == null) return;
        if (lastAt.current && metresBetween(lastAt.current, { lat, lng }) <= MOVE_M) return;
        lastAt.current = { lat, lng };
        const id = ++latest.current;
        // Only the newest lookup may set the name, so an old answer can't overwrite a newer one
        fetch(`${API_BASE_URL}/api/place?lat=${lat}&lon=${lng}`)
            .then((res) => res.json())
            .then((body) => {
                if (!body.success) throw new Error(body.error);
                if (id === latest.current) setResult({ name: body.data.name, state: 'ready' });
            })
            .catch(() => {
                if (id !== latest.current) return;
                lastAt.current = null; // try again on the next update
                setResult((prev) => ({ name: prev.name, state: 'error' }));
            });
    }, [lat, lng]);

    return lat == null ? { name: null, state: 'idle' } : result;
}
