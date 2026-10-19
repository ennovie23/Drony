# Webcam Live Fire Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Fire Assessment page run the existing fire/smoke models on the laptop webcam, stream the feed to the page, and auto-capture real snapshots (JPEG + assessment) into the bottom strip.

**Architecture:** `detect.py` opens either the `.mp4` (unchanged) or the webcam, chosen by `VIDEO_SOURCE`. In webcam mode it serves an MJPEG stream and a `/capture` hook on `STREAM_PORT`, and posts snapshots to a new backend router. The backend stores the snapshots as JPEGs plus `snapshots.json`. The frontend switches the main frame to the stream and builds the strip from `/api/snapshots`.

**Tech Stack:** Python 3 (OpenCV, ultralytics, Python standard library `http.server`), Node/Express 5 (ESM), React 19 + Vite, `node:test`, Python `unittest`.

**Spec:** `docs/superpowers/specs/2026-10-13-webcam-live-fire-detection-design.md`

## Global Constraints

- `VIDEO_SOURCE` defaults to `file`. In file mode, behaviour of `detect.py`, the page, and the mock snapshots is unchanged.
- Env defaults: `WEBCAM_INDEX=0`, `STREAM_PORT=5002`, `SNAPSHOT_COOLDOWN_S=5`.
- No changes to `severity.py`, `temporal_behavior.py`, `threat_fusion.py`, or the Prisma schema. No migrations.
- No new Python dependencies beyond what `detect.py` already imports. No new npm dependencies.
- Snapshot storage lives in `backend/ML/snapshots/` (gitignored), capped at 50 entries, newest first. Snapshot id = `SNAP-<frame padded to 6>-<epoch ms>`. `imageUrl` = `/snapshots/<id>.jpg`.
- Placeholder copy: `Camera unavailable — check that the simulation is running`. Empty strip copy: `No snapshots yet — fire detections will appear here`. Button copy: `Back to live`.
- The backend is ESM (`"type": "module"`). Match the existing style (2-space indent in the backend, 4-space in frontend components, `.module.css`).

## Review Focus

