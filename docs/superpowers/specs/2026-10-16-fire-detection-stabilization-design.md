# Fire Detection Stabilization (Stage 1) — Design

**Date:** 2026-10-16
**Status:** Approved in brainstorming, pending spec review
**Scope:** Make the existing fire/smoke detector and severity classifier give fewer false alarms, fewer flickers and steadier severity **without retraining**, and add a script that measures it. Stage 2 (retraining in Colab with D-Fire) is a separate spec.

## 1. Goal

Three problems today:

- **False alarms:** fire/smoke reported where there is none (lamps, red objects, fog).
- **Missed fires:** real fire/smoke not detected, especially small or distant.
- **Wrong severity:** Minor/Moderate/Severe often wrong or jumping between frames.

The current models (read from the `.pt` metadata) are small and moderately accurate:

| | Detector `best.pt` | Severity `best_severity.pt` |
|---|---|---|
| Base | YOLOv10n, 50 epochs, 640 px | YOLOv8n-cls, 30 epochs, 224 px |
| Classes | fire, smoke | mild, moderate, severe |
| Validation | precision 0.77, recall 0.66, mAP50 0.69 | top-1 accuracy 0.71 |

The models were trained by someone else in Colab and the datasets are not available. Stage 1 improves how `detect.py` *uses* the models: per-class confidence thresholds, K-of-N frame voting, a padded severity crop, and severity smoothing. It also adds `evaluate.py` so this stage, and Stage 2 later, are judged by numbers, not by eye.

## 2. Non-goals / constraints

- **No retraining, no new models.** `best.pt` and `best_severity.pt` are unchanged.
- **No payload change.** The fields sent to `/api/detections` and `/api/snapshots` stay the same. No backend, database or frontend changes.
- **CPU only.** The laptop has integrated graphics only. Anything that slows the live webcam loop (e.g. a larger `DETECT_IMGSZ`) is opt-in and measured first.
- **Unchanged modules:** `temporal_behavior.py`, `threat_fusion.py`, `snapshot_trigger.py`, `live_stream.py`, `frame_grabber.py`. `severity.py` is unchanged too; it is simply given a padded crop.
- **No object tracking.** Rejected: fire and smoke change shape too much for stable track IDs, and tracking is heavier on CPU. It can be revisited after Stage 2.

## 3. Architecture

```
detect.py  (source, stream, snapshots, HTTP senders)
   │  frame
   ▼
pipeline.FramePipeline.process(frame) ──► payload dict (same fields as today)
   │  uses
   ├── YOLO detector (passed in)
   ├── classify_fire_crop (passed in, from severity.py)
   ├── stabilizer: filter_by_confidence, PresenceVote ×2, SeverityVote, pad_box
   ├── TemporalGrowthClassifier
   └── calculate_urgency_score

evaluate.py ── runs detector once per frame ──► baseline FramePipeline.analyze(...)
                                           └──► stabilized FramePipeline.analyze(...)
```

### 3.1 `backend/ML/stabilizer.py` (new)

Pure logic. No models, no camera, no I/O.

- `filter_by_confidence(detections, fire_min, smoke_min) -> list`
  Each detection is a dict with at least `label` and `conf` (0–1). Keeps fire with `conf >= fire_min`, smoke with `conf >= smoke_min`. Other labels pass through unchanged.
- `class PresenceVote(k, n)`
  `update(seen: bool) -> bool` keeps the last `n` values and returns `True` when at least `k` of them are `True`. Fewer than `n` frames seen so far counts the missing ones as `False`.
- `class SeverityVote(n)`
  `update(label: str) -> str` keeps the last `n` labels and returns the most common one. A tie goes to whichever tied label appeared most recently. `reset()` clears the history.
- `pad_box(box, fraction, width, height) -> [x1, y1, x2, y2]`
  Grows the box by `fraction` of its width/height on each side, clamped to `[0, width] × [0, height]`. `fraction = 0` returns the box unchanged (clamped).

### 3.2 `backend/ML/pipeline.py` (new)

