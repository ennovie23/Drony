# Fire Detector Retraining (Stage 2) — Design

**Date:** 2026-10-17
**Status:** Approved in brainstorming, pending spec review
**Scope:** Retrain the fire/smoke detector (`backend/ML/best.pt`) on the public D-Fire dataset in Google Colab, compare it fairly with the current model, and make it easy to try and roll back on the laptop. Follows Stage 1 (`2026-10-16-fire-detection-stabilization-design.md`).

## 1. Goal

Stage 1 showed the detector itself is the weak point:

- Real fire boxes often score only 0.25–0.40 confidence, so raising thresholds loses real fires.
- At 640 px it finds fire in only about half of `severe.mp4`'s frames.

The original training data is unavailable. The model was trained by a teammate on unknown data; their dataset may arrive later and is out of scope here, apart from being mergeable by re-running the same pipeline.

Success means a new detector that, on D-Fire's official test set:

- **catches more fire and smoke (higher recall)**, and
- **raises false alarms no more than slightly (precision at most 0.02 below the current model)**.

`evaluate.py` on the local test videos must also look no worse. If no candidate meets this, the outcome is "keep the current model", and that is a valid result.

## 2. Decisions from brainstorming

- **Detector only.** The severity classifier (`best_severity.pt`) stays as it is. There's no labeled severity data, and a classifier trained on rule-made labels would learn noise. The notebook may include an optional, off-by-default severity section for when sorted crops exist.
- **No hand-labeling.** D-Fire's labels are used as they are.
- **Nano models only.** Live speed must stay about where it is today (7–10 analysed frames per second on the CPU-only laptop).
- **Two candidates, keep the winner:**
  - **A:** fine-tune the current `best.pt` (YOLOv10n).
  - **B:** train a fresh `yolo11n.pt`.
- **Training on Colab's free T4 GPU.** Estimated 3–6 hours in total, unattended, resumable.
- **Dataset preparation happens on the laptop**, so problems surface before any Colab time is spent.

## 3. The dataset, as verified on 2026-10-17

The user downloaded two files to `C:\Users\ncflr\Downloads\`:

- **`D-Fire.zip`** (3.04 GB):
  - `train/images` 17,221 jpg + `train/labels` 17,221 txt
  - `test/images` 4,306 + `test/labels` 4,306
  - YOLO format
- **`OneDrive_2026-10-16.zip`** (1.4 MB): the official split lists under `Data splitting/`:
  - `dfire_test.txt` (4,306 names), identical to the `test/` folder
  - `5-fold cross validation/dfire_train1.txt` (13,776) and `dfire_valid1.txt` (3,445). Together they equal the `train/` folder, with no overlap.

Verified facts the code checks for:

| Fact | Value |
|---|---|
| Class ids in D-Fire | **0 = smoke** (11,865 boxes), **1 = fire** (14,692 boxes), matching the README. Our model uses **0 = fire, 1 = smoke**, so the ids must be swapped. |
| Empty label files (no fire, no smoke) | 9,838. They are **kept** as negative examples, because they are what teaches the model not to fire on lamps, sunsets and fog. |
| Lines without exactly 5 fields | 0 |
| Boxes slightly outside the image, or zero-size | 26. Values go up to 1.056. They are **clipped** to [0, 1]; a box with zero width or height after clipping is dropped. Both counts are reported. |

## 4. Components

All new code is in `backend/ML/training/`. Logic lives in plain Python modules tested locally; the notebook only calls them.

### 4.1 `prepare_dfire.py` (runs on the laptop)

```
python training/prepare_dfire.py --images "C:\Users\ncflr\Downloads\D-Fire.zip" \
                                 --splits "C:\Users\ncflr\Downloads\OneDrive_2026-10-16.zip" \
                                 [--out "C:\Users\ncflr\Downloads"]
