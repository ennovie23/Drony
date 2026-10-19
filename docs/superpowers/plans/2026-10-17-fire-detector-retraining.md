# Fire Detector Retraining (Stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare D-Fire on the laptop, retrain two nano detectors in Colab, pick a winner by a fixed rule, and let the laptop try it (and roll back) by changing one setting.

**Architecture:** Pure, locally tested Python modules in `backend/ML/training/`:
- `prepare_dfire.py`: zips in, a ready dataset zip out
- `compare.py`: scores models and picks the winner

A thin Colab notebook calls them. The laptop side gains a `DETECTOR_WEIGHTS` setting and `evaluate.py --weights`.

**Tech Stack:** Python 3.14 (laptop), Colab Python, ultralytics 8.4.176, OpenCV, `zipfile`, `unittest`.

**Spec:** `docs/superpowers/specs/2026-10-17-fire-detector-retraining-design.md`

## Global Constraints

- New code lives in `backend/ML/training/`, with an empty `__init__.py`. Tests live in `backend/ML/tests/` and run from `backend/ML` with `python -m unittest` (currently 57 tests pass).
- Modules inside `training/` must not import each other or anything from `backend/ML`. In Colab they are imported as top-level modules after `sys.path.insert(0, '/content/drive/MyDrive/drony/training')`.
- ultralytics pinned to `8.4.176` in the notebook.
- Class ids out: `0 = fire`, `1 = smoke`. D-Fire in: `0 = smoke`, `1 = fire`.
- Expected real counts (from the spec, §3):
  - images: train 13,776, val 3,445, test 4,306
  - boxes: 14,692 fire and 11,865 smoke before any are dropped
  - empty label files: 9,838
  - boxes clipped plus dropped: 26 (for the real-run check)
- Official lists inside the splits zip:
  - `Data splitting/5-fold cross validation/dfire_train1.txt` → train
  - `.../dfire_valid1.txt` → val
  - `Data splitting/dfire_test.txt` → test
- Paths inside the images zip: `train/images/<name>.jpg`, `train/labels/<name>.txt`, and the same under `test/`.
- Winner rule: among candidates with precision ≥ (old model precision at the same imgsz − 0.02) and recall > the old model's recall at that imgsz, pick the highest recall; ties go to higher mAP50; `None` means keep the old model. Image sizes are 640 and 960.
- Free space needed on the output drive: 7 GB.
- `best.pt` is never overwritten. The winner is called `best_v2.pt`.
- Nothing in this plan downloads files or touches Google Drive from the laptop. Uploads are the user's manual step.

## Review Focus

1. **Re-running `prepare_dfire.py` after an earlier run.** Expected: outputs are replaced cleanly, with no stale files from the previous run left in the dataset. Test in Task 2.
2. **Label files with blank lines, trailing spaces or Windows line endings.** Expected: these are tolerated, and only truly broken lines stop the script. Test in Task 1.
3. **An image whose label file is missing from the zip.** Expected: the script stops and names it, instead of silently treating it as an empty (no-fire) image. Test in Task 2.
4. **`DETECTOR_WEIGHTS` with surrounding spaces or an empty value.** Expected: spaces are stripped, and an empty value means `best.pt`. Test in Task 4.
5. **The notebook is run again after both candidates already finished.** Expected: finished candidates are skipped, not retrained or crashed. This is guarded in Task 5's resume helper and tested there.

---

### Task 1: Label rewriting and split assignment

**Files:**
- Create: `backend/ML/training/__init__.py` (empty), `backend/ML/training/prepare_dfire.py`
- Test: `backend/ML/tests/test_prepare_dfire_labels.py`

**Interfaces:**
- Produces, in `training/prepare_dfire.py`:
  - `class LabelError(ValueError)`
  - `rewrite_label(text: str, source: str) -> tuple[str, int, int]` returns `(new_text, clipped_count, dropped_count)`. `source` is used only in error messages.
  - `assign_splits(image_names: set[str], lists: dict[str, set[str]]) -> dict[str, str]` maps image name to split. `lists` has the keys `"train"`, `"val"`, `"test"`. It raises `LabelError` naming the first offending image.

