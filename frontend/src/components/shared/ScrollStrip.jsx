import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './ScrollStrip.module.css';
import { scrollArrows } from '../../utils/scrollStrip';

// One horizontal row that scrolls instead of wrapping. Arrow buttons appear on
// whichever side has more items; each click pages by most of the visible width.
export default function ScrollStrip({ className = '', children }) {
    const rowRef = useRef(null);
    const [arrows, setArrows] = useState({ left: false, right: false });

    const update = useCallback(() => {
        const row = rowRef.current;
        if (row) setArrows(scrollArrows(row));
    }, []);

    useEffect(() => {
        const row = rowRef.current;
        if (!row) return;
        // Re-check when the row resizes or items are added/removed
        const resize = new ResizeObserver(update);
        resize.observe(row);
        const mutations = new MutationObserver(update);
        mutations.observe(row, { childList: true });
        row.addEventListener('scroll', update, { passive: true });
        return () => {
            resize.disconnect();
            mutations.disconnect();
            row.removeEventListener('scroll', update);
        };
    }, [update]);

    const page = (direction) => {
        const row = rowRef.current;
        if (row) row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: 'smooth' });
    };

    return (
        <div className={styles.wrap}>
            <div ref={rowRef} className={`${styles.row} ${className}`}>
                {children}
            </div>
            {arrows.left && (
                <button type="button" className={`${styles.arrow} ${styles.left}`} onClick={() => page(-1)} aria-label="Scroll left">
                    <ChevronLeft />
                </button>
            )}
            {arrows.right && (
                <button type="button" className={`${styles.arrow} ${styles.right}`} onClick={() => page(1)} aria-label="Scroll right">
                    <ChevronRight />
                </button>
            )}
        </div>
    );
}