```

`--out` defaults to the folder containing `--images`. Steps:

1. **Free-space check:** at least 7 GB free on the `--out` drive, otherwise stop.
2. Read both zips directly, without extracting the originals anywhere else.
3. **Split by the official lists:**
   - `train` ← `dfire_train1.txt`
   - `val` ← `dfire_valid1.txt`
   - `test` ← `dfire_test.txt`
   Every listed image must exist in the zip, and every image must be in exactly one split. Otherwise stop.
4. **Rewrite each label:**
   - swap class `0↔1`
   - clip coordinates to [0, 1]: convert to corners, clip, convert back
   - drop boxes left with zero size
   A line that doesn't have 5 fields, has a class other than 0 or 1, or contains a non-number stops the script, naming the file and line.
5. **Check the counts** against §3: images per split 13,776 / 3,445 / 4,306, and total boxes 14,692 fire and 11,865 smoke minus any dropped boxes. A mismatch stops the script.
6. Write the working folder `<out>\D-Fire-drony\`:
   - `images\{train,val,test}\*.jpg`
   - `labels\{train,val,test}\*.txt`
   - `data.yaml` with `path: .`, `train: images/train`, `val: images/val`, `test: images/test`, `names: {0: fire, 1: smoke}`
7. Write **12 preview images** (fixed seed, at least 4 with fire, 4 with smoke and 2 empty) to `<out>\D-Fire-drony-preview\`. Each has boxes drawn and labelled "fire" or "smoke", for the user to eyeball.
8. Pack the working folder into `<out>\D-Fire-drony.zip`.
9. Print a summary: images, boxes per class per split, empty images per split, clipped and dropped box counts.

Re-running it overwrites its own outputs. It never modifies the input zips.

### 4.2 `compare.py` (runs in Colab; importable locally)

- `score(model_path, data_yaml, imgsz) -> dict` wraps Ultralytics `val` on the **test** split and returns `precision, recall, map50, map50_95, ms_per_image`.
- `pick_winner(rows, old_name, max_precision_drop=0.02) -> (name, imgsz) | None` applies this rule:
  - among candidates whose precision is ≥ the old model's precision **at the same image size** minus 0.02, **and** whose recall is higher than the old model's at that size, pick the highest recall
  - ties go to higher mAP50
  - `None` means "keep the old model"
- `main()` scores `old` (`best.pt`), `A` and `B` at imgsz 640 and 960, prints a table, prints the winner (or "keep the old model"), and writes `results.csv`.

### 4.3 `train_detector.ipynb` (Colab)

Cells, in order:

1. **Check the GPU:** if none, stop with "Runtime → Change runtime type → T4 GPU".
2. Mount Drive and check that `MyDrive/drony/` contains `D-Fire-drony.zip`, `best.pt` and `training/`. Name anything missing.
3. Install `ultralytics==8.4.176`, the same version as the laptop.
4. Copy the zip to `/content` (local disk, not Drive) and unzip. Rewrite `data.yaml`'s `path` to the unzip folder.
5. **Trial run:** 1 epoch on 50 training images, about 2 minutes, then print the estimated time for a full epoch.
6. **Candidate A:**
   - `YOLO('best.pt').train(data, epochs=30, patience=10, imgsz=640, batch=32, project=MyDrive/drony/runs, name='A', exist_ok=True)`
   - If `runs/A/weights/last.pt` exists and the run isn't finished, resume from it instead.
7. **Candidate B:** the same with `YOLO('yolo11n.pt')`, `epochs=50`, `name='B'`.
8. Run `compare.py`, then copy the winning `best.pt` to `MyDrive/drony/best_v2.pt` and `results.csv` to `MyDrive/drony/`. If there is no winner, say so and copy nothing.
9. (Optional, off by default) Severity training on `MyDrive/drony/severity/{mild,moderate,severe}/`, for when sorted crops exist.

Ultralytics' default augmentation (mosaic, flips, HSV colour and brightness jitter) is kept. Checkpoints are written every epoch to Drive, so a disconnect or a hit usage limit costs at most one epoch.

### 4.4 Laptop-side changes

- **`DETECTOR_WEIGHTS`** in `backend/.env` (default `best.pt`, a file name inside `backend/ML/`). `detect.py` loads it. A missing file stops `detect.py` at startup, naming the file.
- **`evaluate.py --weights <file>`** runs the evaluation with a different detector file (default: `DETECTOR_WEIGHTS`, else `best.pt`). The table header names the weights used.
- The winner is saved as `backend/ML/best_v2.pt`. **`best.pt` is never overwritten**, so rollback means removing the `DETECTOR_WEIGHTS` line.

## 5. User steps

1. (Done) Download `D-Fire.zip` and `OneDrive_2026-10-16.zip` to Downloads.
2. Run `prepare_dfire.py`, then look at the 12 preview images.
3. Upload `D-Fire-drony.zip`, `backend/ML/best.pt` and `backend/ML/training/` to `MyDrive/drony/`.
4. Open `train_detector.ipynb` in Colab, select a T4 GPU and choose Run all. Re-run after any disconnect.
5. Download `best_v2.pt` into `backend/ML/`, run `python evaluate.py --weights best_v2.pt`, and compare.
6. If happy, set `DETECTOR_WEIGHTS=best_v2.pt` in `backend/.env`.

## 6. Error handling

| Situation | Behaviour |
|---|---|
| Counts differ from §3, or a structurally broken label line | `prepare_dfire.py` stops, naming what and where |
| Less than 7 GB free | `prepare_dfire.py` stops before writing anything |
| No GPU in Colab | First cell stops with the menu path to fix it |
| Missing file on Drive | Cell 2 names the missing file |
| Disconnect or usage limit | Re-run resumes from `last.pt` |
| No candidate beats the old model | `compare.py` says "keep the old model" and nothing is copied |
| `DETECTOR_WEIGHTS` file missing | `detect.py` and `evaluate.py` stop at startup, naming it |

## 7. Testing

Use local `unittest` in `backend/ML/tests/`, in the existing style, with tiny fake zips built in the test and no real data or models:

- **`prepare_dfire`:**
  - class ids are swapped
  - empty labels are kept as empty files
  - splits follow the lists exactly
  - a listed image missing from the zip stops the script
  - a broken line (4 fields, class 2, non-number) stops it and names the file
  - out-of-range boxes are clipped, and zero-size boxes are dropped and counted
  - `data.yaml` content is correct
  - the expected counts are parameters, so fakes can use small numbers; the real run uses the §3 constants
- **`compare.pick_winner`:**
  - picks the higher recall
  - rejects a candidate whose precision drop is greater than 0.02
  - compares at the same image size
  - tie goes to mAP50
  - returns `None` when nothing qualifies
- **`DETECTOR_WEIGHTS`:** the default, an override, and a missing file stopping with its name.
- **`evaluate.py --weights`:** passes the chosen file to the model loader. Tested with the existing `load_models` hook.
- **Manual:**
  - the real `prepare_dfire.py` run, with its summary matching §3
  - the user's look at the preview images
  - the Colab trial-run cell
  - the final `results.csv` and an `evaluate.py --weights best_v2.pt` run

The notebook itself isn't unit-tested. Its trial-run cell is its smoke test.

## 8. Out of scope

- Severity retraining (optional notebook section only)
- Merging the teammate's dataset (later: add it to the prepared folder and re-run)
- Models larger than nano
- Exporting to ONNX/OpenVINO for faster CPU inference (a possible later speed-up)
