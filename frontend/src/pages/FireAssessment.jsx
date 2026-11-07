import { useState } from "react";
import { Camera, Trash2, Archive } from "lucide-react";
import styles from "./FireAssessment.module.css";
import table from "../components/ui/Table.module.css";
import TopBar from "../components/shared/TopBar";
import LocationLine from "../components/shared/LocationLine";
import MlFrame from "../components/fire/MlFrame";
import { Card, Chip, KeyValue, Button, Modal } from "../components/ui";
import FireVerdict from "../components/fire/FireVerdict";
import useLiveDetections from "../hooks/useLiveDetections";
import { SEVERITY_TONE, toneFor } from "../components/ui/tones";
import { formatStatus } from "../components/ui/format";
import { useAppData } from "../context/AppDataContext";
import { formatTime, timeAgo } from "../utils/format";
import useNow from "../hooks/useNow";
import ScrollStrip from "../components/shared/ScrollStrip";

import { toModelResult } from "../utils/snapshots";
import useLatestDetection from "../hooks/useLatestDetection";
import useDetectorControl from "../hooks/useDetectorControl";
import DetectorControls from "../components/fire/DetectorControls";

// Box coordinates are percentages; webcam boxes carry 4 decimals, so show one.
const pct = (v) => Number(Number(v).toFixed(1));