Rules:
- Each non-blank line is `cls cx cy w h`.
- Class is swapped: `0→1`, `1→0`.
- The box is converted to corners, clipped to [0, 1], and converted back. It counts as *clipped* if any value changed. It is *dropped* if its width or height is ≤ 0 after clipping.
- Output lines are formatted `f"{cls} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}"` and joined with `"\n"`, with a trailing `"\n"` when there is any line. An empty input gives `""`.
- `LabelError` messages contain `source` and the 1-based line number.

- [ ] **Step 1: Write the failing tests**

```python
test_swaps_smoke_to_1_and_fire_to_0:
    rewrite_label("0 0.5 0.5 0.2 0.2\n1 0.3 0.3 0.1 0.1\n", "a.txt")
    == ("1 0.500000 0.500000 0.200000 0.200000\n0 0.300000 0.300000 0.100000 0.100000\n", 0, 0)
test_empty_label_stays_empty:          rewrite_label("", "a.txt") == ("", 0, 0)
test_tolerates_blank_lines_spaces_crlf: rewrite_label("\r\n0 0.5 0.5 0.2 0.2  \r\n\r\n", "a.txt")[0] == "1 0.500000 0.500000 0.200000 0.200000\n"
test_clips_box_past_right_edge:
    rewrite_label("1 0.95 0.5 0.2 0.2\n", "a.txt") == ("0 0.925000 0.500000 0.150000 0.200000\n", 1, 0)
test_drops_box_fully_outside:          rewrite_label("1 1.2 0.5 0.1 0.1\n", "a.txt") == ("", 0, 1)
test_bad_lines_raise_with_file_and_line:
    for text in ["0 0.5 0.5 0.2\n", "2 0.5 0.5 0.2 0.2\n", "0 a 0.5 0.2 0.2\n"]:
        with subTest(text=text):
            assertRaisesRegex(LabelError, r"a\.txt.*line 1", rewrite_label, text, "a.txt")

lists = {"train": {"a.jpg"}, "val": {"b.jpg"}, "test": {"c.jpg"}}
test_assigns_each_image_to_its_list:   assign_splits({"a.jpg","b.jpg","c.jpg"}, lists) == {"a.jpg":"train","b.jpg":"val","c.jpg":"test"}
test_listed_image_missing_raises:      assign_splits({"a.jpg","b.jpg"}, lists) raises LabelError matching "c.jpg"
test_unlisted_image_raises:            assign_splits({"a.jpg","b.jpg","c.jpg","d.jpg"}, lists) raises LabelError matching "d.jpg"
test_image_in_two_lists_raises:        assign_splits({"a.jpg","b.jpg","c.jpg"}, {**lists, "val": {"a.jpg","b.jpg"}}) raises LabelError matching "a.jpg"
```

- [ ] **Step 2: Run them to see them fail**

Run: `python -m unittest tests.test_prepare_dfire_labels -v`
Expected: ERROR, `No module named 'training'`

- [ ] **Step 3: Implement `rewrite_label` and `assign_splits`** following the rules above. Report missing, unlisted and duplicate names in sorted order, so messages are deterministic.

- [ ] **Step 4: Run the full suite**

