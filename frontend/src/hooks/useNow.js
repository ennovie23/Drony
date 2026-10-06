import { useState, useEffect } from 'react';

// Re-renders the caller every `intervalMs` so clocks and "x min ago" labels stay fresh.
export default function useNow(intervalMs = 1000) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);

    return now;
}