export default function FireAssessment() {
  useNow(5000);
  const { fireSnapshots, analyzing, captureSnapshot, clearSnapshots, deleteSnapshot, videoSource } =
    useAppData();
  const isWebcam = videoSource === "webcam";
  const detector = useDetectorControl();
  const [selectedId, setSelectedId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);

  // Starts on the live stream (no snapshot selected); the list may be empty
  const latest = fireSnapshots[0];
  const selected = fireSnapshots.find((s) => s.id === selectedId);
  const snap = selected;
  const isLatest = Boolean(snap && snap.id === latest?.id);

  const selectSnapshot = (id) => {
    setSelectedId(id);
    setHighlightId(null);
  };

  // Modal state
  const [clearModal, setClearModal] = useState(false);
  const [archiveModal, setArchiveModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onConfirmClear = async () => {
    setClearModal(false);
    setClearing(true);
    const ok = await clearSnapshots();
    setClearing(false);
    if (ok) selectSnapshot(null);
  };

  const onConfirmArchive = async () => {
    setArchiveModal(false);
    if (!snap) return;
    setDeleting(true);
    const ok = await deleteSnapshot(snap.id);
    setDeleting(false);
    if (ok) selectSnapshot(null);
  };

  // Live result from the detector, which runs whenever a camera is connected
  const { result: latestDetection, live } = useLatestDetection();

  // The table lists the selected frame's boxes, or the detector's current ones on the live view
  const liveBoxes = useLiveDetections(!snap && live);
  const detections = [...(snap ? snap.detections : liveBoxes)].sort((a, b) => b.confidence - a.confidence);

  // A selected webcam snapshot shows its saved assessment; otherwise the live one
  const result = snap?.assessment ? toModelResult(snap.assessment) : latestDetection;

  return (
    <div className={styles.page}>
      {/* ── Clear All Confirmation Modal ─────────────────────────── */}
      <Modal
        open={clearModal}
        title="Clear snapshots from live view?"
        confirmLabel={clearing ? "Clearing…" : "Clear view"}
        onConfirm={onConfirmClear}
        onClose={() => setClearModal(false)}
      >
        <p>
          This will clear the current display. All <strong>{fireSnapshots.length}</strong> snapshot{fireSnapshots.length !== 1 ? 's' : ''} remain safely saved and accessible in the <strong>History</strong> page.
        </p>
      </Modal>

      {/* ── Single Snapshot Archive Modal ────────────────────────── */}
      <Modal
        open={archiveModal}
        title="Remove snapshot from live view?"
        confirmLabel={deleting ? "Removing…" : "Remove from view"}
        confirmVariant="default"
        onConfirm={onConfirmArchive}
        onClose={() => setArchiveModal(false)}
      >
        <p>
          Frame <strong>{snap?.frame}</strong> will be cleared from the live strip. It remains safely saved and accessible in the <strong>History</strong> page.
        </p>
      </Modal>

      <TopBar
        title="Fire assessment"
        subtitle={<LocationLine />}
        actions={
          <>
            {snap && (
              <>
                <Button onClick={() => selectSnapshot(null)}>Back to live</Button>
                <Button variant="default" onClick={() => setArchiveModal(true)} disabled={deleting}>
                  <Archive size={16} />
                  {deleting ? "Archiving…" : "Archive"}
                </Button>
              </>
            )}
            <Button
              variant="primary"
              onClick={captureSnapshot}
              disabled={analyzing || detector.state !== "running"}
            >
              <Camera />
              {analyzing ? "Analysing…" : "Capture snapshot"}
            </Button>
          </>
        }
      />

      <div className={styles.body}>
        <div className={styles.grid}>
          <div className={styles.column}>
            <DetectorControls detector={detector} source={isWebcam ? "Webcam" : "Test video"} />
            <MlFrame
              snapshot={snap}
              highlightId={highlightId}
              tag={
                snap
                  ? `Frame ${snap.frame}${isLatest ? " · latest" : ""} · ${formatTime(snap.capturedAt)}`
                  : `${{ paused: "Paused", stopped: "Stopped" }[detector.state] ?? "Live"} · ${isWebcam ? "Webcam" : "Test video"}`
              }
              playing={live}
              detectorState={detector.state}
            />

            <Card title={`Detections (${detections.length})`} meta={snap ? `Frame ${snap.frame}` : "Current frame"}>
              {detections.length === 0 ? (
                <p className={table.empty}>
                  {snap
                    ? "No fire detected in this frame"
                    : live
                      ? "Nothing detected in the current frame"
                      : "The detector isn't sending frames"}
                </p>
              ) : (
                <table className={table.table}>
                  <thead>
                    <tr>
                      <th>Box</th>
                      <th>Label</th>
                      <th>Score</th>
                      <th>Position (x, y)</th>
                      <th>Size (w × h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detections.map((d) => (
                      <tr
                        key={d.id}
                        className={highlightId === d.id ? table.active : ""}
                        onMouseEnter={() => setHighlightId(d.id)}
                        onMouseLeave={() => setHighlightId(null)}
                      >
                        <td className="mono">{d.id}</td>
                        <td className={table.muted}>{d.label}</td>
                        <td className="mono">
                          <span className={table.bar}>
                            <span
                              style={{ width: `${d.confidence * 100}%` }}
                            ></span>
                          </span>
                          {d.confidence.toFixed(2)}
                        </td>
                        <td className="mono">
                          {pct(d.box.x)}%, {pct(d.box.y)}%
                        </td>
                        <td className="mono">
                          {pct(d.box.w)}% × {pct(d.box.h)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <div className={styles.column}>
            <FireVerdict
              result={result}
              live={Boolean(snap) || live}
              meta={snap ? <span>Frame <span className="mono">{snap.frame}</span></span> : live ? "Live" : "Detector not sending"}
            />

            <Card>
              <KeyValue
                rows={[
                  {
                    label: "Captured",
                    value: snap ? formatStatus(timeAgo(snap.capturedAt)) : "Live",
                  },
                  { label: "Boxes", value: snap ? snap.detections.length : "—" },
                  { label: "Source", value: isWebcam ? "Webcam" : "Test video" },
                ]}
              />
            </Card>
          </div>
        </div>

        <Card
          title={`Snapshots (${fireSnapshots.length})`}
          meta={
            <span className={styles.stripMeta}>
              Click a snapshot to view its result
              {fireSnapshots.length > 0 && (
                <Button size="sm" onClick={() => setClearModal(true)} disabled={clearing}>
                  <Trash2 />
                  {clearing ? "Clearing…" : "Clear"}
                </Button>
              )}
            </span>
          }
        >
          <ScrollStrip className={styles.strip}>
            {analyzing && (
              <div className={`${styles.snap} ${styles.pending}`}>
                <div className={styles.pendingThumb}>Analysing…</div>
                <span className={styles.snapMeta}>New snapshot</span>
              </div>
            )}
            {!analyzing && fireSnapshots.length === 0 && (
              <p className={`${table.empty} ${styles.stripEmpty}`}>
                No snapshots yet — fire detections will appear here
              </p>
            )}
            {fireSnapshots.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.snap} ${s.id === snap?.id ? styles.snapOn : ""}`}
                onClick={() => selectSnapshot(s.id)}
              >
                <MlFrame snapshot={s} small />
                <span className={styles.snapHead}>
                  <span>
                    Frame <span className="mono">{s.frame}</span>
                  </span>
                  {s.id === latest?.id && <Chip tone="off">Latest</Chip>}
                </span>
                <span className={styles.snapMeta}>
                  <span className="mono">{s.fireConfidence}%</span> ·{" "}
                  <span className={styles[toneFor(SEVERITY_TONE, s.severity)]}>
                    {formatStatus(s.severity)}
                  </span>
                </span>
                <span className={styles.snapMeta}>
                  {formatStatus(timeAgo(s.capturedAt))}
                </span>
              </button>
            ))}
          </ScrollStrip>
        </Card>
      </div>
    </div>
  );
}