Run: `python -m unittest`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add backend/ML/training/__init__.py backend/ML/training/prepare_dfire.py backend/ML/tests/test_prepare_dfire_labels.py
git commit -m "feat(training): D-Fire label rewriting (class swap, clipping) and official split assignment"
```

---

### Task 2: `prepare()` end to end, CLI, and real run

**Files:**
- Modify: `backend/ML/training/prepare_dfire.py`
- Test: `backend/ML/tests/test_prepare_dfire.py`

**Interfaces:**
- Consumes: `rewrite_label`, `assign_splits`, `LabelError` (Task 1).
- Produces:
  - `@dataclass(frozen=True) class Expected` with fields `train: int, val: int, test: int, fire: int, smoke: int`
  - `DFIRE_EXPECTED = Expected(13776, 3445, 4306, 14692, 11865)`
  - `prepare(images_zip: str, splits_zip: str, out_dir: str, expected: Expected = DFIRE_EXPECTED, min_free_bytes: int = 7 * 10**9, preview_count: int = 12) -> dict`. It returns a summary with keys `images` (`{split: n}`), `boxes` (`{split: {"fire": n, "smoke": n}}`), `empty` (`{split: n}`), `clipped`, `dropped`, `dataset_zip` (path) and `preview_dir` (path).
  - `main(argv: list[str]) -> int`, with flags `--images`, `--splits`, `--out` (default: the folder of `--images`). It prints the summary and returns 0, or prints `Error: <message>` and returns 1 on `LabelError` or `OSError`.

Behaviour:
- Check free space first with `shutil.disk_usage(out_dir).free`. If it's below `min_free_bytes`, raise `LabelError` mentioning `"free"`, before writing anything.
- Image names come from `*/images/*.jpg` entries in the images zip. Every image needs `*/labels/<stem>.txt`, otherwise raise `LabelError` naming the image.
- Before writing, delete any existing `<out>/D-Fire-drony/`, `<out>/D-Fire-drony-preview/` and `<out>/D-Fire-drony.zip`.
- Count check: split image counts must equal `expected.train/val/test`. Total boxes kept plus dropped must equal `expected.fire` / `expected.smoke` per class, counted after the swap and attributed by output class. A mismatch raises `LabelError` naming the count.
- Write `data.yaml` exactly:

```yaml
path: .
train: images/train
val: images/val
test: images/test
names:
  0: fire
  1: smoke
```

- Preview: take a fixed seed (`random.Random(0)`) over the train split. Pick up to 4 images containing fire, 4 containing smoke, 2 empty, and fill the rest to `preview_count` from any image. Draw boxes with `cv2.rectangle` and the `fire`/`smoke` text, and save them as `preview_01.jpg` … in `<out>/D-Fire-drony-preview/`.
- `D-Fire-drony.zip` is written with `ZIP_STORED`, with paths relative to `D-Fire-drony/` (so `data.yaml`, `images/...`, `labels/...` sit at the zip root).

Test fixture: a helper `make_zips(tmp, train={name: label_text}, test={...}, lists={"train":[...], "val":[...], "test":[...]})`. It writes a fake images zip with real tiny JPEGs (`cv2.imencode` of a 32×32 array) and a fake splits zip at the official internal paths.

- [ ] **Step 1: Write the failing tests**

```python
small = Expected(train=2, val=1, test=1, fire=2, smoke=1)
# train: t1 "1 .5 .5 .2 .2\n" (fire), t2 "0 .5 .5 .2 .2\n" (smoke), t3 "" (empty, goes to val); test: s1 "1 .5 .5 .2 .2\n"
test_writes_dataset_with_splits_and_swapped_labels:
    summary = prepare(...small, min_free_bytes=0, preview_count=3)
    summary["images"] == {"train": 2, "val": 1, "test": 1}
    (out/"D-Fire-drony/labels/train/t1.txt").read_text().startswith("0 ")   # fire is now 0
    (out/"D-Fire-drony/labels/val/t3.txt").read_text() == ""
    (out/"D-Fire-drony/images/test/s1.jpg").exists()
test_writes_data_yaml:              the file content equals the YAML block above
test_dataset_zip_has_root_layout:   names in D-Fire-drony.zip include "data.yaml" and "images/train/t1.jpg"
test_writes_previews:               len(list(preview_dir.glob("preview_*.jpg"))) == 3
test_count_mismatch_raises:         prepare(..., Expected(3,1,1,2,1), min_free_bytes=0) raises LabelError matching "train"
test_missing_label_file_raises:     image t1.jpg without labels/t1.txt -> LabelError matching "t1.jpg"
test_not_enough_space_raises_before_writing:
    prepare(..., min_free_bytes=10**18) raises LabelError matching "free"; not (out/"D-Fire-drony").exists()
