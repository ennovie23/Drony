import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';
import styles from './ImagePreview.module.css';

// Full-screen view of one image; closes on Escape, the × or a click outside the image.
export default function ImagePreview({ src, alt, caption, onClose }) {
    useEffect(() => {
        if (!src) return;
        const handle = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', handle);
        return () => window.removeEventListener('keydown', handle);
    }, [src, onClose]);

    if (!src) return null;

    return createPortal(
        <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
            <figure className={styles.figure} role="dialog" aria-modal="true" aria-label={alt}>
                <div className={styles.toolbar}>
                    <a className={styles.tool} href={src} target="_blank" rel="noreferrer" title="Open original">
                        <ExternalLink size={16} />
                    </a>
                    <button className={styles.tool} onClick={onClose} aria-label="Close preview">
                        <X size={16} />
                    </button>
                </div>
                <img className={styles.img} src={src} alt={alt} />
                {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
            </figure>
        </div>,
        document.body
    );
}
