import styles from './FloodAssessment.module.css';
import TopBar from '../components/shared/TopBar';
import LiveSensor from '../components/flood/LiveSensor';
import SensorPosition from '../components/flood/SensorPosition';
import useFloodSensor from '../hooks/useFloodSensor';
import useNow from '../hooks/useNow';

// Everything on this page comes from the flood sensor over USB: no mock data.
export default function FloodAssessment() {
    const now = useNow(1000);
    const sensor = useFloodSensor();

    return (
        <div className={styles.page}>
            <TopBar
                title="Flood sensors"
                subtitle="Floating JSN-SR04T sensor"
                actions={<span>Link ESP32 · LoRa</span>}
            />

            <div className={styles.body}>
                <LiveSensor sensor={sensor} now={now} />
                <SensorPosition readings={sensor.readings} connected={sensor.status === 'connected'} now={now} />
            </div>
        </div>
    );
}
