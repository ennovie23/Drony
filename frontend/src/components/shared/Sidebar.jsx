import { NavLink } from 'react-router-dom';
import { Radio, Flame, Waves, Drone, Map, Sun, Moon } from 'lucide-react';
import styles from './Sidebar.module.css';
import useTheme from '../../hooks/useTheme';
import { useAppData } from '../../context/AppDataContext';
import { SEVERITY_TONE, toneFor } from '../ui/tones';
import { reportingSensors } from '../../utils/flood';

const NAV_ITEMS = [
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/fire', label: 'Fire', icon: Flame },
  { to: '/flood', label: 'Flood', icon: Waves },
  { to: '/flight', label: 'Flight', icon: Drone },
  { to: '/map', label: 'Map', icon: Map },
];

export default function SideBar() {
  const [theme, toggleTheme] = useTheme();
  const { fireSnapshots, modules } = useAppData();
  const isLightMode = theme === 'light';

  // Dots let the operator see hazard state without opening the page.
  const fireTone = toneFor(SEVERITY_TONE, fireSnapshots[0]?.severity);
  const dots = {
    '/fire': fireTone !== 'off' ? styles[fireTone] : null,
    '/flood': reportingSensors(modules).length > 0 ? styles.water : null,
  };

  return (
    <aside className={styles.container}>
      <div className={styles.mark}>DRMS</div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}>
              <Icon />
              <span>{item.label}</span>
              {dots[item.to] && <span className={`${styles.dot} ${dots[item.to]}`}></span>}
            </NavLink>
          );
        })}
      </nav>

      <button className={`${styles.item} ${styles.bottom}`} onClick={toggleTheme}>
        {isLightMode ? <Sun /> : <Moon />}
        <span>{isLightMode ? 'Light' : 'Dark'}</span>
      </button>
    </aside>
  );
}
