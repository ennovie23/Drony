import { useMemo } from 'react';
import { LocationContext } from './LocationContext';
import { useAppData } from './AppDataContext';
import useDeviceLocation from '../hooks/useDeviceLocation';
import useFlightWeather from '../hooks/useFlightWeather';
import { isLiveLocation } from '../utils/flightWeather';

// One source for "where are we" across the app: this device's position (watched once, not
// per page) and the place name the backend gives it with the flight weather. Until the
// device has a fix, or if location is blocked, everything falls back to the configured site.
export default function LocationProvider({ children }) {
    const { site } = useAppData();
    const device = useDeviceLocation();
    const { weather, error: weatherError } = useFlightWeather(device.coords);
    const live = isLiveLocation(device, weather);

    const value = useMemo(() => {
        const name = live ? weather.location.name ?? 'This device' : `${site.area}, ${site.city}`;
        return {
            device,
            weather,
            weatherError,
            live,
            name,
            // First part of the name, for tight spots like the sidebar: "Deparo"
            shortName: live ? name.split(',')[0] : site.area.replace('Barangay ', ''),
            coords: live ? device.coords : null,
        };
    }, [device, weather, weatherError, live, site]);

    return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
