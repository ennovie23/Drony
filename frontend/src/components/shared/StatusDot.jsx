import styles from './StatusDot.module.css';
import { toneOf } from '../../utils/status';

// Small static dot coloured by tone (or by the tone of a status word).
export default function StatusDot({ tone, value }) {
    const resolved = tone ?? toneOf(value);
    return <span className={`${styles.dot} ${styles[resolved]}`}></span>;
}
