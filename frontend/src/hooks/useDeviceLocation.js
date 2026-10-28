import { useEffect, useState } from 'react';

// This device's position from the browser (GPS on phones, Wi-Fi/IP on laptops), kept up
// to date as it moves. status: 'locating' | 'live' | 'denied' | 'unavailable'.
// Until there is a fix `coords` is null and callers fall back to the site.
export default function useDeviceLocation() {
    const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
    const [state, setState] = useState({ coords: null, accuracy: null, status: supported ? 'locating' : 'unavailable' });

    useEffect(() => {
        if (!supported) return undefined;
        const id = navigator.geolocation.watchPosition(
            (pos) => setState({
                coords: { lat: pos.coords.latitude, lon: pos.coords.longitude },
                accuracy: Math.round(pos.coords.accuracy),
                status: 'live',
            }),
            (err) => setState((s) => ({
                ...s,
                // Keep the last fix if the device briefly loses it
                status: err.code === err.PERMISSION_DENIED ? 'denied' : s.coords ? 'live' : 'unavailable',
            })),
            { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
        );
        return () => navigator.geolocation.clearWatch(id);
    }, [supported]);

    return state;
}
