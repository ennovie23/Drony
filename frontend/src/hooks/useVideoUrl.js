import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

// Fetches the active video source from the backend config endpoint.
// `source` is 'file' (play `videoUrl`) or 'webcam' (show the MJPEG `streamUrl`
// served by detect.py). Falls back to the file source if the backend is unreachable.
// CameraFeed (Live), MlFrame and AppDataProvider all use this hook so they follow
// whatever VIDEO_SOURCE / ACTIVE_VIDEO is set to in the backend .env, and refetch
// when switchVideoSource() changes it.
const SOURCE_CHANGED = 'drony:video-source-changed';

// Switches the backend (and detect.py) to 'file' or 'webcam'. Resolves to true on success.
export async function switchVideoSource(source) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/config/video`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        window.dispatchEvent(new Event(SOURCE_CHANGED));
        return true;
    } catch (err) {
        console.error('[useVideoUrl] Could not switch video source:', err.message);
        return false;
    }
}

export default function useVideoUrl(fallbackFilename = 'smoke.mp4') {
    const [videoUrl, setVideoUrl] = useState('');
    const [streamUrl, setStreamUrl] = useState(null);
    const [source, setSource] = useState('file');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const onChange = () => setVersion((v) => v + 1);
        window.addEventListener(SOURCE_CHANGED, onChange);
        return () => window.removeEventListener(SOURCE_CHANGED, onChange);
    }, []);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/config/video`)
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data) => {
                setVideoUrl(data.videoUrl);
                setStreamUrl(data.streamUrl ?? null);
                setSource(data.source === 'webcam' ? 'webcam' : 'file');
                setLoading(false);
            })
            .catch((err) => {
                console.error('[useVideoUrl] Backend unreachable, using fallback:', err.message);
                // Fall back to the static path directly so the video still loads
                setVideoUrl(`${API_BASE_URL}/videos/${fallbackFilename}`);
                setStreamUrl(null);
                setSource('file');
                setError(true);
                setLoading(false);
            });
    }, [fallbackFilename, version]);

    return { videoUrl, streamUrl, source, loading, error };
}
