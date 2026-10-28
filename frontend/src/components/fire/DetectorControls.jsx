import { Play, Pause, Square } from 'lucide-react';
import styles from './DetectorControls.module.css';
import StatusDot from '../shared/StatusDot';
import { Button } from '../ui';

const LABEL = {
    unknown: 'Checking…', running: 'Running', paused: 'Paused', starting: 'Starting…', stopped: 'Stopped',
    unmanaged: 'Another detector running', offline: 'Backend offline',
};
const TONE = { unknown: 'off', running: 'ok', paused: 'warn', starting: 'warn', stopped: 'off', unmanaged: 'danger', offline: 'danger' };
const UNMANAGED_HINT = 'A detect.py this backend did not start is still sending frames, usually from a second backend '
    + '(another npm run dev). Stop that one; this page cannot.';

// Bar above the Fire page's video: the detector's state and Start / Pause / Stop.
// `detector` comes from useDetectorControl(); `source` names what it analyses.
export default function DetectorControls({ detector, source }) {
    const { state, managed, busy, error } = detector;
    const canStart = state === 'paused' || (state === 'stopped' && managed);
    const handHint = state === 'unmanaged'
        ? UNMANAGED_HINT
        : managed ? undefined : 'detect.py was started by hand (DETECTOR_AUTOSTART=0)';

    return (
        <div className={styles.controls} role="group" aria-label="Detector controls">
            <span className={styles.state} title={handHint}>
                <span className={styles.label}>Detector</span>
                <StatusDot tone={TONE[state]} />
                <strong>{LABEL[state]}</strong>
                {source && <span className={styles.source}>· {source}</span>}
            </span>
            {(error || state === 'unmanaged') && (
                <span className={styles.error} title={error ?? UNMANAGED_HINT}>{error ?? 'Is a second backend running?'}</span>
            )}
            <Button size="sm" onClick={detector.start} disabled={!canStart || busy !== null} title={handHint}>
                <Play size={14} />
                {state === 'paused' ? 'Resume' : busy === 'start' ? 'Starting…' : 'Start'}
            </Button>
            <Button size="sm" onClick={detector.pause} disabled={state !== 'running' || busy !== null}>
                <Pause size={14} />
                {busy === 'pause' ? 'Pausing…' : 'Pause'}
            </Button>
            <Button
                size="sm"
                variant="danger"
                onClick={detector.stop}
                disabled={!managed || !['running', 'paused', 'starting'].includes(state) || busy !== null}
                title={handHint ?? 'Stop detection and close the open fire incident'}
            >
                <Square size={13} />
                {busy === 'stop' ? 'Stopping…' : 'Stop'}
            </Button>
        </div>
    );
}