test_rerun_leaves_no_stale_files:
    first run with an extra train image t9 (and Expected adjusted), second run without t9
    -> not (out/"D-Fire-drony/images/train/t9.jpg").exists()
test_main_returns_1_and_prints_error:
    main(["--images", missing, "--splits", missing]) == 1
```

- [ ] **Step 2: Run them to see them fail**

Run: `python -m unittest tests.test_prepare_dfire -v`
Expected: ERROR, `cannot import name 'Expected'`

- [ ] **Step 3: Implement `Expected`, `DFIRE_EXPECTED`, `prepare` and `main`** as specified. End the file with `if __name__ == "__main__": sys.exit(main(sys.argv[1:]))`.

- [ ] **Step 4: Run the full suite**

Run: `python -m unittest`
Expected: OK

- [ ] **Step 5: Real run on the user's downloads**

Run (from `backend/ML`, in the background because it takes minutes):

```
python training/prepare_dfire.py --images "C:\Users\ncflr\Downloads\D-Fire.zip" --splits "C:\Users\ncflr\Downloads\OneDrive_2026-10-16.zip"
```

Expected:
- exit 0
- images train 13,776 / val 3,445 / test 4,306
- clipped 26
- dropped 0, or a small number that's reported
- `C:\Users\ncflr\Downloads\D-Fire-drony.zip` exists, about 3 GB
- 12 previews in `C:\Users\ncflr\Downloads\D-Fire-drony-preview\`

Open 3 previews (with fire, smoke and empty) with the Read tool and confirm the boxes sit on fire and smoke. Report the summary. The user also checks the previews.

- [ ] **Step 6: Commit**

```bash
git add backend/ML/training/prepare_dfire.py backend/ML/tests/test_prepare_dfire.py
git commit -m "feat(training): prepare_dfire.py builds the ready-to-train D-Fire zip with previews"
```

---

### Task 3: `compare.py`

**Files:**
- Create: `backend/ML/training/compare.py`
- Test: `backend/ML/tests/test_compare.py`

**Interfaces:**
- Produces:
  - `pick_winner(rows: list[dict], old_name: str = "old", max_precision_drop: float = 0.02) -> tuple[str, int] | None`. Each row is `{"name", "imgsz", "precision", "recall", "map50", "map50_95", "ms_per_image"}`. It raises `ValueError` if a candidate's imgsz has no `old_name` row.
  - `score(model_path: str, data_yaml: str, imgsz: int) -> dict` returns a row. It calls `YOLO(model_path).val(data=data_yaml, split="test", imgsz=imgsz, batch=16, verbose=False)` and reads `metrics.box.mp`, `.mr`, `.map50`, `.map`, and `metrics.speed["inference"]`. Import `ultralytics` inside the function.
  - `main(models: dict[str, str], data_yaml: str, out_csv: str, sizes=(640, 960)) -> tuple[str, int] | None` scores every model at every size, prints an aligned table and then either `Winner: <name> @ <imgsz>` or `Keep the old model`, writes the CSV, and returns the winner.

- [ ] **Step 1: Write the failing tests**

```python
def row(name, imgsz, p, r, m50=0.5): return {"name": name, "imgsz": imgsz, "precision": p, "recall": r, "map50": m50, "map50_95": 0.3, "ms_per_image": 5.0}

test_picks_highest_recall_within_precision_budget:
    pick_winner([row("old",640,.77,.66), row("A",640,.76,.72), row("B",640,.80,.70)]) == ("A", 640)
test_rejects_precision_drop_over_002:
    pick_winner([row("old",640,.77,.66), row("A",640,.74,.90)]) is None
test_compares_against_old_at_same_size:
    pick_winner([row("old",640,.77,.66), row("old",960,.70,.75), row("A",960,.69,.80)]) == ("A", 960)
