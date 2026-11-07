import { createContext, useContext } from 'react';

export const LocationContext = createContext(null);

// Where the operator is: this device's live position and its place name, shared by every
// page header (see LocationProvider).
export function useLocation() {
    return useContext(LocationContext);
}
