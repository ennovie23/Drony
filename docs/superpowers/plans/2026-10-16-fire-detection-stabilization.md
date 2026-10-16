# Fire Detection Stabilization (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut false alarms, flicker and severity jumps from the existing fire/smoke models without retraining, and add a script that measures the improvement.

**Architecture:** New pure helpers in `stabilizer.py` (thresholds, K-of-N vote, severity vote, padded box). A `FramePipeline` in `pipeline.py` takes over the per-frame analysis that now lives inline in `detect.py`; the detector and severity classifier are passed in. `detect.py` keeps only the source, stream, snapshots and HTTP, and calls `pipeline.process`. `evaluate.py` runs one detector pass per frame into a baseline pipeline and a stabilized pipeline, then prints a comparison table.

**Tech Stack:** Python 3.14, ultralytics YOLO, OpenCV, numpy, python-dotenv, `unittest`.

**Spec:** `docs/superpowers/specs/2026-10-16-fire-detection-stabilization-design.md`

## Global Constraints

- All work is in `backend/ML/`. Run tests from there with `python -m unittest` (currently 15 tests, all pass).
- No retraining; `best.pt` and `best_severity.pt` are untouched.
- The payload fields and types sent to `/api/detections` and `/api/snapshots` stay identical. No backend, database or frontend changes.
- Unchanged modules: `temporal_behavior.py`, `threat_fusion.py`, `snapshot_trigger.py`, `live_stream.py`, `frame_grabber.py`, `severity.py`.
- `pipeline.py` and `stabilizer.py` must not import `severity.py` or `ultralytics` (importing `severity.py` loads a model). Tests use fakes.
- Settings, with defaults / today's values / valid ranges:
  - `FIRE_CONF_MIN` 0.40 / 0.25 / 0 < x ≤ 1
  - `SMOKE_CONF_MIN` 0.35 / 0.25 / 0 < x ≤ 1
  - `VOTE_K` 3 / 1 / integer, 1 ≤ K ≤ N
  - `VOTE_N` 5 / 1 / integer ≥ 1
  - `SEVERITY_WINDOW` 9 / 1 / integer ≥ 1
  - `CROP_PAD` 0.15 / 0 / 0 ≤ x ≤ 1
  - `DETECT_IMGSZ` 640 / 640 / integer, multiple of 32, ≥ 320
- An invalid setting raises `ValueError` whose message contains the variable name and the valid range. No silent fallback.
- Code style matches the existing ML modules: plain functions/classes, short docstrings, snake_case.

## Review Focus

1. **Env values with spaces or empty strings** (e.g. `FIRE_CONF_MIN=0.4 ` or `VOTE_K=`). Expected: surrounding whitespace is stripped; an empty string counts as missing and uses the default. Test in Task 2.
2. **Boxes partly outside the frame or with negative coordinates** (YOLO can return slightly out-of-range floats). Expected: `pad_box` clamps, and the crop never errors. Test in Task 1 and Task 3.
3. **Several fire boxes in one frame.** Expected: severity and confidence use the highest-confidence box, as today; all boxes of a confirmed class are sent. Test in Task 3.
4. **Fire and smoke confirmed at the same time.** Expected: the threat score uses fire (fire takes precedence), and both classes' boxes are sent. Test in Task 3.
5. **`evaluate.py` with no video that opens** (wrong name, or an empty `test_video/`). Expected: a notice per video and exit code 1. Test in Task 5.

---

### Task 1: Stabilizer helpers

**Files:**
- Create: `backend/ML/stabilizer.py`
- Test: `backend/ML/tests/test_stabilizer.py`

**Interfaces:**
- Produces:
  - `filter_by_confidence(detections: list[dict], fire_min: float, smoke_min: float) -> list[dict]`. Each detection is `{"label": str, "conf": float (0–1), "box": [x1, y1, x2, y2]}`. Order is preserved. Labels other than fire/smoke pass through.
  - `PresenceVote(k: int, n: int)` with `.update(seen: bool) -> bool`
  - `SeverityVote(n: int)` with `.update(label: str) -> str` and `.reset() -> None`
  - `pad_box(box: list[float], fraction: float, width: float, height: float) -> list[float]`

- [ ] **Step 1: Write the failing tests** in `tests/test_stabilizer.py`:

