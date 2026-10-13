# Webcam Live Fire Detection — Design

**Date:** 2026-10-13
**Status:** Approved in brainstorming, pending spec review
**Scope:** Testing feature. Lets the Fire Assessment page run the existing fire/smoke models on the laptop's webcam instead of a pre-recorded `.mp4`, and auto-capture real snapshots of detections.

## 1. Goal

Today `detect.py` reads `backend/ML/test_video/<ACTIVE_VIDEO>`, and the Fire Assessment page plays the same file in a `<video>` element while polling detections. The snapshot strip at the bottom of the page is mock data (`frontend/src/data/mock.js`).

We want to test detection live:

- Point the laptop webcam at a fire (e.g. a fire video on a phone).
- See the live camera feed on the Fire Assessment page with the model's boxes on top.
- When fire or smoke is detected, a real snapshot (JPEG + its assessment) appears in the snapshot strip.
- Clicking a snapshot shows its saved assessment (severity, trend, threat score, detections).

## 2. Non-goals / constraints

- **Keep the file source.** The `.mp4` sources and current behaviour stay intact. The webcam is an alternative source, chosen by config. Default stays `file`.
- **No change to the ML pipeline.** YOLO detection, `severity.py`, `temporal_behavior.py` and `threat_fusion.py` are reused unchanged. Only the frame source changes.
- **No database migration.** Snapshots are stored locally as files (see §4.3). The production drone version will later move them to a `Snapshot` table with shared image storage.
- **Same machine only.** Camera, backend and browser run on one laptop (`localhost`). Phone or remote cameras are out of scope.
- `FrameAssessment` rows are still written to Neon every frame in webcam mode, same as file mode today.

## 3. Architecture

Python owns the camera (option 1 from brainstorming). This mirrors the eventual drone flow, where `cv2.VideoCapture` opens a network stream (e.g. RTSP). It also avoids Windows' one-program-per-webcam limit.

```
Webcam ──cv2.VideoCapture(WEBCAM_INDEX)──► detect.py
                                             ├─ MJPEG server :5002 /stream ──────────────► <img> on Fire page
                                             ├─ POST /api/detections (every frame) ──────► backend ──► Neon + live cache
                                             └─ POST /api/snapshots (on detection) ──────► backend ──► ML/snapshots/*.jpg + snapshots.json

Fire page ──GET /api/config/video──► { source, videoUrl, streamUrl }
          ──GET /api/detections/live, /latest (existing polling)
          ──GET /api/snapshots (every 2 s)
          ──POST /api/snapshots/capture ──► backend ──POST :5002/capture──► detect.py (save next frame)
```

## 4. Components

### 4.1 Configuration (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `VIDEO_SOURCE` | `file` | `file` = existing `.mp4` behaviour; `webcam` = live camera |
| `WEBCAM_INDEX` | `0` | OpenCV camera index |
| `STREAM_PORT` | `5002` | Port of the MJPEG stream / capture server in `detect.py` |
| `SNAPSHOT_COOLDOWN_S` | `60` | Minimum seconds between automatic snapshots |
| `ACTIVE_VIDEO` | (existing) | Still used when `VIDEO_SOURCE=file` |

### 4.2 `backend/ML/detect.py`

**Source selection.** Only the capture setup branches:

- `file`: unchanged. Opens `test_video/<ACTIVE_VIDEO>` with the existing fallback, loops at end of file, and paces to the file's FPS.
- `webcam`: `cv2.VideoCapture(WEBCAM_INDEX)`. No looping. No FPS pacing (runs as fast as inference allows). If the camera can't be opened, print `Error: Unable to open webcam <index>` and exit with code 1. If a read fails mid-run, retry briefly, then exit with an error.
- Frame width and height come from the capture as today, so box percentages stay correct.

**Frame counter.** A running `frame_index` integer is added to the frame payload as `frameIndex`. It is used as the snapshot frame number.

**Stream and capture server (webcam mode only).** A daemon thread runs a `ThreadingHTTPServer` from the Python standard library (no new dependencies) on `STREAM_PORT`:

