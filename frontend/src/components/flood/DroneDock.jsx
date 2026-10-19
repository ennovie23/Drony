import { useState } from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import styles from './DroneDock.module.css';
import { Card, Chip, Button } from '../ui';
import { useAppData } from '../../context/AppDataContext';
import { dropPoints } from '../../data/mock';

const DOCK_SLOTS = 1;

// The drone's payload dock: drop a floating JSN module at a chosen point, or recall one.
export default function DroneDock() {
    const { drone, modules, deployModule, recallModule } = useAppData();
    const [deployingId, setDeployingId] = useState(null);
    const [dropPointId, setDropPointId] = useState(null);

    const docked = modules.filter((m) => m.status === 'DOCKED');
    const out = modules.filter((m) => m.status === 'DEPLOYED' || m.status === 'DEPLOYING');
    const usedPlaces = new Set(modules.map((m) => m.place));
    const freePoints = dropPoints.filter((p) => !usedPlaces.has(p.place));
    const chosenPoint = dropPoints.find((p) => p.id === dropPointId);
    const slots = Array.from({ length: DOCK_SLOTS }, (_, i) => docked.find((m) => m.dockSlot === i + 1) ?? null);
    const latch = drone.devices.find((d) => d.label === 'DOCK LATCH')?.value ?? 'READY';

    const startDeploy = (id) => {
        setDeployingId(id === deployingId ? null : id);
        setDropPointId(null);
    };

    const confirmDeploy = () => {
        deployModule(deployingId, chosenPoint);
        setDeployingId(null);
        setDropPointId(null);
    };

    const handleRecall = (m) => {
        if (window.confirm(`Recall ${m.id} from ${m.place}? Its sensor will stop reporting.`)) recallModule(m.id);
    };

    return (
        <Card title="Payload dock · flood modules" meta={<>Latch <Chip value={latch} /></>}>
            <div className={styles.columns}>
                <div>
                    <p className={styles.label}>In dock ({docked.length}/{DOCK_SLOTS})</p>
                    <div className={styles.slots}>
                        {slots.map((m, i) =>
                            m ? (
                                <button
                                    key={m.id}
                                    type="button"
                                    className={`${styles.slot} ${styles.slotFilled} ${deployingId === m.id ? styles.slotOn : ''}`}
                                    onClick={() => startDeploy(m.id)}>
                                    <span>Slot {i + 1}</span>
                                    <span className={`${styles.slotId} mono`}>{m.id}</span>
                                    <span>Batt <span className="mono">{m.battery}%</span></span>
                                </button>
                            ) : (
                                <div key={i} className={styles.slot}>
                                    <span>Slot {i + 1}</span>
                                    <span>Empty</span>
                                </div>
                            ),
                        )}
                    </div>

                    {deployingId ? (
                        <div className={styles.deployBox}>
                            <p className={styles.hint}>
                                Choose where the drone drops <strong className="mono">{deployingId}</strong>.
                            </p>
                            <div className={styles.dropList}>
                                {freePoints.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        className={`${styles.dropItem} ${dropPointId === p.id ? styles.dropOn : ''}`}
                                        onClick={() => setDropPointId(p.id)}>
                                        <span>{p.place}</span>
                                        <span className={`${styles.muted} mono`}>{p.id}</span>
                                    </button>
                                ))}
                                {freePoints.length === 0 && <p className={styles.hint}>All drop points are in use.</p>}
                            </div>
                            <div className={styles.actions}>
                                <Button variant="primary" disabled={!chosenPoint} onClick={confirmDeploy}>
                                    <ArrowDownToLine />
                                    {chosenPoint ? `Drop at ${chosenPoint.id}` : 'Select a point'}
                                </Button>
                                <Button onClick={() => startDeploy(null)}>Cancel</Button>
                            </div>
                        </div>
                    ) : (
                        <p className={styles.hint}>
                            {docked.length > 0 ? 'Select a loaded slot to drop that module.' : 'Dock is empty. Return to base to reload modules.'}
                        </p>
                    )}
                </div>

                <div>
                    <p className={styles.label}>On the water ({out.length})</p>
                    <div className={styles.outList}>
                        {out.map((m) => (
                            <div key={m.id} className={styles.outItem}>
                                <span className={`${styles.slotId} mono`}>{m.id}</span>
                                <span className={styles.muted}>{m.place}</span>
                                {m.status === 'DEPLOYING' ? (
                                    <Chip tone="warn">Dropping</Chip>
                                ) : (
                                    <Button variant="danger" size="sm" onClick={() => handleRecall(m)}>
                                        <X /> Recall
                                    </Button>
                                )}
                            </div>
                        ))}
                        {out.length === 0 && <p className={styles.hint}>No modules on the water.</p>}
                    </div>
                </div>
            </div>
        </Card>
    );
}
