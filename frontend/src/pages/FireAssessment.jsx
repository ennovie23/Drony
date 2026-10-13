import { useEffect, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import styles from "./FireAssessment.module.css";
import table from "../components/ui/Table.module.css";
import TopBar from "../components/shared/TopBar";
import MlFrame from "../components/fire/MlFrame";
import { Card, Chip, KeyValue, Button } from "../components/ui";
import { SEVERITY_TONE, BEHAVIOR_TONE, toneFor } from "../components/ui/tones";
import { formatStatus } from "../components/ui/format";
import { useAppData } from "../context/AppDataContext";
import { formatTime, timeAgo } from "../utils/format";
import useNow from "../hooks/useNow";
import SimulateBtn from "../components/fire/SimulateBtn";
import ScrollStrip from "../components/shared/ScrollStrip";

import { API_BASE_URL } from "../config";
import { toModelResult } from "../utils/snapshots";

// Box coordinates are percentages; webcam boxes carry 4 decimals, so show one.
const pct = (v) => Number(Number(v).toFixed(1));

export default function FireAssessment() {
  useNow(5000);
  const { drone, site, fireSnapshots, analyzing, captureSnapshot, clearSnapshots, videoSource } =
    useAppData();
  const isWebcam = videoSource === "webcam";
  const [selectedId, setSelectedId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Webcam mode starts on the live stream (no snapshot selected) and the list may be
  // empty; file mode keeps showing the latest mock snapshot by default.
  const latest = fireSnapshots[0];
  const selected = fireSnapshots.find((s) => s.id === selectedId);
  const snap = isWebcam ? selected : (selected ?? latest);
  const isLatest = Boolean(snap && snap.id === latest?.id);
  const detections = snap
    ? [...snap.detections].sort((a, b) => b.confidence - a.confidence)
    : [];

  const selectSnapshot = (id) => {
    setSelectedId(id);
    setHighlightId(null);
  };

  const [clearing, setClearing] = useState(false);
  const onClearSnapshots = async () => {
    const count = fireSnapshots.length;
    if (!window.confirm(`Delete all ${count} snapshot${count === 1 ? "" : "s"}? This can't be undone.`)) return;
    setClearing(true);
    const ok = await clearSnapshots();
    setClearing(false);
    if (ok) selectSnapshot(null);
    else window.alert("Couldn't clear snapshots — check that the backend is running.");
  };

  const [latestDetection, setLatestDetection] = useState({
    timestamp: "",
    primaryHazard: null,
    threatScore: 0,
    fire: null,
    smoke: null,
  });

  useEffect(() => {
    const fetchLatestDetection = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/detections/latest`);
        const body = await response.json();

        if (body.success && body.data) {
          setLatestDetection(toModelResult(body.data));
        }
      } catch (error) {
        console.error("Failed to fetch latest detection.", error);
      }
    };

    fetchLatestDetection();
    const interval = setInterval(fetchLatestDetection, 1000);

    return () => clearInterval(interval);
  }, []);

  // A selected webcam snapshot shows its saved assessment; otherwise the live one
  const result = snap?.assessment ? toModelResult(snap.assessment) : latestDetection;

  return (
    <div className={styles.page}>
      <TopBar
        title="Fire assessment"
        subtitle={`${site.area}, ${site.city}`}
        actions={
          <>
            {isWebcam && snap && (
              <Button onClick={() => selectSnapshot(null)}>Back to live</Button>
            )}
            <Button
              variant="primary"
              onClick={captureSnapshot}
              disabled={analyzing}
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
            <MlFrame
              snapshot={snap}
              highlightId={highlightId}
              tag={
                snap
                  ? `Frame ${snap.frame}${isLatest ? " · latest" : ""} · ${formatTime(snap.capturedAt)}`
                  : "Live · Webcam"
              }
              playing={isSimulating}
            />

            <Card title={`Detections (${detections.length})`}>
              {detections.length === 0 ? (
                <p className={table.empty}>
                  {snap
                    ? "No fire detected in this frame"
                    : "Live view — select a snapshot to see its detections"}
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
<Card
              title="Model result"
              meta={
                snap ? (
                  <span>
                    Frame <span className="mono">{snap.frame}</span>
                  </span>
                ) : (
                  <span>Live</span>
                )
              }
            >
              <div
                style={{
                  background: "#1e222d",
                  borderRadius: "8px",
                  padding: "16px 20px",
                  border: "1px solid #2a2e39",
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  color: "#ffffff",
                }}
              >
                {/* Left: Detection Label */}
                <div>
                  <p
                    style={{
                      margin: "0 0 4px 0",
                      fontSize: "12px",
                      color: "#848e9c",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Detected Object
                  </p>
                  <span
                    style={{
                      fontSize: "24px",
                      fontWeight: "bold",
                      textTransform: "uppercase",
                      color: result?.primaryHazard
                        ? "#ef4444"
                        : "#848e9c",
                    }}
                  >
                    {result?.primaryHazard || "None"}
                  </span>
                </div>

                {/* Right: Confidence Score */}
                <div style={{ textAlign: "right" }}>
                  <p
                    style={{
                      margin: "0 0 4px 0",
                      fontSize: "12px",
                      color: "#848e9c",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Confidence
                  </p>
                  <span
                    style={{
                      fontSize: "24px",
                      fontWeight: "bold",
                      fontFamily: "monospace",
                    }}
                  >
                    {(() => {
                      const activeHazard =
                        result?.primaryHazard === "fire"
                          ? result?.fire
                          : result?.smoke;
                      return activeHazard?.confidence
                        ? `${activeHazard.confidence}%`
                        : "0.0%";
                    })()}
                  </span>
                </div>
              </div>

              {/* Highlighted Threat Fusion Summary Card */}
              {(() => {
                const score = result?.threatScore ?? 0;
                const isCritical = score > 75;
                const isElevated = score > 40;

                const theme = isCritical
                  ? {
                      border: "rgba(239, 68, 68, 0.45)",
                      bg: "linear-gradient(135deg, rgba(239, 68, 68, 0.16) 0%, rgba(26, 20, 24, 0.95) 100%)",
                      text: "#ef4444",
                      glow: "0 0 18px rgba(239, 68, 68, 0.25)",
                      badgeBg: "rgba(239, 68, 68, 0.22)",
                      badgeBorder: "rgba(239, 68, 68, 0.5)",
                      label: "CRITICAL RISK",
                      barColor: "linear-gradient(90deg, #f87171, #ef4444)",
                    }
                  : isElevated
                  ? {
                      border: "rgba(245, 158, 11, 0.45)",
                      bg: "linear-gradient(135deg, rgba(245, 158, 11, 0.16) 0%, rgba(26, 24, 20, 0.95) 100%)",
                      text: "#f59e0b",
                      glow: "0 0 18px rgba(245, 158, 11, 0.25)",
                      badgeBg: "rgba(245, 158, 11, 0.22)",
                      badgeBorder: "rgba(245, 158, 11, 0.5)",
                      label: "ELEVATED THREAT",
                      barColor: "linear-gradient(90deg, #fbbf24, #f59e0b)",
                    }
                  : {
                      border: "rgba(16, 185, 129, 0.35)",
                      bg: "linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(18, 26, 23, 0.95) 100%)",
                      text: "#10b981",
                      glow: "0 0 14px rgba(16, 185, 129, 0.18)",
                      badgeBg: "rgba(16, 185, 129, 0.2)",
                      badgeBorder: "rgba(16, 185, 129, 0.35)",
                      label: "NOMINAL",
                      barColor: "linear-gradient(90deg, #34d399, #10b981)",
                    };

                return (
                  <div
                    style={{
                      margin: "14px 0 16px 0",
                      padding: "16px 18px",
                      borderRadius: "10px",
                      background: theme.bg,
                      border: `1px solid ${theme.border}`,
                      boxShadow: theme.glow,
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      transition: "all 0.3s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          textTransform: "uppercase",
                          letterSpacing: "0.8px",
                          color: "#9ca3af",
                        }}
                      >
                        Overall Threat Fusion Score
                      </span>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "6px",
                          fontSize: "10px",
                          fontWeight: "800",
                          letterSpacing: "0.6px",
                          textTransform: "uppercase",
                          backgroundColor: theme.badgeBg,
                          color: theme.text,
                          border: `1px solid ${theme.badgeBorder}`,
                        }}
                      >
                        {theme.label}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "36px",
                          fontWeight: "900",
                          fontFamily: "monospace",
                          lineHeight: "1",
                          color: theme.text,
                          textShadow: `0 0 12px ${theme.border}`,
                        }}
                      >
                        {score}
                      </span>
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: "600",
                          color: "#6b7280",
                        }}
                      >
                        / 100
                      </span>
                    </div>

                    <div
                      style={{
                        width: "100%",
                        height: "6px",
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(Math.max(score, 0), 100)}%`,
                          height: "100%",
                          background: theme.barColor,
                          borderRadius: "3px",
                          transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

              <div className={styles.verdict}>
                <KeyValue
                  rows={[
                    {
                      label: "Severity",
                      value: result?.fire?.severity ? (
                        <Chip
                          tone={toneFor(SEVERITY_TONE, result.fire.severity)}
                          value={`${result.fire.severity}${result.fire.severityConf ? ` · ${result.fire.severityConf}%` : ""}`}
                        />
                      ) : (
                        <Chip tone="ok">None detected</Chip>
                      ),
                    },
                    {
                      label: "Fire Behaviour",
                      value: result?.fire?.trend ? (
                        <Chip
                          tone={toneFor(BEHAVIOR_TONE, result.fire.trend)}
                          value={result.fire.trend}
                        />
                      ) : (
                        <Chip tone="neutral">Standby</Chip>
                      ),
                    },
                    {
                      label: "Smoke Plume",
                      value: result?.smoke?.trend ? (
                        <Chip
                          tone={toneFor(BEHAVIOR_TONE, result.smoke.trend)}
                          value={result.smoke.trend}
                        />
                      ) : (
                        <Chip tone="ok">Clear air</Chip>
                      ),
                    },
                  ]}
                />
              </div>
            </Card>

            <Card>
              <KeyValue
                rows={[
                  {
                    label: "Captured",
                    value: snap ? formatStatus(timeAgo(snap.capturedAt)) : "Live",
                  },
                  { label: "Boxes", value: snap ? snap.detections.length : "—" },
                  { label: "Source", value: isWebcam ? "Webcam" : `${drone.id} camera` },
                ]}
              />
            </Card>

            <div style={{ display: "flex", justifyContent: "end" }}>
              <SimulateBtn
                onStart={() => setIsSimulating(true)}
                onPause={() => setIsSimulating(false)}
              />
            </div>
          </div>
        </div>

        <Card
          title={`Snapshots (${fireSnapshots.length})`}
          meta={
            <span className={styles.stripMeta}>
              Click a snapshot to view its result
              {isWebcam && fireSnapshots.length > 0 && (
                <Button size="sm" onClick={onClearSnapshots} disabled={clearing}>
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
