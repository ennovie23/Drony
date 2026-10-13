import styles from './Button.module.css';

// variant: 'primary' (amber), 'default' (outlined), 'danger'. size: 'sm' for compact rows.
export default function Button({ variant = 'default', size, className = '', type = 'button', ...props }) {
    return (
        <button
            type={type}
            className={`${styles.button} ${styles[variant]} ${size ? styles[size] : ''} ${className}`}
            {...props}
        />
    );
}
