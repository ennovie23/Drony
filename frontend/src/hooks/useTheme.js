import { useState, useEffect, useCallback } from 'react';
import { readStoredTheme, writeStoredTheme } from './themeStorage';

// App theme: light by default, remembered across reloads when storage allows.
export default function useTheme() {
    const [theme, setTheme] = useState(() => readStoredTheme());

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        writeStoredTheme(theme);
    }, [theme]);

    const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);

    return [theme, toggleTheme];
}
