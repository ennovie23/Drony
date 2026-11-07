import { Usb, Unplug } from 'lucide-react';
import styles from './FloodAssessment.module.css';
import TopBar from '../components/shared/TopBar';
import StatusDot from '../components/shared/StatusDot';
import LiveSensor from '../components/flood/LiveSensor';
import SensorLocation from '../components/flood/SensorLocation';
import { Button } from '../components/ui';
import { useFloodSensorContext } from '../context/FloodSensorContext';
import { floodSummary, sourceLabel } from '../utils/floodSensor';
import { serialSupported } from '../utils/floodSerial';
import useNow from '../hooks/useNow';

// Everything on this page comes from the flood sensor over USB: no mock data.
export default function FloodAssessment() {
    const now = useNow(1000);
    const sensor = useFloodSensorContext();
    const { connected, live, last } = floodSummary(sensor, now);

    const connection = connected
        ? live ? `Receiving · ${sourceLabel(last)}` : 'Connected, no recent data'
        : 'Ground station over USB';

    return (
        <div className={styles.page}>
            <TopBar
                title="Flood"
                subtitle="Floating JSN-SR04T sensor · ESP32 over LoRa"
                actions={
                    <>
                        <span className={styles.link}>
                            <StatusDot tone={live ? 'ok' : connected ? 'caution' : 'off'} />
                            {connection}
                        </span>
                        {connected ? (
                            <Button onClick={sensor.disconnect}>
                                <Unplug /> Disconnect
                            </Button>
                        ) : (
                            <Button variant="primary" onClick={sensor.connect} disabled={!serialSupported() || sensor.status === 'connecting'}>
                                <Usb /> {sensor.status === 'connecting' ? 'Choose a port…' : 'Connect sensor'}
                            </Button>
                        )}
                    </>
                }
            />

            <div className={styles.body}>
                <LiveSensor
                    sensor={sensor}
                    now={now}
                    location={<SensorLocation readings={sensor.readings} connected={connected} now={now} />}
                />
            </div>
        </div>
    );
}
