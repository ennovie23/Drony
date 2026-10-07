import { NavLink } from 'react-router-dom';
import { Radio, Flame, Waves, Drone, Map, Sun, Moon } from 'lucide-react';
import styles from './Sidebar.module.css';
import useTheme from '../../hooks/useTheme';

const NAV_ITEMS = [
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/fire', label: 'Fire', icon: Flame },
  { to: '/flood', label: 'Flood', icon: Waves },
  { to: '/flight', label: 'Flight', icon: Drone },
  { to: '/map', label: 'Map', icon: Map },
];

export default function SideBar() {
  const [theme, toggleTheme] = useTheme();
  const isLightMode = theme === 'light';

  return (
    <aside className={styles.container}>
      <div id={styles.titleBox}>
        <span>DRMS</span>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${styles.iconBox} ${isActive ? styles.active : ''}`}>
              <Icon />
              <span className={styles.iconText}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <button
        className={`${styles.iconBox} ${styles.bottom}`}
        onClick={toggleTheme}>
        {isLightMode ? <Sun /> : <Moon />}
        <span className={styles.iconText}>{isLightMode ? 'Light' : 'Dark'}</span>
      </button>
    </aside>
  );
}