- `PipelineSettings` holds `fire_conf_min`, `smoke_conf_min`, `vote_k`, `vote_n`, `severity_window`, `crop_pad`, `detect_imgsz`.
  - `PipelineSettings.from_env(env)` reads the variables in §4.2, applying defaults for missing ones. An invalid value raises `ValueError` naming the variable.
  - `PipelineSettings.baseline()` returns today's behavior (§4.2, "Today" column).
- `class FramePipeline(detector, classify, settings, frame_width, frame_height)`
  - `run_detector(frame)` runs `detector(frame, conf=min(fire_conf_min, smoke_conf_min), imgsz=detect_imgsz, verbose=False)` and returns detections as a list of `{label, conf, box}` (box in pixels).
  - `analyze(frame, detections, frame_index, timestamp) -> dict` does everything after detection (§4.1) and returns the payload.
  - `process(frame, frame_index, timestamp) -> dict` = `analyze(frame, run_detector(frame), ...)`.

The detector and classifier are passed in so tests can use fakes and `evaluate.py` can share one detector run between two pipelines.

### 3.3 `backend/ML/detect.py` (slimmed)

It keeps:

- source selection (file/webcam)
- the webcam stream server and frame grabber
- the HTTP senders
- the snapshot trigger
- frame-rate throttling for files

It loads the models, builds `PipelineSettings.from_env(os.environ)` once at startup, and creates one `FramePipeline`. The loop becomes: get frame → `payload = pipeline.process(frame, frame_index, timestamp)` → send → snapshot check using `payload["fireDetected"]` / `payload["smokeDetected"]`.

### 3.4 `backend/ML/evaluate.py` (new, run by hand)

```
python evaluate.py [video ...] [--imgsz N]
```

- With no video names, it runs every `.mp4` in `test_video/`.
- It runs as fast as possible, with no backend and no HTTP.
- `--imgsz` overrides `detect_imgsz` for the stabilized pipeline. The baseline pipeline stays at 640 and is run on its own detections, so speed is reported for both.
- Per frame: run the detector once (twice only if `--imgsz` differs from 640), then feed the same detections to a **baseline** pipeline and a **stabilized** pipeline (settings from `backend/.env`).
- Prints one row per video:

```
video                    frames  fire% base→stab  smoke% base→stab  flickers base→stab  sev changes base→stab  ms/frame
```

  - **fire% / smoke%:** share of frames with `fireDetected` / `smokeDetected` true.
  - **flickers:** number of true→false transitions of `fireDetected` plus those of `smokeDetected`.
  - **sev changes:** number of frames where `fireSeverity` differs from the previous frame while both frames have fire detected.
  - **ms/frame:** mean detector time per frame for the stabilized settings (and baseline when `--imgsz` is set).
- A video that can't be opened is reported and skipped.

There is no overall accuracy score, because the test videos have no ground-truth boxes. True precision and recall are measured in Stage 2 on D-Fire's labeled test set.

## 4. Behavior

### 4.1 Per-frame steps in `FramePipeline.analyze`

1. **Filter:** `filter_by_confidence(detections, fire_conf_min, smoke_conf_min)`.
2. **Vote:** `fire_confirmed = fire_vote.update(any fire)`, `smoke_confirmed = smoke_vote.update(any smoke)`.
3. **Hold through a missed frame:** if `fire_confirmed` but this frame has no fire box, use the strongest fire box and confidence from the most recent frame that had one. The same applies for smoke. A confirmed vote always has a recent hit within the last N frames, so a held box exists. If none does (defensive case), the class is treated as not confirmed for this frame.
4. **Severity:** if `fire_confirmed`, crop `pad_box(strongest fire box, crop_pad, w, h)`, call `classify(crop)`, and pass the label through `severity_vote.update(label)`. `fireSeverity` is the voted label. `fireSeverityConf` is the classifier confidence of the current frame. If not confirmed, call `severity_vote.reset()` and leave severity fields `None`.
5. **Trend:** `TemporalGrowthClassifier.update_and_evaluate` receives the *filtered* detections of this frame (not held boxes), same as today otherwise.
6. **Threat score:** `calculate_urgency_score` as today, using confirmed flags. Fire takes precedence, then smoke.
7. **Boxes:** `boxes` contains only boxes of confirmed classes from this frame. When a confirmed class has no box this frame (step 3), its held box is included. Box ids, labels and percentage coordinates are formatted as today.

