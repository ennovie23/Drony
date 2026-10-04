import { Gauge, Radio, RotateCcwClock, Sun, Moon } from 'lucide-react';
import styles from './Sidebar.module.css';
import { useState, useEffect } from 'react';

export default function SideBar({ activeTab, setActiveTab }) {
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isLightMode ? 'light' : 'dark');
  }, [isLightMode]);

  return (
    <aside className={styles.container}>
      <div id={styles.titleBox}>
        <span>DRMS</span>
      </div>

      <div
        className={`${styles.iconBox} ${activeTab === 'dashboard' ? styles.active : ''}`}
        onClick={() => setActiveTab('dashboard')}>
        <Gauge />
        <span className={styles.iconText}>Dashboard</span>
      </div>

      <div
        className={`${styles.iconBox} ${activeTab === 'live' ? styles.active : ''}`}
        onClick={() => setActiveTab('live')}>
        <Radio />
        <span className={styles.iconText}>Live</span>
      </div>

      <div
        className={`${styles.iconBox} ${activeTab === 'history' ? styles.active : ''}`}
        onClick={() => setActiveTab('history')}>
        <RotateCcwClock />
        <span className={styles.iconText}>History</span>
      </div>

      <div
        className={`${styles.iconBox} ${styles.bottom}`}
        onClick={() => setIsLightMode(!isLightMode)}>
        {isLightMode ? <Sun /> : <Moon />}
        <span className={styles.iconText}>{isLightMode ? 'Light' : 'Dark'}</span>
      </div>
    </aside>
  );
}