test_tie_goes_to_map50:
    pick_winner([row("old",640,.77,.66), row("A",640,.77,.70,.60), row("B",640,.77,.70,.65)]) == ("B", 640)
test_none_when_no_candidate_beats_old_recall:
    pick_winner([row("old",640,.77,.66), row("A",640,.78,.60)]) is None
test_missing_old_row_raises:
    pick_winner([row("old",640,.77,.66), row("A",960,.8,.8)]) raises ValueError
```

`test_none_when_no_candidate_beats_old_recall` pins the reading that a winner must also have **higher recall than the old model at its size**. The spec's success criterion is "catches more"; a candidate with equal or lower recall is not a winner.

- [ ] **Step 2: Run them to see them fail**

Run: `python -m unittest tests.test_compare -v`
Expected: ERROR, `No module named 'training.compare'`

- [ ] **Step 3: Implement `pick_winner`, `score` and `main`.** `score` and `main` aren't unit-tested (they need real models); they run in Task 5's notebook.

- [ ] **Step 4: Run the full suite**

Run: `python -m unittest`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add backend/ML/training/compare.py backend/ML/tests/test_compare.py
git commit -m "feat(training): compare.py scores models on the D-Fire test set and applies the winner rule"
```

---

### Task 4: `DETECTOR_WEIGHTS` and `evaluate.py --weights`

**Files:**
- Modify: `backend/ML/pipeline.py`, `backend/ML/detect.py` (lines 53–55), `backend/ML/evaluate.py` (`default_load_models`, `main`)
- Test: `backend/ML/tests/test_detector_weights.py`, `backend/ML/tests/test_evaluate.py`

**Interfaces:**
- Produces in `pipeline.py`: `detector_weights_path(env: Mapping[str, str], base_dir: str, override: str | None = None) -> str`.
  - The file name is `override` if given, else `env["DETECTOR_WEIGHTS"]` stripped, else `"best.pt"`. An empty or whitespace value counts as missing.
  - It returns `os.path.join(base_dir, name)`.
  - It raises `ValueError(f"DETECTOR_WEIGHTS file not found: {path}")` if the file doesn't exist.
- `evaluate.default_load_models(weights_path: str)` loads that detector. `main(argv, load_models=None)` gains `--weights`, resolves it with `detector_weights_path(os.environ, HERE, args.weights)` before any video is opened, calls `load_models(weights_path)`, and prints `Detector: <file name>` above the table.
- `detect.py` replaces the hard-coded path with `detector_weights_path(os.environ, os.path.dirname(__file__))`, inside the existing startup `try/except ValueError` that prints `Error: ...` and exits 1.

- [ ] **Step 1: Write the failing tests**

```python
# test_detector_weights.py — tmp dir containing best.pt and best_v2.pt (empty files)
test_default_is_best_pt:            detector_weights_path({}, tmp) == join(tmp, "best.pt")
test_env_override_stripped:         detector_weights_path({"DETECTOR_WEIGHTS": " best_v2.pt "}, tmp) == join(tmp, "best_v2.pt")
test_empty_value_means_default:     detector_weights_path({"DETECTOR_WEIGHTS": ""}, tmp) == join(tmp, "best.pt")
test_cli_override_wins:             detector_weights_path({"DETECTOR_WEIGHTS": "best.pt"}, tmp, "best_v2.pt") == join(tmp, "best_v2.pt")
test_missing_file_raises_with_name: detector_weights_path({"DETECTOR_WEIGHTS": "nope.pt"}, tmp) raises ValueError matching "nope.pt"

# test_evaluate.py — add
test_main_passes_weights_to_loader:
    uses the real test_video/smoke.mp4; the fake loader records its argument, then raises StopEvaluation (a test-local exception) to end the run;
    main(["smoke.mp4", "--weights", "best.pt"], load_models=recorder) raises StopEvaluation; recorder.path endswith "best.pt"
test_main_missing_weights_returns_1:
    main(["smoke.mp4", "--weights", "nope.pt"], load_models=never_called) == 1
```