```python
def det(label, conf): return {"label": label, "conf": conf, "box": [0, 0, 10, 10]}

# filter_by_confidence
test_keeps_fire_at_exact_threshold:  filter([det("fire",0.40)], 0.40, 0.35) -> 1 item
test_drops_fire_below_threshold:     filter([det("fire",0.39)], 0.40, 0.35) -> []
test_smoke_uses_own_threshold:       filter([det("smoke",0.36), det("fire",0.36)], 0.40, 0.35) -> labels == ["smoke"]
test_other_labels_pass_through:      filter([det("person",0.01)], 0.4, 0.35) -> 1 item

# PresenceVote(3, 5)
test_vote_turns_on_at_kth_hit:  updates True,True -> False,False; third True -> True
test_vote_warmup_counts_missing_as_false:  PresenceVote(3,5): True,False,True -> [False,False,False]
test_vote_turns_off_when_hits_drop_below_k:  T,T,T,F,F -> [F,F,T,T,T]; a sixth update F -> False (window is now T,T,F,F,F, 2 hits)
test_vote_1_of_1_is_passthrough:  PresenceVote(1,1): T,F,T -> [T,F,T]

# SeverityVote(3)
test_majority_wins:  Minor,Severe,Minor -> last return "Minor"
test_tie_goes_to_most_recent:  SeverityVote(2): Minor,Severe -> "Severe"
test_window_drops_old_labels:  SeverityVote(3): Minor,Minor,Severe,Severe -> "Severe"
test_reset_clears_history:  Minor,Minor, reset(), Severe -> "Severe"

# pad_box
test_pad_grows_each_side:  pad_box([100,100,200,150], 0.1, 640, 360) == [90,95,210,155]
test_pad_clamps_to_frame:  pad_box([0,0,640,360], 0.5, 640, 360) == [0,0,640,360]
test_pad_clamps_out_of_range_input:  pad_box([-5,-3,700,400], 0, 640, 360) == [0,0,640,360]
test_zero_pad_returns_box:  pad_box([10,20,30,40], 0, 640, 360) == [10,20,30,40]
```

Write each as a `unittest.TestCase` method with the exact values above.

- [ ] **Step 2: Run to verify failure**

Run: `python -m unittest tests.test_stabilizer -v`
Expected: ERROR, `ModuleNotFoundError: No module named 'stabilizer'`

- [ ] **Step 3: Implement `stabilizer.py`** with the four interfaces above. Use `collections.deque(maxlen=n)` for both votes. `SeverityVote` tie-break: among labels with the top count, return the one whose last occurrence is latest. `pad_box` pads by `fraction × box width` horizontally and `fraction × box height` vertically.

- [ ] **Step 4: Run to verify pass**

Run: `python -m unittest -v`
Expected: all tests pass (15 existing + the new ones).

- [ ] **Step 5: Commit**

```bash
git add backend/ML/stabilizer.py backend/ML/tests/test_stabilizer.py
git commit -m "feat(ml): stabilizer helpers for thresholds, frame voting and padded crops"
```

---

### Task 2: Pipeline settings

**Files:**
- Create: `backend/ML/pipeline.py` (settings only in this task)
- Test: `backend/ML/tests/test_pipeline_settings.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) class PipelineSettings` with fields `fire_conf_min: float, smoke_conf_min: float, vote_k: int, vote_n: int, severity_window: int, crop_pad: float, detect_imgsz: int`.
  - `PipelineSettings.from_env(env: Mapping[str, str]) -> PipelineSettings` uses the defaults from Global Constraints.
  - `PipelineSettings.baseline() -> PipelineSettings` uses today's values: `0.25, 0.25, 1, 1, 1, 0.0, 640`.

- [ ] **Step 1: Write the failing tests**

```python
test_defaults_when_env_empty:  from_env({}) == PipelineSettings(0.40, 0.35, 3, 5, 9, 0.15, 640)
test_overrides_are_parsed:  from_env({"FIRE_CONF_MIN":"0.5","VOTE_K":"2","VOTE_N":"4","DETECT_IMGSZ":"960"}) -> fire_conf_min 0.5, vote_k 2, vote_n 4, detect_imgsz 960
test_whitespace_stripped_and_empty_means_default:  from_env({"FIRE_CONF_MIN":" 0.5 ","VOTE_K":""}) -> fire_conf_min 0.5, vote_k 3
test_baseline_values:  baseline() == PipelineSettings(0.25, 0.25, 1, 1, 1, 0.0, 640)
test_invalid_values_raise_with_name:  for each (var, value) in
    [("FIRE_CONF_MIN","0"), ("FIRE_CONF_MIN","1.5"), ("SMOKE_CONF_MIN","abc"),
     ("VOTE_K","0"), ("VOTE_N","0"), ("VOTE_K","2.5"), ("SEVERITY_WINDOW","0"),
     ("CROP_PAD","-0.1"), ("CROP_PAD","1.1"), ("DETECT_IMGSZ","500"), ("DETECT_IMGSZ","288")]:
    with self.subTest(var=var, value=value):
        with assertRaisesRegex(ValueError, var): from_env({var: value})
test_k_greater_than_n_raises:  from_env({"VOTE_K":"6","VOTE_N":"5"}) raises ValueError matching "VOTE_K"
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m unittest tests.test_pipeline_settings -v`
Expected: ERROR, `No module named 'pipeline'`