The payload fields and their types are identical to today's `frame_payload` in `detect.py`.

### 4.2 Settings (`backend/.env`, defaults in code)

| Variable | Default | Today | Valid |
|---|---|---|---|
| `FIRE_CONF_MIN` | 0.25 | 0.25 | 0 < x ≤ 1 |
| `SMOKE_CONF_MIN` | 0.25 | 0.25 | 0 < x ≤ 1 |
| `VOTE_K` | 3 | 1 | integer, 1 ≤ K ≤ N |
| `VOTE_N` | 5 | 1 | integer ≥ 1 |
| `SEVERITY_WINDOW` | 9 | 1 | integer ≥ 1 |
| `CROP_PAD` | 0 | 0 | 0 ≤ x ≤ 1 |
| `DETECT_IMGSZ` | 640 | 640 | integer, multiple of 32, ≥ 320 |

Defaults were tuned with `evaluate.py` during implementation. Thresholds of 0.40/0.35 cut real fire on `severe.mp4` from 50% to 7% of frames. A 15% crop pad made severity jump more, because the classifier was trained on tight crops. So both stay at today's values, and the gain comes from voting and severity smoothing. Raise them later if a no-fire clip shows false alarms that voting doesn't catch.

Setting every variable to the "Today" column reproduces current behavior. That's both the rollback and the baseline used by `evaluate.py`.

Votes count analysed frames, not seconds. On this CPU the webcam is analysed at roughly 5–10 frames per second, so 3-of-5 adds about 0.5–1 s before an alert. This was accepted in brainstorming.

### 4.3 Snapshots

Automatic snapshots trigger on the *confirmed* `fireDetected` / `smokeDetected`, with the existing cooldown (`SNAPSHOT_COOLDOWN_S`). The manual Capture button is unchanged and works at any time.

## 5. Error handling

- An invalid setting stops `detect.py` and `evaluate.py` at startup with a message naming the variable and the valid range. There is no silent fallback.
- An empty or zero-size crop: `classify_fire_crop` already returns `("Moderate", 0.0)`, and that is kept.
- `evaluate.py` skips a video it can't open, prints a notice and continues. It exits non-zero only if no video could be processed.

## 6. Testing

Use `unittest`, in the style of `backend/ML/tests/test_snapshot_trigger.py`, with no real models.

- `tests/test_stabilizer.py`
  - per-class thresholds, including the exact-threshold case
  - `PresenceVote` turns on at the K-th hit, turns off when hits drop below K, and handles the warm-up with fewer than N frames
  - `SeverityVote`: majority, tie goes to most recent, reset
  - `pad_box`: growth, clamping at every edge, `fraction = 0`
- `tests/test_pipeline.py` with a fake detector and classifier
  - a one-frame flicker gives `fireDetected` false and no boxes
  - a steady fire is confirmed on frame K
  - a single missed frame inside a confirmed run keeps `fireDetected` true and reuses the held box
  - severity is smoothed and is reset after fire is lost
  - `PipelineSettings.baseline()` gives the same detection flags and boxes per frame as the current logic on a scripted sequence
- `PipelineSettings.from_env`: defaults, valid overrides, and each invalid case raises with the variable name.
- **Manual:** run `evaluate.py` on the four test videos plus a no-fire webcam clip (see §7) and record the table in the implementation summary.

## 7. Measuring false alarms

None of the four test videos is free of fire or smoke, so false alarms can't be measured with them. Before the manual evaluation, record a ~30 s no-fire webcam clip into `backend/ML/test_video/` (e.g. `no_fire.mp4`) showing likely triggers: a lamp, red or orange objects, a sunset image on a screen. No labeling is needed. Any detection in that clip is a false alarm.

## 8. Follow-up (Stage 2, separate spec)

Fine-tune both models in Google Colab from the current weights:

- detector on D-Fire plus the user's own frames
- severity classifier on hand-sorted fire crops

Compare against the current models on D-Fire's labeled test set and with `evaluate.py`. If the original teammate's datasets arrive, merge them and retrain.
