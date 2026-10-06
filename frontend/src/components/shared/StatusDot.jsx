import ui from './ui.module.css';
import { toneOf } from '../../utils/status';

export default function StatusDot({ tone, value, pulse = false }) {
    const resolved = tone ?? toneOf(value);
    return <span className={`${ui.dot} ${ui[resolved]} ${pulse ? ui.pulse : ''}`}></span>;
}