- [ ] **Step 2: Run them to see them fail**

Run: `python -m unittest tests.test_detector_weights tests.test_evaluate -v`
Expected: ERROR or FAIL (`cannot import name 'detector_weights_path'`)

- [ ] **Step 3: Implement** `detector_weights_path`, the `evaluate.py` changes and the `detect.py` change as specified. In `evaluate.main`, a `ValueError` from `detector_weights_path` prints `Error: <message>` and returns 1. Update `test_main_returns_1_when_no_video_opens`'s loader to accept one argument.

- [ ] **Step 4: Run the full suite and smoke-check `detect.py`**

Run: `python -m unittest`
Expected: OK

Run (bash, from `backend/ML`): `DETECTOR_WEIGHTS=nope.pt python detect.py; echo "exit=$?"`
Expected: `Error: DETECTOR_WEIGHTS file not found: ...nope.pt` and `exit=1`

- [ ] **Step 5: Commit**

```bash
git add backend/ML/pipeline.py backend/ML/detect.py backend/ML/evaluate.py backend/ML/tests/test_detector_weights.py backend/ML/tests/test_evaluate.py
git commit -m "feat(ml): DETECTOR_WEIGHTS setting and evaluate.py --weights for trying retrained models"
```

---

### Task 5: Colab notebook and resume helper

**Files:**
- Create: `backend/ML/training/colab_steps.py`, `backend/ML/training/train_detector.ipynb`
- Test: `backend/ML/tests/test_colab_steps.py`

**Interfaces:**
- Produces in `colab_steps.py`:
  - `run_state(run_dir: str, epochs: int) -> str` returns `"new"`, `"resume"` or `"done"`.
    - `"new"`: `weights/last.pt` doesn't exist.
    - `"done"`: `results.csv` has `epochs` data rows, or the run has `weights/best.pt` and a file `finished` written by the notebook after training returns.
    - `"resume"`: otherwise.
  - `mark_finished(run_dir: str) -> None` writes `run_dir/finished`.
  - `missing_inputs(drive_dir: str) -> list[str]` returns whichever of `D-Fire-drony.zip`, `best.pt` and `training/compare.py` are missing, in that order.

Early stopping (`patience`) can end a run before `epochs`. The `finished` marker is what makes `"done"` reliable then.

- [ ] **Step 1: Write the failing tests**

```python
test_new_when_no_last_pt:              run_state(tmp/"A", 30) == "new"
test_resume_when_last_pt_unfinished:   create weights/last.pt and results.csv with header + 5 rows -> "resume"
test_done_when_all_epochs_logged:      header + 30 rows -> "done"
test_done_when_marked_finished:        last.pt + best.pt + header + 12 rows + mark_finished(...) -> "done"
test_missing_inputs_lists_in_order:    empty drive dir -> ["D-Fire-drony.zip", "best.pt", "training/compare.py"]
test_missing_inputs_empty_when_all_present: all three created -> []
```

- [ ] **Step 2: Run them to see them fail**

Run: `python -m unittest tests.test_colab_steps -v`
Expected: ERROR, `No module named 'training.colab_steps'`

- [ ] **Step 3: Implement `colab_steps.py`**

- [ ] **Step 4: Write `train_detector.ipynb`**

It's a valid nbformat-4 JSON file with one markdown cell titled "Drony fire detector retraining" plus one markdown note per step, and these code cells in order (spec §4.3):

1. **GPU check:** `import torch`; if `not torch.cuda.is_available()`, `raise SystemExit("No GPU: Runtime → Change runtime type → T4 GPU, then Run all again")`.
2. **Mount Drive and check inputs:**
   - `drive.mount('/content/drive')`
   - `DRIVE = '/content/drive/MyDrive/drony'`
   - `sys.path.insert(0, f'{DRIVE}/training')`
   - `from colab_steps import missing_inputs, run_state, mark_finished`
   - If anything is missing, `SystemExit` with the names. Note: the `missing_inputs` import itself needs `training/`; if that import fails, the cell catches `ImportError` and says to upload `training/`.
