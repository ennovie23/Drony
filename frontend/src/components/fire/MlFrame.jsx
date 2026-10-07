import styles from './MlFrame.module.css';
import fireImg from '../../assets/fire.webp';

// One drone snapshot as analysed by the fire model: the image with the model's boxes
// labelled "<label> <score>". `small` renders a thumbnail without labels.
export default function MlFrame({ snapshot, highlightId = null, small = false }) {
    return (
        <div className={`${styles.frame} ${small ? styles.small : ''}`}>
            <img className={styles.image} src={fireImg} alt={`Drone snapshot, frame ${snapshot.frame}`} />

            {snapshot.detections.map((d) => (
                <div
                    key={d.id}
                    className={`${styles.box} ${highlightId === d.id ? styles.boxOn : ''} ${highlightId && highlightId !== d.id ? styles.boxDim : ''}`}
                    style={{ left: `${d.box.x}%`, top: `${d.box.y}%`, width: `${d.box.w}%`, height: `${d.box.h}%` }}>
                    {!small && (
                        <span className={styles.label}>
                            {d.label} {d.confidence.toFixed(2)}
                        </span>
                    )}
                </div>
            ))}

            {!small && <span className={styles.frameTag}>FRAME {snapshot.frame}</span>}
        </div>
    );
}
