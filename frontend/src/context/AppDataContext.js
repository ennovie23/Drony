import { createContext, useContext } from 'react';

export const AppDataContext = createContext(null);

export function useAppData() {
    const value = useContext(AppDataContext);
    if (!value) throw new Error('useAppData must be used inside AppDataProvider');
    return value;
}
