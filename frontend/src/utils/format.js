const PHT = 'Asia/Manila';

export function formatTime(iso) {
    if (!iso) return '—';
    const time = new Date(iso).toLocaleTimeString('en-GB', { timeZone: PHT, hour: '2-digit', minute: '2-digit', hour12: false });
    return `${time} PHT`;
}

export function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso)
        .toLocaleDateString('en-GB', { timeZone: PHT, day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase();
}

// "T+00:46:12" style operation clock.
export function formatElapsed(fromIso, toIso) {
    if (!fromIso) return 'T+00:00:00';
    const end = toIso ? new Date(toIso) : new Date();
    const total = Math.max(0, Math.floor((end - new Date(fromIso)) / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    return `T+${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function timeAgo(iso) {
    const minutes = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (minutes < 1) return 'JUST NOW';
    if (minutes < 60) return `${minutes} MIN AGO`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} HR AGO`;
    return formatDate(iso);
}
