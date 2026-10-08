export const THEME_KEY = 'drms-theme';

// Storage can be missing (tests), blocked (privacy mode) or hold junk; every case falls back to light.
// Omitting the argument means "use localStorage"; it's read inside try because touching it can throw.
export function readStoredTheme(...args) {
    try {
        const storage = args.length === 0 ? globalThis.localStorage : args[0];
        const value = storage?.getItem(THEME_KEY);
        return value === 'dark' || value === 'light' ? value : 'light';
    } catch {
        return 'light';
    }
}

export function writeStoredTheme(theme, ...args) {
    try {
        const storage = args.length === 0 ? globalThis.localStorage : args[0];
        storage?.setItem(THEME_KEY, theme);
    } catch {
        // Not persisting is fine; the theme still applies for this session.
    }
}