- [ ] **Step 3: Implement `PipelineSettings`** in `pipeline.py`. A small private parser takes `(env, name, default, cast, check, range_text)`. The error message format is `f"{name} must be {range_text} (got {raw!r})"`. Integers are parsed with `int()`, so `"2.5"` is rejected.

- [ ] **Step 4: Run to verify pass**

Run: `python -m unittest -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/ML/pipeline.py backend/ML/tests/test_pipeline_settings.py
git commit -m "feat(ml): pipeline settings from env with validation and baseline"
```

---

### Task 3: FramePipeline

**Files:**
- Modify: `backend/ML/pipeline.py`
- Test: `backend/ML/tests/test_pipeline.py`

**Interfaces:**
- Consumes: everything from Task 1; `PipelineSettings` from Task 2; `TemporalGrowthClassifier(window_size=15)` from `temporal_behavior`; `calculate_urgency_score(detection, behavior)` from `threat_fusion`.
- Produces: `class FramePipeline(detector, classify, settings: PipelineSettings, frame_width: float, frame_height: float)`
  - `detector`: a callable with the YOLO call signature, `detector(frame, conf=..., imgsz=..., verbose=False)`, returning ultralytics results. It must also expose `.names` (dict index → label).
  - `classify(crop) -> (label: str, conf: float)`, i.e. `severity.classify_fire_crop`
  - `run_detector(frame) -> list[dict]` returns `{"label","conf","box"}`, where `box` is a list of 4 floats in pixels
  - `analyze(frame, detections: list[dict], frame_index: int, timestamp: str) -> dict` returns the payload
  - `process(frame, frame_index: int, timestamp: str) -> dict`

