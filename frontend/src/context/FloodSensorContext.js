import { createContext, useContext } from 'react';

export const FloodSensorContext = createContext(null);

// The one flood-sensor connection, shared by the Flood page and the sidebar.
export function useFloodSensorContext() {
    return useContext(FloodSensorContext);
}
