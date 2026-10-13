import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

// Fetches the active video source from the backend config endpoint.
// `source` is 'file' (play `videoUrl`) or 'webcam' (show the MJPEG `streamUrl`
// served by detect.py). Falls back to the file source if the backend is unreachable.
// CameraFeed (Live), MlFrame and AppDataProvider all use this hook so they follow
// whatever VIDEO_SOURCE / ACTIVE_VIDEO is set to in the backend .env.
export default function useVideoUrl(fallbackFilename = 'smoke.mp4') {
    const [videoUrl, setVideoUrl] = useState('');
    const [streamUrl, setStreamUrl] = useState(null);
    const [source, setSource] = useState('file');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

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
    }, [fallbackFilename]);

    return { videoUrl, streamUrl, source, loading, error };
}