3. `!pip -q install ultralytics==8.4.176`
4. **Unpack the dataset:**
   - copy `D-Fire-drony.zip` to `/content` and unzip to `/content/dfire`
   - rewrite `/content/dfire/data.yaml`'s first line to `path: /content/dfire`
   - print the image counts per split
5. **Trial run:**
   - build `/content/trial` with 50 train and 10 val images, plus a `data.yaml`
   - run `YOLO('yolo11n.pt').train(data=..., epochs=1, imgsz=640, batch=16, project='/content/trial_runs', exist_ok=True)`
   - time it, then print `Estimated full epoch: ~N min` = elapsed × 13,776 / 50
6. **Candidate A:** `train_candidate('A', f'{DRIVE}/best.pt', epochs=30)`. The helper, defined in this cell, uses `run_state(f'{DRIVE}/runs/{name}', epochs)`:
   - `"done"`: print that it's skipped
   - `"resume"`: `YOLO(last.pt).train(resume=True)`
   - `"new"`: `YOLO(weights).train(data='/content/dfire/data.yaml', epochs=epochs, patience=10, imgsz=640, batch=32, project=f'{DRIVE}/runs', name=name, exist_ok=True)`
   - After training returns, `mark_finished`.
7. **Candidate B:** `train_candidate('B', 'yolo11n.pt', epochs=50)`.
8. **Compare:**
   - `from compare import main as compare_main`
   - `winner = compare_main({'old': f'{DRIVE}/best.pt', 'A': f'{DRIVE}/runs/A/weights/best.pt', 'B': f'{DRIVE}/runs/B/weights/best.pt'}, '/content/dfire/data.yaml', f'{DRIVE}/results.csv')`
   - If there's a winner, `shutil.copy` its best.pt to `f'{DRIVE}/best_v2.pt'` and print the name, size and `DETECT_IMGSZ` advice (960 → "set DETECT_IMGSZ=960"). Otherwise print "Keep the old model. Nothing copied."
9. **Optional severity (markdown + code, guarded by `RUN_SEVERITY = False`):** if `True`, train `yolov8n-cls.pt` on `f'{DRIVE}/severity'` for 30 epochs at imgsz 224, and copy the result to `f'{DRIVE}/best_severity_v2.pt'`.

- [ ] **Step 5: Run tests and validate the notebook**

Run: `python -m unittest`
Expected: OK

Run: `python -c "import json; nb=json.load(open('training/train_detector.ipynb', encoding='utf-8')); print(nb['nbformat'], len(nb['cells']))"`
Expected: `4` and a cell count ≥ 10

Run: `python -c "import ast, json; nb=json.load(open('training/train_detector.ipynb', encoding='utf-8')); [ast.parse(''.join(l for l in c['source'] if not l.lstrip().startswith('!'))) for c in nb['cells'] if c['cell_type']=='code']; print('ok')"`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add backend/ML/training/colab_steps.py backend/ML/training/train_detector.ipynb backend/ML/tests/test_colab_steps.py
git commit -m "feat(training): Colab notebook to train, resume and compare detector candidates"
```

---

### After the tasks: hand-off to the user

These aren't implementation tasks; report them in the final summary:

1. Look at the previews in `Downloads\D-Fire-drony-preview\`.
2. Upload `Downloads\D-Fire-drony.zip`, `backend\ML\best.pt` and the `backend\ML\training\` folder to `MyDrive/drony/`.
3. Open `MyDrive/drony/training/train_detector.ipynb` in Colab, choose a T4 GPU and Run all. Run all again after any disconnect.
4. Download `best_v2.pt` into `backend/ML/`, run `python evaluate.py --weights best_v2.pt`, then set `DETECTOR_WEIGHTS=best_v2.pt` if it's better.
