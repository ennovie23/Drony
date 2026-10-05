import styles from "./Details.module.css";

export default function DeviceDetails() {
  return (
    <div>
      <div className={styles.statusColTitle}>
        <span>FIRE DEVICES</span>
        <span>IN USE</span>
      </div>
      <div className={styles.statusTable}>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>CAMERA</span>
          <span className={styles.statusValue}>STREAMING</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>ML MODEL</span>
          <span className={styles.statusValue}>ACTIVE</span>
        </div>
      </div>
    </div>
  );
}