- `GET /stream` returns `multipart/x-mixed-replace; boundary=frame` and writes the latest raw frame as JPEG (`cv2.imencode('.jpg', quality 80)`) whenever it changes. CORS header `Access-Control-Allow-Origin: *`.
- `POST /capture` sets a thread-safe `manual_capture_requested` flag and returns `{"success": true}`.
- The main loop publishes the latest frame through a lock-protected shared variable. The server never touches the model.

**Snapshot trigger.** After each frame's payload is built:

- **auto:** `fireDetected or smokeDetected`, and at least `SNAPSHOT_COOLDOWN_S` since the last auto snapshot.
- **manual:** the `manual_capture_requested` flag is set (no detection needed, no cooldown). Clear the flag.
- On trigger, encode the frame as JPEG, base64 it, and send `{ imageBase64, trigger: "auto"|"manual", assessment: frame_payload }` to `POST /api/snapshots`. This goes through its own non-blocking sender (a queue of size 2, keeping the newest), so the main loop never waits on HTTP.
- Snapshots are only produced in webcam mode.

### 4.3 Backend: snapshot storage and routes

**New file `backend/routes/snapshots.js`**, mounted at `/api/snapshots`. The Express JSON body limit for this router is raised to `10mb` to fit base64 JPEGs.

Storage lives in `backend/ML/snapshots/` (gitignored):

- `<id>.jpg`: the image.
- `snapshots.json`: an array of entries, newest first, capped at **50**. When the cap is exceeded, the oldest entries and their JPEGs are deleted.

Entry shape:

```json
{
  "id": "SNAP-000123-1760342400000",
  "frame": 123,
  "capturedAt": "2026-10-13T08:00:00.000Z",
  "trigger": "auto",
  "imageUrl": "/snapshots/SNAP-000123-1760342400000.jpg",
  "assessment": { "...": "the full frame_payload from detect.py (fireDetected, fireConfidence, fireSeverity, fireSeverityConf, fireTrend, fireTrendSlope, smokeDetected, smokeConfidence, smokeTrend, smokeTrendSlope, threatScore, boxes, frameIndex, timestamp)" }
}
```

`id` = `SNAP-<frame padded to 6>-<epoch ms>` (unique across restarts).

Routes:

- `POST /api/snapshots`: validate that `imageBase64` and `assessment` are present (400 otherwise). Write the JPEG, then rewrite `snapshots.json` atomically (write a temp file, then rename). Writes are serialized through an in-process promise chain to avoid races. Returns `201 { success, snapshot }`.
- `GET /api/snapshots`: returns the array (`[]` if the file is missing or unreadable; parse errors are logged).
- `POST /api/snapshots/capture`: forwards to `http://localhost:${STREAM_PORT}/capture`. Returns `503 { success:false, message:"Simulation is not running in webcam mode" }` if unreachable.

**`backend/server.js`:** mount the router, and serve `ML/snapshots` statically at `/snapshots`. The directory is created at startup if missing.

**`backend/routes/config.js`:** `/api/config/video` returns `{ source, filename, videoUrl, streamUrl }`. `streamUrl` is `http://localhost:${STREAM_PORT}/stream` in webcam mode and `null` otherwise.

**`.gitignore`:** add `backend/ML/snapshots/`.

### 4.4 Frontend

**`hooks/useVideoUrl.js`:** also returns `source` (`'file'` | `'webcam'`, default `'file'`) and `streamUrl`. The fallback on backend error stays `file`.

**`components/fire/MlFrame.jsx`:** decides what to render:

- If `snapshot?.imageUrl` (a real snapshot, thumbnail or selected): render `<img src={API_BASE_URL + imageUrl}>` with **that snapshot's saved boxes**. No live polling.
- Else if `source === 'webcam'` and not `small`: render `<img src={streamUrl}>` while `playing`, with the live boxes polled from `/api/detections/live` as today. On `<img>` `onError`, or when not playing, show the placeholder text "Camera unavailable — check that the simulation is running".
- Else: the existing `<video>` behaviour, unchanged.

The existing commented-out snapshot box block is replaced by real rendering of `snapshot.detections` for image snapshots.

**`context/AppDataProvider.jsx`:**

