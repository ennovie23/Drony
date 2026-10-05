import styles from "./Details.module.css";

export default function DroneTelemetry() {
  return (
    <div>
      <div className={styles.statusColTitle}>
        <span>DRONE</span>
        <span>DRMS-01</span>
      </div>
      <div className={styles.statusTable}>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>BATTERY</span>
          <span className={styles.statusValue}>74%</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>GPS</span>
          <span className={styles.valNominal}>
            <span className={styles.greenStatusDot}></span>
            <span>FIXED</span>
          </span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>LINK</span>
          <span className={styles.valNominal}>
            <span className={styles.greenStatusDot}></span>
            <span>GOOD</span>
          </span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>STATUS</span>
          <span className={styles.valNominal}>
            <span className={styles.greenStatusDot}></span>
            <span>CONNECTED</span>
          </span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>FLIGHT</span>
          <span className={styles.valNominal}>
            <span className={styles.greenStatusDot}></span>
            <span>AIRBORNE</span>
          </span>
        </div>
      </div>
    </div>
  );
}