Payload keys (identical to today's `frame_payload` in `detect.py`): `timestamp, fireDetected, fireConfidence, fireSeverity, fireSeverityConf, fireTrend, fireTrendSlope, smokeDetected, smokeConfidence, smokeTrend, smokeTrendSlope, threatScore, frameIndex, boxes`.

Rules carried over unchanged from `detect.py`, so baseline output matches today:

- `fireConfidence = round(conf * 100, 2)` of the strongest box. Same for smoke.
- `fireSeverityConf = round(raw * 100, 2) if raw <= 1.0 else round(raw, 2)`.
- `threatScore` uses the same `calculate_urgency_score` arguments as today. Smoke-only uses severity `"Minor"`.
- Each entry in `boxes` is formatted as today: `id f"{label}_{idx}"`, `confidence` rounded to 4 places, `bboxX1..Y2` as percentages rounded to 4 places. `idx` is the index within this frame's filtered detection list. A held box uses `idx` 0.
- The severity crop is `frame[int(y1):int(y2), int(x1):int(x2)]` of the `pad_box(...)` result.

- [ ] **Step 1: Write the failing tests.** Test the logic through `analyze(...)` with scripted detection lists, a `numpy.zeros((360, 640, 3), uint8)` frame, and a fake `classify` that returns labels from a list and records crop shapes. Frame size is 640×360.

```python
F = lambda conf=0.9, box=(100,100,200,200): {"label":"fire","conf":conf,"box":list(box)}
S = lambda conf=0.9, box=(300,50,400,150): {"label":"smoke","conf":conf,"box":list(box)}
default settings = PipelineSettings.from_env({})   # 3 of 5, etc.

test_single_frame_flicker_not_reported:  frames [[F()],[],[],[]] -> every payload fireDetected False, boxes == []
test_steady_fire_confirmed_on_third_frame:  [[F()]]*3 -> fireDetected [False, False, True]; third payload boxes has 1 entry with label "fire"
test_low_confidence_fire_ignored:  [[F(0.39)]]*5 -> all fireDetected False
test_missed_frame_holds_last_box:  [[F()],[F()],[F()],[]] -> 4th fireDetected True, fireConfidence 90.0, boxes[0]["id"] == "fire_0"
test_severity_is_voted:  classify returns Minor,Minor,Severe,Minor... over [[F()]]*6 -> fireSeverity on frames 3..6 == "Minor" each
test_severity_resets_after_fire_lost:  window 9; 5 fire frames (classify "Minor"), 5 empty frames, then 3 fire frames (classify "Severe") -> last payload fireSeverity "Severe"
test_severity_crop_is_padded:  box (100,100,200,200), crop_pad 0.15 -> classify received crop shape (130, 130, 3)
test_box_out_of_frame_does_not_crash:  [[F(box=(-20,-10,700,400))]]*3 -> fireDetected True, crop shape (360, 640, 3)
test_strongest_fire_box_drives_confidence:  [[F(0.5,(0,0,10,10)), F(0.95,(100,100,200,200))]]*3 -> fireConfidence 95.0, len(boxes) == 2
test_fire_takes_precedence_with_smoke:  [[F(), S()]]*3 -> fireDetected and smokeDetected True, labels in boxes == {"fire","smoke"}, threatScore equals calculate_urgency_score built from the fire values
test_baseline_matches_raw_per_frame:  baseline settings, frames [[F(0.3)],[],[S(0.26)],[F(0.24)]] -> fireDetected [T,F,F,F], smokeDetected [F,F,T,F], boxes counts [1,0,1,0]
test_run_detector_converts_results:  fake detector returning one result whose boxes have xyxy [[1,2,3,4]], cls [0], conf [0.8], names {0:"fire"} -> run_detector == [{"label":"fire","conf":0.8,"box":[1.0,2.0,3.0,4.0]}]; the fake also asserts it was called with conf=0.35, imgsz=640
```

For `test_run_detector_converts_results`, build the fake with simple objects whose `xyxy[0].tolist()`, `cls[0]` and `conf[0]` behave like ultralytics boxes. Small numpy arrays are enough.

- [ ] **Step 2: Run to verify failure**

Run: `python -m unittest tests.test_pipeline -v`
Expected: ERROR, `cannot import name 'FramePipeline'`

- [ ] **Step 3: Implement `FramePipeline`** following spec §4.1, steps 1–7. Keep the last strongest box per class (`self._last_fire`, `self._last_smoke`) for the hold step. Clear them when that class's vote turns off. Feed `TemporalGrowthClassifier.update_and_evaluate` the filtered detections mapped to `{"class": label, "box": box}`. `fireTrend`/`fireTrendSlope` come from `behavior["fire_behavior"]` only when fire is confirmed, else `None`; the same applies for smoke.

- [ ] **Step 4: Run to verify pass**

Run: `python -m unittest -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/ML/pipeline.py backend/ML/tests/test_pipeline.py
git commit -m "feat(ml): FramePipeline with confirmed detections and smoothed severity"
```

---

### Task 4: Slim `detect.py` onto the pipeline

**Files:**
- Modify: `backend/ML/detect.py` (replace the inline analysis in the main loop, currently roughly lines 154–286)

**Interfaces:**
- Consumes: `PipelineSettings.from_env`, `FramePipeline(...).process(frame, frame_index, timestamp)` from Tasks 2–3; `classify_fire_crop` from `severity`.

- [ ] **Step 1: Read settings early and build the pipeline once at startup.**
  - Immediately after `load_dotenv(...)`, before any video or model is opened, wrap `PipelineSettings.from_env(os.environ)` in `try/except ValueError as e: print(f"Error: {e}"); exit(1)`.
  - Once the model and capture are set up and `frame_width`/`frame_height` are known, create `pipeline = FramePipeline(model, classify_fire_crop, settings, frame_width, frame_height)`.
  - Print one line with the active settings.
  - Remove the now-unused `growth_tracker`, `calculate_urgency_score` and `TemporalGrowthClassifier` imports and objects from `detect.py`.

- [ ] **Step 2: Replace Steps 1–6 in the loop** with `frame_payload = pipeline.process(frame, frame_index, datetime.now(timezone.utc).isoformat())`. Pass `frame_payload["fireDetected"]` and `frame_payload["smokeDetected"]` to `snapshot_trigger.check`. Sending, snapshot encoding and throttling stay as they are.

- [ ] **Step 3: Run unit tests**

Run: `python -m unittest -v`
Expected: all pass.

- [ ] **Step 4: Check that bad settings stop it**

Run (bash): `VOTE_K=9 python detect.py`
Expected: prints `Error: VOTE_K must be ...` and exits with code 1 before opening any video.

Note: `load_dotenv` does not override variables that are already set, so the inline value wins.

- [ ] **Step 5: Smoke-run on a file**

Run (bash): `VIDEO_SOURCE=file ACTIVE_VIDEO=severe.mp4 timeout 20 python detect.py`
Expected: the "Starting detection on severe.mp4" line, then no Python traceback within 20 s. "Failed to send assessment" lines are fine if the backend isn't running. If the backend is running (`npm run dev` in `backend/`), check that `GET http://localhost:5001/api/detections` returns fresh rows with `fireDetected: true`.

- [ ] **Step 6: Commit**

```bash
git add backend/ML/detect.py
git commit -m "refactor(ml): detect.py delegates per-frame analysis to FramePipeline"
```

---

### Task 5: `evaluate.py`

**Files:**
- Create: `backend/ML/evaluate.py`
- Test: `backend/ML/tests/test_evaluate.py`

**Interfaces:**
- Consumes: `PipelineSettings`, `FramePipeline` (`run_detector` and `analyze`).
- Produces:
  - `summarize(payloads: list[dict]) -> dict` with keys `frames, fire_pct, smoke_pct, flickers, sev_changes`
  - `main(argv: list[str]) -> int` returns the exit code

Notes:

- `evaluate.py` loads models only inside `main`, never at import, so `summarize` can be tested without models. Import `severity` inside `main` for the same reason.
- `main` builds one detector run per frame at the baseline size 640. A second run at `--imgsz` happens only when it differs from 640.

- [ ] **Step 1: Write the failing tests**

```python
def p(fire, smoke=False, sev=None): return {"fireDetected": fire, "smokeDetected": smoke, "fireSeverity": sev}

test_summarize_rates:  summarize([p(True), p(True), p(False), p(False, True)]) -> frames 4, fire_pct 50.0, smoke_pct 25.0
test_summarize_flickers_count_true_to_false:  fire T,F,T,F and smoke F,T,F,F -> flickers 3
test_summarize_sev_changes_only_while_fire:  [p(T,sev="Minor"), p(T,sev="Severe"), p(F), p(T,sev="Minor"), p(T,sev="Minor")] -> sev_changes 1
test_summarize_empty:  summarize([]) -> frames 0, fire_pct 0.0, smoke_pct 0.0, flickers 0, sev_changes 0
test_main_returns_1_when_no_video_opens:  main(["does_not_exist.mp4"]) == 1
```

For the last test, pass a `load_models` hook so no real model loads: `main(argv, load_models=lambda: (fake_detector, fake_classify))`. With the default `load_models=None`, `main` loads `best.pt` and `severity.classify_fire_crop`. Check that each video opens before loading models, so the last test never needs models.

- [ ] **Step 2: Run to verify failure**

Run: `python -m unittest tests.test_evaluate -v`
Expected: ERROR, `No module named 'evaluate'`

- [ ] **Step 3: Implement `evaluate.py`**
  - Parse arguments with `argparse`: positional `videos` (names in `test_video/`; default all `*.mp4`), plus `--imgsz` (int, validated like `DETECT_IMGSZ`).
  - Load `backend/.env` with `load_dotenv` as `detect.py` does. Stabilized settings come from `PipelineSettings.from_env(os.environ)`, with `detect_imgsz` replaced by `--imgsz` when given (`dataclasses.replace`).
  - Read each video with `cv2.VideoCapture` until it ends, without looping. Create fresh baseline and stabilized pipelines per video.
  - Time `run_detector` with `time.perf_counter()`.
  - Print the table from spec §3.4. Each before→after pair is printed as `base → stab`. The `ms/frame` column shows stabilized timing, and when `--imgsz` is set it shows `base/stab`.
  - Return 1 if no video was processed, else 0.
  - End with `if __name__ == "__main__": sys.exit(main(sys.argv[1:]))`.

- [ ] **Step 4: Run to verify pass**

Run: `python -m unittest -v`
Expected: all pass.

- [ ] **Step 5: Manual run on the real videos**

Run: `python evaluate.py`
Expected: one row for each of `growing_diminishing.mp4`, `moderate.mp4`, `severe.mp4`, `smoke.mp4`, with no traceback. Stabilized flickers and sev changes should be ≤ baseline on each row. Save the table output for the final summary.

Then run `python evaluate.py --imgsz 960` and save the table as well, to report its ms/frame.

If the user has recorded `test_video/no_fire.mp4` (spec §7), include it in the run and report its fire% / smoke% for both columns. If it doesn't exist, say so in the summary instead of skipping silently.

- [ ] **Step 6: Commit**

```bash
git add backend/ML/evaluate.py backend/ML/tests/test_evaluate.py
git commit -m "feat(ml): evaluate.py compares baseline and stabilized pipelines on test videos"
```