- Reads `source` via `useVideoUrl`.
- **webcam:** polls `GET /api/snapshots` every 2 s and maps each entry to the page's snapshot shape:
  - `id`, `frame`, `capturedAt`, `imageUrl`, `trigger`
  - `detections`: from `assessment.boxes` → `{ id, label, confidence, box: { x: bboxX1, y: bboxY1, w: bboxX2-bboxX1, h: bboxY2-bboxY1 } }`
  - `fireConfidence`: `assessment.fireConfidence ?? 0` (already a percent)
  - `severity`: `assessment.fireSeverity?.toUpperCase() ?? null` (matches `SEVERITY_TONE` keys)
  - `behavior`: `assessment.fireTrend ?? assessment.smokeTrend ?? null`
  - `smoke`: `{ detected: assessment.smokeDetected, confidence: (assessment.smokeConfidence ?? 0) / 100 }`
  - `assessment`: the raw object (for the Model result card)
- `captureSnapshot`: in webcam mode, sets `analyzing`, `POST`s `/api/snapshots/capture`, then refetches snapshots. It clears `analyzing` when the new snapshot appears or after 5 s. A 503 is logged and `analyzing` is cleared. In file mode it keeps the existing mock behaviour.
- **file:** existing mock snapshots, unchanged.
- Exposes `videoSource` in context.

**`pages/FireAssessment.jsx`:**

- **Empty-safe.** `latest`/`snap` may be undefined. Guard every `snap.*` and `latest.id` access. With no snapshots, the detections table shows the live boxes (webcam) or the empty message. The strip shows "No snapshots yet — fire detections will appear here".
- **Live vs selected:**
  - `selectedId === null` → **Live.** In webcam mode, `MlFrame` receives no `snapshot` (renders the stream). "Model result" uses the live `latestDetection` polling, as today.
  - `selectedId` set → `MlFrame` gets the selected snapshot (frozen image + saved boxes). "Model result" uses that snapshot's `assessment`, run through the **same formatter** as `latestDetection`. Extract the existing inline mapping into a `toModelResult(d)` helper used for both.
  - A **"Back to live"** button (webcam mode, snapshot selected) sets `selectedId` to `null`.
- In file mode the page behaves exactly as today. The default selection stays the latest mock snapshot.
- The details card's "Source" shows `Webcam` in webcam mode.

## 5. Error handling summary

| Failure | Behaviour |
|---|---|
| Webcam can't open | `detect.py` exits 1 with a clear message; backend logs it; page shows the "Camera unavailable" placeholder |
| Stream `<img>` fails | Placeholder shown; next start of the simulation re-mounts the img |
| Snapshot POST fails | Logged in `detect.py`; detection continues |
| Bad snapshot body | 400 from backend |
| `snapshots.json` missing/corrupt | `GET` returns `[]`; error logged; next `POST` rewrites the file |
| Manual capture while not running | 503 → page logs it, clears "Analysing…" |

## 6. Testing

Manual, end to end:

1. `VIDEO_SOURCE=webcam`, start the backend and frontend, open Fire Assessment, and click **Start Simulation**. The live webcam feed appears.
2. Show a fire image or video on a phone to the webcam. Boxes appear live, and the Model result card updates.
3. Within about `SNAPSHOT_COOLDOWN_S`, a snapshot with a real thumbnail appears in the strip. Keeping fire in view adds roughly one snapshot per cooldown, not one per frame.
4. Click a snapshot. The main frame freezes on its image and boxes, and Model result shows its saved severity, trend and threat score. **Back to live** returns to the stream.
5. Click **Capture snapshot** with no fire in view. A `manual` snapshot appears.
6. Stop the simulation. The placeholder shows, and existing snapshots remain clickable.
7. Restart the backend. Snapshots persist (they're read from `snapshots.json`).
8. Set `VIDEO_SOURCE=file` and restart. The page behaves exactly as before (mp4 video, mock snapshots).

Backend sanity checks: `curl` `GET /api/snapshots`, `POST /api/snapshots` with a missing field (expect 400), and `POST /api/snapshots/capture` with the simulation stopped (expect 503).

## 7. Future (out of scope)

- Drone feed: set the capture source to the drone's stream URL (same `cv2.VideoCapture` path).
- Move snapshots to a `Snapshot` table linked to `FrameAssessment`, with images in shared storage.
