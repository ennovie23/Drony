import styles from './AlertCard.module.css';

export default function AlertCard() {
  return (
    <div className={styles.alertCard}>
      <div className={styles.alertHeader}>
        <div className={styles.criticalBadge}>
          <span className={styles.redDot}></span>
          <span>CRITICAL</span>
        </div>
        <span className={styles.alertTime}>2 MIN AGO</span>
      </div>
      <p className={styles.alertMessage}>
        Flame front spreading toward the Package 6 access road — 2 confirmed
        detections.
      </p>
      <button className={styles.ackBtn}>ACKNOWLEDGE</button>
    </div>
  );
}
