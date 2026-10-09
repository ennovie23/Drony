import styles from './Segmented.module.css';

// Toggle group. Single: `value` is the selected key. Multi: `value` is { [key]: boolean }.
export default function Segmented({ options, value, onChange, multi = false }) {
    const isOn = (key) => (multi ? Boolean(value[key]) : value === key);
    return (
        <div className={styles.group} role="group">
            {options.map(({ key, label }) => (
                <button
                    key={key}
                    type="button"
                    aria-pressed={isOn(key)}
                    className={`${styles.option} ${isOn(key) ? styles.on : ''}`}
                    onClick={() => onChange(key)}>
                    {label}
                </button>
            ))}
        </div>
    );
}