1. **Fire stays in view for a long time** → about one auto snapshot per cooldown, never one per frame. *(Task 2 test `test_auto_respects_cooldown`)*
2. **Snapshot POST bodies are base64 JPEGs over 100 KB** (Express's default JSON limit) → accepted, not 413. *(Task 5 test `accepts large image bodies`)*
3. **Two snapshots arrive at nearly the same time** → both kept, `snapshots.json` not clobbered. *(Task 4 test `concurrent adds keep every entry`)*
4. **`snapshots.json` is corrupt or hand-edited** → `GET` returns `[]`, and the next add rewrites a valid file. *(Task 4 test `corrupt index reads as empty and recovers`)*
5. **Smoke-only snapshot (no fire)** → strip shows 0% and no severity, without crashing. *(Task 6 test `smoke-only entry maps without severity`)*

---

### Task 1: Python runtime — requirements and cross-platform spawn

**Files:**
- Create: `backend/ML/requirements.txt`
- Create: `backend/lib/python.js`
- Create: `backend/tests/python.test.js`
- Modify: `backend/routes/drone.js:22` (spawn call)
- Modify: `backend/package.json` (add `"test": "node --test \"tests/**/*.test.js\""`)

**Interfaces:**
- Produces: `resolvePythonBin(platform: string, env: object) => string`

- [ ] **Step 1: Write failing tests** in `backend/tests/python.test.js`:
  - `resolvePythonBin('win32', {})` → `'python'`
  - `resolvePythonBin('linux', {})` → `'python3'`
  - `resolvePythonBin('win32', { PYTHON_BIN: 'C:\\venv\\python.exe' })` → `'C:\\venv\\python.exe'`
- [ ] **Step 2:** Run `cd backend && npm test`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `resolvePythonBin` in `backend/lib/python.js`. In `drone.js`, replace `'python3'` with `resolvePythonBin(process.platform, process.env)`.
- [ ] **Step 4:** Write `backend/ML/requirements.txt` with `ultralytics`, `opencv-python`, `requests`, `python-dotenv`, `numpy`. Don't pin versions; the existing code pins none.
- [ ] **Step 5:** Run `npm test`. Expected: 3 pass.
- [ ] **Step 6:** Install the dependencies: `python -m pip install -r backend/ML/requirements.txt` (no Python on this machine has `cv2` yet). Verify with `python -c "import cv2, ultralytics; print('ok')"`. Expected: `ok`. If the install fails on Python 3.14 (e.g. no torch wheel yet), create a 3.11 venv at `backend/ML/.venv` (`py -3.11 -m venv backend/ML/.venv`), install there, set `PYTHON_BIN` in `backend/.env` to its `Scripts\python.exe`, and add `backend/ML/.venv/` to `.gitignore`.
- [ ] **Step 7: Commit** `fix(drone): resolve python binary per platform; add ML requirements`.

### Task 2: Python stream server and snapshot trigger (pure helpers)

**Files:**
- Create: `backend/ML/live_stream.py`
- Create: `backend/ML/snapshot_trigger.py`
- Create: `backend/ML/tests/__init__.py`, `backend/ML/tests/test_live_stream.py`, `backend/ML/tests/test_snapshot_trigger.py`

**Interfaces:**
- Produces (`live_stream.py`, standard library only, no cv2 import):
  - `class LatestFrame`: `set(jpeg: bytes) -> None`; `wait_newer(last_version: int, timeout: float) -> tuple[int, bytes | None]` (blocks on a `threading.Condition` until the version is greater than `last_version`).
  - `class CaptureFlag`: `request() -> None`; `consume() -> bool` (returns True once per request, thread-safe).
  - `start_stream_server(port: int, latest: LatestFrame, capture: CaptureFlag) -> ThreadingHTTPServer`: starts `serve_forever` in a daemon thread and returns the server (the caller may `shutdown()`). Routes:
    - `GET /stream`: `multipart/x-mixed-replace; boundary=frame`, each part `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: N\r\n\r\n<bytes>\r\n`.
    - `POST /capture`: `200 {"success": true}`.
    - `OPTIONS`: 204.
    - Anything else: 404.
    - All responses send `Access-Control-Allow-Origin: *`. Client disconnects (`BrokenPipeError`, `ConnectionResetError`) end the handler quietly.
- Produces (`snapshot_trigger.py`): `class SnapshotTrigger(cooldown_s: float, clock=time.monotonic)` with `check(fire: bool, smoke: bool, manual: bool) -> str | None`. Returns `"manual"` if `manual` (ignores the cooldown and doesn't reset it), else `"auto"` if `(fire or smoke)` and the cooldown has elapsed since the last auto (the first detection always fires), else `None`.

- [ ] **Step 1: Write failing tests:**
  - `test_snapshot_trigger.py`, using a fake clock list:
    - `test_first_detection_fires`: `check(True, False, False) == "auto"`
    - `test_auto_respects_cooldown`: cooldown 5; at t=0 → `"auto"`; t=4.9 → `None`; t=5.0 → `"auto"`
    - `test_no_detection_no_snapshot`: `check(False, False, False) is None`
    - `test_manual_bypasses_cooldown`: t=0 auto, t=1 `check(False, False, True) == "manual"`, t=2 `check(True, False, False) is None`
    - `test_smoke_only_triggers`: `check(False, True, False) == "auto"`
  - `test_live_stream.py`: start on port 0 (read `server.server_address[1]`):
    - `test_capture_sets_flag`: POST `/capture` with `urllib.request` → 200, JSON `success` is True; `capture.consume()` is True, then False
    - `test_stream_serves_latest_jpeg`: `latest.set(b"JPEGDATA")`; open `/stream`; header `Content-Type` starts with `multipart/x-mixed-replace`; reading the first part contains `b"JPEGDATA"`
    - `test_unknown_path_404`
    - `test_cors_header_present` on `/capture`
- [ ] **Step 2:** Run `cd backend/ML && python -m unittest discover -s tests -v`. Expected: FAIL (import errors).
- [ ] **Step 3:** Implement both modules.
- [ ] **Step 4:** Run the tests again. Expected: all pass.
- [ ] **Step 5: Commit** `feat(ml): add MJPEG stream server and snapshot trigger helpers`.

### Task 3: `detect.py` — source selection, frame index, snapshots

**Files:**
- Modify: `backend/ML/detect.py`

**Interfaces:**
- Consumes: `LatestFrame`, `CaptureFlag`, `start_stream_server`, `SnapshotTrigger` (Task 2).
- Produces: the frame payload gains `"frameIndex": int`. In webcam mode, POSTs to `http://localhost:5001/api/snapshots` with `{"imageBase64": str, "trigger": "auto"|"manual", "assessment": frame_payload}`. Task 5 consumes this.

- [ ] **Step 1:** Read env `VIDEO_SOURCE` (lower-cased, default `file`), `WEBCAM_INDEX` (int, 0), `STREAM_PORT` (int, 5002), `SNAPSHOT_COOLDOWN_S` (float, 5).
- [ ] **Step 2:** Wrap the existing file-opening block (lines 18–40) under `if VIDEO_SOURCE == "file"`, unchanged. Add a `webcam` branch: `cv2.VideoCapture(WEBCAM_INDEX)`, and on failure print `Error: Unable to open webcam {WEBCAM_INDEX}` and `exit(1)`. Any other value → print an error and `exit(1)`. Print the source on start.
- [ ] **Step 3:** In the loop, on a failed read: file mode keeps the rewind. Webcam mode retries up to 30 consecutive failures with `time.sleep(0.1)`, then prints an error and breaks. FPS pacing only applies in file mode.
- [ ] **Step 4:** Add `frame_index` (starts at 0, +1 per processed frame), and `"frameIndex": frame_index` in `frame_payload`.
- [ ] **Step 5:** Webcam mode only:
  - Before the loop, create `LatestFrame`, `CaptureFlag`, `start_stream_server(STREAM_PORT, …)` and `SnapshotTrigger(SNAPSHOT_COOLDOWN_S)`.
  - Each frame: `ok, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])`, then `latest.set(buf.tobytes())`.
  - After building the payload: `kind = trigger.check(fire_detected, smoke_detected, capture.consume())`. If `kind`, enqueue the snapshot through a second sender worker (same pattern as `payload_queue`, `maxsize=2`, drop the oldest when full) posting to `/api/snapshots` with `base64.b64encode(buf).decode()`.
- [ ] **Step 6:** Verify file mode is unchanged: run `python ML/detect.py` from `backend/` with `VIDEO_SOURCE` unset, with the backend running. Expected: `Starting detection on smoke.mp4…`, and `/api/detections/latest` updates.
- [ ] **Step 7:** Verify webcam mode: `VIDEO_SOURCE=webcam`, run it, open `http://localhost:5002/stream` in a browser. Expected: live camera. Then `curl -X POST localhost:5002/capture` → backend log shows a snapshot POST (it 404s until Task 5; that's fine).
- [ ] **Step 8: Commit** `feat(ml): webcam source with live stream and snapshot capture`.

### Task 4: Backend snapshot store

**Files:**
- Create: `backend/lib/snapshotStore.js`
- Create: `backend/tests/snapshotStore.test.js`

**Interfaces:**
- Produces: `createSnapshotStore({ dir: string, max = 50, now = Date.now }) => { list(): Promise<Entry[]>, add({ imageBase64, trigger, assessment }): Promise<Entry> }`
  - `Entry = { id, frame, capturedAt, trigger, imageUrl, assessment }`, per spec §4.3. `frame = assessment.frameIndex ?? 0`. `capturedAt = assessment.timestamp ?? new Date(now()).toISOString()`.
  - `add` creates `dir` if missing, writes `<id>.jpg`, then writes `snapshots.json` via a temp file and `fs.rename`. All `add` calls are serialized on an internal promise chain. Over `max`, it deletes the dropped entries' JPEGs (ignoring ENOENT).
  - `list` returns `[]` when the file is missing or invalid JSON (and logs the parse error).

- [ ] **Step 1: Write failing tests** (each uses a fresh `fs.mkdtemp` dir):
  - `add writes jpeg and index entry`: after `add({ imageBase64: Buffer.from('abc').toString('base64'), trigger:'auto', assessment:{ frameIndex: 7, fireDetected:true } })` with `now=()=>1000`: `entry.id === 'SNAP-000007-1000'`, `entry.imageUrl === '/snapshots/SNAP-000007-1000.jpg'`, the file content is `'abc'`, and `(await list())[0].id === entry.id`
  - `list is newest first`
  - `caps at max and deletes old images`: `max: 2`, three adds → `list().length === 2` and the first jpeg no longer exists
  - `concurrent adds keep every entry`: `Promise.all` of 5 adds (distinct `frameIndex`) → 5 entries
  - `corrupt index reads as empty and recovers`: write `'{oops'` to `snapshots.json` → `list()` is `[]`; then `add` → `list().length === 1`
  - `missing dir lists empty`
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(backend): add file-backed snapshot store`.

### Task 5: Backend routes, static serving, config

**Files:**
- Create: `backend/routes/snapshots.js`
- Create: `backend/lib/videoConfig.js`
- Create: `backend/tests/snapshotsRoute.test.js`, `backend/tests/videoConfig.test.js`
- Modify: `backend/routes/config.js`, `backend/server.js`, `.gitignore`

**Interfaces:**
- Consumes: `createSnapshotStore` (Task 4).
- Produces:
  - `createSnapshotsRouter({ store, streamPort, fetchImpl = fetch }) => express.Router`. It mounts its own `express.json({ limit: '10mb' })`. Routes:
    - `GET /` → array
    - `POST /` → 201 `{ success:true, snapshot }`, or 400 `{ success:false, error }` when `imageBase64` (string) or `assessment` (object) is missing
    - `POST /capture` → proxies `POST http://localhost:${streamPort}/capture`, 200 `{ success:true }`; on a fetch error → 503 `{ success:false, message:'Simulation is not running in webcam mode' }`
  - Default export of `routes/snapshots.js`: a router built with `createSnapshotStore({ dir: <backend>/ML/snapshots })` and `streamPort = Number(process.env.STREAM_PORT) || 5002`.
  - `buildVideoConfig(env) => { source, filename, videoUrl, streamUrl }`. `source` is `'webcam'` only if `env.VIDEO_SOURCE?.toLowerCase() === 'webcam'`, else `'file'`. `streamUrl` is `http://localhost:${STREAM_PORT||5002}/stream` in webcam mode, else `null`. `filename`/`videoUrl` as today.

- [ ] **Step 1: Write failing tests:**
  - `videoConfig.test.js`: default env → `source:'file', streamUrl:null, videoUrl:'http://localhost:5001/videos/smoke.mp4'`; `{VIDEO_SOURCE:'WEBCAM', STREAM_PORT:'6000'}` → `source:'webcam', streamUrl:'http://localhost:6000/stream'`
  - `snapshotsRoute.test.js`: mount on a fresh `express()` with an in-memory fake store, `listen(0)`, use global `fetch`:
    - `GET returns list`
    - `POST missing fields → 400`
    - `POST valid → 201 with snapshot`
    - `accepts large image bodies`: a ~200 KB `imageBase64` → 201
    - `capture proxies to stream server`: `fetchImpl` stub resolving ok → 200, and the stub was called with `'http://localhost:5002/capture'`
    - `capture when stream down → 503`: stub rejects → 503 with the spec message
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the router and `buildVideoConfig`. `config.js` uses `buildVideoConfig(process.env)`. In `server.js`: `fs.mkdirSync(snapshotsDir, { recursive: true })`, `app.use('/snapshots', express.static(snapshotsDir))`, and `app.use('/api/snapshots', snapshotRoutes)`. Mount it **before** `app.use(express.json())`, so the router's 10 MB parser applies. Add `backend/ML/snapshots/` to `.gitignore`.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Smoke-test the live server: `node server.js`, then:
  - `curl localhost:5001/api/snapshots` → `[]`
  - `curl -X POST localhost:5001/api/snapshots/capture` → 503
  - `curl localhost:5001/api/config/video` → includes `"source":"file"`
- [ ] **Step 6: Commit** `feat(backend): snapshot API, static snapshots, video source config`.

### Task 6: Frontend snapshot mapping helpers

**Files:**
- Create: `frontend/src/utils/snapshots.js`
- Create: `frontend/tests/snapshots.test.js`
- Modify: `frontend/src/pages/FireAssessment.jsx:17-23, 56-82` (move `formatPercent` and the inline mapping out)

**Interfaces:**
- Produces:
  - `toUiSnapshot(entry) => { id, frame, capturedAt, imageUrl, trigger, detections, fireConfidence, severity, behavior, smoke, assessment }`, mapped exactly per spec §4.4.
  - `toModelResult(d) => { timestamp, primaryHazard, threatScore, fire, smoke }`. This is the existing inline mapping from `FireAssessment.jsx`. `primaryHazard` is computed when absent (`fireDetected ? 'fire' : smokeDetected ? 'smoke' : null`). `fire`/`smoke` are built from `d.fire`/`d.smoke` when present, or else from the flat `fireDetected`/`fireConfidence`/… fields, so a raw snapshot `assessment` works too.
  - `formatPercent(val)`: moved unchanged.

- [ ] **Step 1: Write failing tests:**
  - `maps boxes to percent rects`: box `{bboxX1:10,bboxY1:20,bboxX2:50,bboxY2:80}` → `box: {x:10,y:20,w:40,h:60}`
  - `uppercases severity`: `fireSeverity:'Severe'` → `severity:'SEVERE'`
  - `smoke-only entry maps without severity`: `{fireDetected:false, smokeDetected:true, smokeConfidence:62, smokeTrend:'EXPANDING', boxes:[]}` → `fireConfidence:0, severity:null, behavior:'EXPANDING', smoke:{detected:true, confidence:0.62}`
  - `toModelResult on flat snapshot assessment`: `{fireDetected:true, fireConfidence:85.2, fireSeverity:'Severe', fireSeverityConf:91, fireTrend:'GROWING', fireTrendSlope:0.1234, threatScore:77}` → `primaryHazard:'fire', threatScore:77, fire.confidence:'85.2', fire.trendSlope:'0.12', smoke:null`
  - `toModelResult on /latest shape`: given `{ primaryHazard:'smoke', smoke:{confidence:0.5, trend:'STABLE', trendSlope:0}, fire:null, threatScore:10, timestampPHT:'x' }` → `smoke.confidence:'50.0'`, `timestamp:'x'`
- [ ] **Step 2:** Run `cd frontend && npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Replace the inline mapping in `FireAssessment.jsx` with `setLatestDetection(toModelResult(result.data))`.
- [ ] **Step 4:** Run `npm test && npm run lint`. Expected: pass.
- [ ] **Step 5: Commit** `refactor(fire): extract snapshot and model-result mappers`.

### Task 7: Live stream in `MlFrame` and source-aware data

**Files:**
- Modify: `frontend/src/hooks/useVideoUrl.js`
- Modify: `frontend/src/components/fire/MlFrame.jsx`, `MlFrame.module.css` (placeholder style)
- Modify: `frontend/src/context/AppDataProvider.jsx`

**Interfaces:**
- Consumes: `/api/config/video` `{ source, streamUrl }` (Task 5), `/api/snapshots` and `/api/snapshots/capture` (Task 5), `toUiSnapshot` (Task 6).
- Produces:
  - `useVideoUrl()` → `{ videoUrl, streamUrl, source, loading, error }`. On a fetch error, `source` falls back to `'file'` and `streamUrl` to `null`.
  - Context adds `videoSource: 'file'|'webcam'`. `fireSnapshots` may be `[]` in webcam mode.

- [ ] **Step 1:** Update `useVideoUrl`.
- [ ] **Step 2:** In `MlFrame`, add the three render branches from spec §4.4:
  - snapshot image: `<img src={API_BASE_URL + snapshot.imageUrl}>` + `snapshot.detections` boxes, with labels unless `small`
  - live stream: `<img src={streamUrl}>` while `playing`, plus the live boxes. Show the placeholder copy on `onError` or when not playing, and reset the error state when `playing` turns true.
  - the existing `<video>`
  
  Delete the commented-out block. The frame tag must not assume `snapshot` exists.
- [ ] **Step 3:** In `AppDataProvider`, when `videoSource === 'webcam'`:
  - Poll `GET /api/snapshots` every 2000 ms (immediately on mount too) → `setSnapshots(rows.map(toUiSnapshot))`. Start from `[]`, not the mocks.
  - `captureSnapshot` → `setAnalyzing(true)`, `POST /api/snapshots/capture`. If not ok, `console.error` and clear. Otherwise clear `analyzing` once a fetched list's first id differs from the id before the request, or after 5000 ms.
  - File mode keeps the existing mock code path.
- [ ] **Step 4:** Run `npm run lint && npm run build`. Expected: no errors.
- [ ] **Step 5: Commit** `feat(fire): live webcam stream and real snapshots in data provider`.

### Task 8: `FireAssessment` — live vs selected, empty-safe

**Files:**
- Modify: `frontend/src/pages/FireAssessment.jsx`, `FireAssessment.module.css` (empty-strip style only if needed)

**Interfaces:**
- Consumes: `videoSource`, `fireSnapshots`, `captureSnapshot` from context; `toModelResult` (Task 6); `MlFrame` props (Task 7).

- [ ] **Step 1:** Make the page empty-safe:
  - `latest = fireSnapshots[0]` (may be undefined).
  - Webcam mode: `snap = selectedId ? fireSnapshots.find(s => s.id === selectedId) : undefined`.
  - File mode: keep `?? latest`.
  - Guard every `snap.`/`latest.` access, e.g. `detections = snap ? … : liveBoxesAsDetections`. The simplest option is `[]` when there's no `snap`, with the table falling back to its existing empty copy.
- [ ] **Step 2:** Main frame: pass `snapshot={snap}` (undefined = live in webcam mode). The tag shows `Live · Webcam` when there's no `snap`.
- [ ] **Step 3:** "Model result" uses `snap?.assessment ? toModelResult(snap.assessment) : latestDetection`.
- [ ] **Step 4:** In webcam mode with `snap` selected, render `<Button onClick={() => setSelectedId(null)}>Back to live</Button>` in the TopBar actions next to Capture. The details card "Source" shows `Webcam` in webcam mode.
- [ ] **Step 5:** When `fireSnapshots.length === 0` and not `analyzing`, the strip shows the empty copy. The `Latest` chip uses `s.id === latest?.id`.
- [ ] **Step 6:** Run `npm run lint && npm run build && npm test`. Expected: pass.
- [ ] **Step 7: Commit** `feat(fire): live/snapshot views and empty states on fire page`.

### Task 9: End-to-end verification

**Files:** none (only `backend/.env` locally, which is gitignored)

- [ ] **Step 1:** Set `VIDEO_SOURCE=webcam` in `backend/.env`. Start the backend (`npm run dev`) and frontend (preview server), open Fire Assessment, and click Start Simulation. Walk through spec §6 steps 1–7, checking with the browser tools (screenshots, network: `/api/snapshots` 200 with entries, `/snapshots/<id>.jpg` 200).
- [ ] **Step 2:** Set `VIDEO_SOURCE=file`, restart, and confirm spec §6 step 8 (mp4 plays, mock snapshots, Start Simulation runs detect on the file).
- [ ] **Step 3:** Report results with screenshots. Fix any failures in the owning task's files and re-run that task's tests.
