import styles from './Details.module.css'

export default function ModuleDetails() {
  return (
    <div>
      <div className={styles.statusColTitle}>
        <span>MODULE</span>
        <span>FIRE</span>
      </div>
      <div className={styles.statusTable}>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>CONNECTION</span>
          <span className={styles.valNominal}>
            <span className={styles.greenStatusDot}></span>
            <span>CONNECTED</span>
          </span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>ESP32</span>
          <span className={styles.valNominal}>
            <span className={styles.greenStatusDot}></span>
            <span>CONNECTED</span>
          </span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>LORA</span>
          <span className={styles.valNominal}>
            <span className={styles.greenStatusDot}></span>
            <span>GOOD</span>
          </span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>BATTERY</span>
          <span className={styles.statusValue}>61%</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>SENSOR</span>
          <span className={styles.valNominal}>
            <span className={styles.greenStatusDot}></span>
            <span>ACTIVE</span>
          </span>
        </div>
      </div>
    </div>
  );
}
