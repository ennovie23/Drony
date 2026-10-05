import styles from "./Live.module.css";
import fireImg from "../assets/fire.webp";
import AlertCard from '../components/shared/AlertCard';
import DroneTelemetry from '../components/shared/DroneTelemetry';
import ModuleDetails from '../components/shared/ModuleDetails';
import DeviceDetails from '../components/shared/DeviceDetails';

export default function Live() {
  return (
    <div className={styles.container}>
      <div className={styles.topSection}>
        <div className={styles.topLeft}>
          <div className={styles.droneCodeRow}>
            <p className={styles.droneCode}>DR-024</p>
            <div className={styles.activeStatus}>
              <span className={styles.greenDot}></span>
              <span>ACTIVE</span>
            </div>
          </div>

          <h1 className={styles.missionTitle}>FIRE ASSESSMENT</h1>
          <p className={styles.droneLocation}>
            BARANGAY BAGONG SILANG · CALOOCAN CITY, METRO MANILA
          </p>
        </div>

        <div className={styles.topRight}>
          <div className={styles.topRightItem}>
            <p className={styles.droneLocation}>MODULE</p>
            <p className={styles.topRightValue}>FIRE</p>
          </div>

          <div className={styles.topRightItem}>
            <p className={styles.droneLocation}>ELAPSED</p>
            <p className={styles.topRightValue}>T+00:46:12</p>
          </div>

          <div className={styles.topRightItem}>
            <p className={styles.droneLocation}>STARTED</p>
            <p className={styles.topRightValue}>14:22 PHT</p>
          </div>
        </div>
      </div>

      <div className={styles.middleSection}>
        <div className={styles.middleLeftSection}>
            <div className={styles.videoContainer}>
              <img className={styles.videoFeed} src={fireImg} alt="video_placeholder" />
            </div>
            <div className={styles.data}>
                <div className={styles.info}>
                    <p className={styles.infoLabel}>DETECTED</p>
                    <p className={styles.infoValue}>FIRE</p>
                </div>
                <div className={styles.info}>
                    <p className={styles.infoLabel}>DETECTION CONFIDENCE</p>
                    <p className={styles.infoValue}>96%</p>
                </div>
                <div className={styles.info}>
                    <p className={styles.infoLabel}>SEVERITY</p>
                    <p className={styles.infoValue}>MODERATE</p>
                </div>
                <div className={styles.info}>
                    <p className={styles.infoLabel}>BEHAVIOR</p>
                    <p className={styles.infoValue}>GROWING</p>
                </div>
            </div>
        </div>
        
        <div className={styles.middleRightSection}>
            <div className={styles.panelCard}>
                <p className={styles.panelLabel}>— ACTIVE ALERTS</p>
                <AlertCard styles={{margin: 0}}/>
            </div>
            <div className={styles.panelCard}>
                <DroneTelemetry/>
            </div>
            <div className={styles.panelCard}>
                <ModuleDetails/>
            </div>
            <div className={styles.panelCard}>
                <DeviceDetails/>
            </div>
        </div>
      </div>
    </div>
  );
}
