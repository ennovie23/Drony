import styles from './Chip.module.css';
import { formatStatus } from './format';
import { toneOf } from '../../utils/status';

// Status word on a soft tone background. Pass `value` (a status word) or `tone` + children.
export default function Chip({ value, tone, children }) {
    const resolved = tone ?? toneOf(value);
    return <span className={`${styles.chip} ${styles[resolved]}`}>{children ?? formatStatus(value)}</span>;
}
