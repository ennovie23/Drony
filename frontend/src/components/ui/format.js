// Backend status words arrive upper-case ('BLIND ZONE'); the UI shows them in sentence case.
export function formatStatus(word) {
    if (word == null || word === '') return '—';
    const lower = String(word).toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}
