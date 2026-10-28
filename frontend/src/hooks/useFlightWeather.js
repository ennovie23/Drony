import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { weatherCell } from '../utils/flightWeather';

const POLL_MS = 5 * 60 * 1000;

// Weather + flight recommendation from /api/weather/flight for `coords` ({ lat, lon }),
// or for the configured site while `coords` is null. Refetches when the position moves
// into another ~1 km cell, and every 5 minutes.
// `weather` is null until the first answer; `error` is set when the backend can't get one.
export default function useFlightWeather(coords) {
    const [state, setState] = useState({ weather: null, error: null });
    const cell = weatherCell(coords);

    useEffect(() => {
        let cancelled = false;
        const query = cell ? `?lat=${cell.lat}&lon=${cell.lon}` : '';
        const poll = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/weather/flight${query}`);
                const body = await res.json();
                if (cancelled) return;
                if (body.success) setState({ weather: body.data, error: null });
                else setState((s) => ({ ...s, error: body.error }));
            } catch {
                if (!cancelled) setState((s) => ({ ...s, error: 'Backend unreachable' }));
            }
        };

        poll();
        const id = setInterval(poll, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
        // Only a move to another cell should refetch, not every small GPS jitter
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cell?.lat, cell?.lon]);

    return state;
}
