import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './Header.module.css';

export default function Header() {
    const [timeString, setTimeString] = useState('');

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            // Format HH:mm:ss in PHT (Asia/Manila)
            const formatted = now.toLocaleTimeString('en-GB', {
                timeZone: 'Asia/Manila',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });
            setTimeString(`${formatted} PHT`);
        };

        updateClock();
        const timer = setInterval(updateClock, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <header className={styles.header}>
            <div className={styles.leftSection}>
                <span>Disaster Response Management System</span>
                <span>•</span>
                <span>Overview</span>
            </div>

            <div className={styles.rightSection}>
                <div className={styles.statusIndicator}>
                    <span className={styles.statusDot}></span>
                    <span>SYSTEM NOMINAL</span>
                </div>

                <div className={styles.timestamp}>
                    {timeString || '17:27:02 PHT'}
                </div>

                <button className={styles.placeholderBtn}>
                    <span className={styles.statusDot}></span>
                    <span>placeholder</span>
                    <ChevronDown size={12} className={styles.chevron} />
                </button>
            </div>
        </header>
    );
}