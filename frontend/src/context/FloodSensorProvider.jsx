import { FloodSensorContext } from './FloodSensorContext';
import useFloodSensor from '../hooks/useFloodSensor';

// Owns the USB connection to the flood sensor for the whole app, so it stays
// connected (and keeps saving readings) while the operator is on other pages.
export default function FloodSensorProvider({ children }) {
    const sensor = useFloodSensor();
    return <FloodSensorContext.Provider value={sensor}>{children}</FloodSensorContext.Provider>;
}
