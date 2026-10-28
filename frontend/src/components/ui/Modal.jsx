import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Modal.module.css';
import Button from './Button';

/**
 * Confirmation modal.
 *
 * Props:
 *   open         — boolean
 *   title        — string
 *   children     — body content (description / warning text)
 *   confirmLabel — text for the confirm button (default "Confirm")
 *   confirmVariant — Button variant for confirm (default "danger")
 *   cancelLabel  — text for the cancel button (default "Cancel")
 *   onConfirm    — called when confirm is clicked
 *   onClose      — called when cancel or × is clicked
 */
export default function Modal({
    open,
    title,
    children,
    confirmLabel = 'Confirm',
    confirmVariant = 'danger',
    cancelLabel = 'Cancel',
    onConfirm,
    onClose,
}) {
    // Trap focus and close on Escape
    useEffect(() => {
        if (!open) return;
        const handle = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', handle);
        return () => window.removeEventListener('keydown', handle);
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
            <div className={styles.dialog} role="dialog" aria-modal="true">
                <header className={styles.header}>
                    <h2 className={styles.title}>{title}</h2>
                    <button className={styles.close} onClick={onClose} aria-label="Close"><X size={16} /></button>
                </header>
                <div className={styles.body}>{children}</div>
                <footer className={styles.footer}>
                    <Button onClick={onClose}>{cancelLabel}</Button>
                    <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
                </footer>
            </div>
        </div>,
        document.body
    );
}
