import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

// Fetches the active video URL from the backend config endpoint.
// Falls back to a default filename if the backend is unreachable.
// Both CameraFeed (Live) and MlFrame (Fire Assessment) use this hook
// so they always play whatever ACTIVE_VIDEO is set to in the backend .env.
export default function useVideoUrl(fallbackFilename = 'smoke.mp4') {
    const [videoUrl, setVideoUrl] = useState('');
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
                setLoading(false);
            })
            .catch((err) => {
                console.error('[useVideoUrl] Backend unreachable, using fallback:', err.message);
                // Fall back to the static path directly so the video still loads
                setVideoUrl(`${API_BASE_URL}/videos/${fallbackFilename}`);
                setError(true);
                setLoading(false);
            });
    }, [fallbackFilename]);

    return { videoUrl, loading, error };
}
