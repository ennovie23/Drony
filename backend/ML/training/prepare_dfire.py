"""
prepare_dfire.py
Turns the D-Fire download into a ready-to-train YOLO dataset for Drony:
official train/val/test split, class ids swapped to Drony's order
(0 = fire, 1 = smoke), boxes clipped to the image.

    python training/prepare_dfire.py --images D-Fire.zip --splits OneDrive_....zip [--out DIR]
"""
import argparse
import os
import random
import shutil
import sys
import zipfile
from dataclasses import dataclass

import cv2

# D-Fire numbers smoke 0 and fire 1; Drony's model uses fire 0 and smoke 1
CLASS_SWAP = {0: 1, 1: 0}


class LabelError(ValueError):
    """A dataset problem that must stop preparation."""


def rewrite_label(text, source):
    """
    Rewrites one D-Fire label file for Drony.
    Returns (new_text, clipped_count, dropped_count).
    """
    lines = []
    clipped = 0
    dropped = 0
    for number, raw in enumerate(text.splitlines(), start=1):
        parts = raw.split()
        if not parts:
            continue
        if len(parts) != 5:
            raise LabelError(f"{source}: line {number} has {len(parts)} fields, expected 5")
        try:
            cls = int(parts[0])
            cx, cy, w, h = (float(p) for p in parts[1:])
        except ValueError:
            raise LabelError(f"{source}: line {number} is not numeric: {raw.strip()!r}") from None
        if cls not in CLASS_SWAP:
            raise LabelError(f"{source}: line {number} has class {cls}, expected 0 or 1")

        x1, y1, x2, y2 = cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2
        cx1, cy1, cx2, cy2 = (min(max(v, 0.0), 1.0) for v in (x1, y1, x2, y2))
        if cx2 - cx1 <= 0 or cy2 - cy1 <= 0:
            dropped += 1
            continue
        if (cx1, cy1, cx2, cy2) != (x1, y1, x2, y2):
            clipped += 1
        lines.append(f"{CLASS_SWAP[cls]} {(cx1 + cx2) / 2:.6f} {(cy1 + cy2) / 2:.6f} "
                     f"{cx2 - cx1:.6f} {cy2 - cy1:.6f}")

    return ("\n".join(lines) + "\n" if lines else ""), clipped, dropped


def assign_splits(image_names, lists):
    """
    Maps every image to "train", "val" or "test" using the official lists.
    Every listed image must exist and every image must be listed exactly once.
    """
    assignment = {}
    duplicates = set()
    for split, names in lists.items():
        for name in names:
            if name in assignment:
                duplicates.add(name)
            assignment[name] = split

    if duplicates:
        raise LabelError(f"images listed in more than one split: {', '.join(sorted(duplicates)[:5])}")
    missing = sorted(set(assignment) - set(image_names))
    if missing:
        raise LabelError(f"listed images missing from the zip: {', '.join(missing[:5])}")
    unlisted = sorted(set(image_names) - set(assignment))
    if unlisted:
        raise LabelError(f"images not in any split list: {', '.join(unlisted[:5])}")
    return assignment


@dataclass(frozen=True)
class Expected:
    """Image counts per split and box counts per (Drony) class before any are dropped."""

    train: int
    val: int
    test: int
    fire: int
    smoke: int


# Verified against the 2026-10 download (see the Stage 2 spec, section 3)
DFIRE_EXPECTED = Expected(train=13776, val=3445, test=4306, fire=14692, smoke=11865)

SPLIT_LISTS = {
    "train": "Data splitting/5-fold cross validation/dfire_train1.txt",
    "val": "Data splitting/5-fold cross validation/dfire_valid1.txt",
    "test": "Data splitting/dfire_test.txt",
}
SPLITS = ("train", "val", "test")
CLASS_NAMES = {0: "fire", 1: "smoke"}
DATA_YAML = ("path: .\ntrain: images/train\nval: images/val\ntest: images/test\n"
             "names:\n  0: fire\n  1: smoke\n")
DATASET_DIR = "D-Fire-drony"
PREVIEW_DIR = "D-Fire-drony-preview"
DATASET_ZIP = "D-Fire-drony.zip"


def _read_lists(splits_zip):
    with zipfile.ZipFile(splits_zip) as z:
        return {split: set(z.read(path).decode("utf-8").split()) for split, path in SPLIT_LISTS.items()}


def _input_boxes_by_class(text):
    """Boxes in a raw D-Fire label, counted under Drony's class names."""
    counts = {"fire": 0, "smoke": 0}
    for line in text.splitlines():
        parts = line.split()
        if parts:
            counts[CLASS_NAMES[CLASS_SWAP[int(parts[0])]]] += 1
    return counts


def _write_previews(dataset_dir, items, preview_dir, count):
    """Draws boxes on a fixed-seed sample of training images for a visual check."""
    names = sorted(items)
    random.Random(0).shuffle(names)

    def has(name, cls):
        return any(line.startswith(f"{cls} ") for line in items[name].splitlines())

    picked = []
    for wanted, limit in ((lambda n: has(n, 0), 4), (lambda n: has(n, 1), 4), (lambda n: items[n] == "", 2)):
        picked += [n for n in names if wanted(n) and n not in picked][:limit]
    picked += [n for n in names if n not in picked]

    os.makedirs(preview_dir)
    for i, name in enumerate(picked[:count], start=1):
        image = cv2.imread(os.path.join(dataset_dir, "images", "train", name))
        h, w = image.shape[:2]
        for line in items[name].splitlines():
            cls, cx, cy, bw, bh = line.split()
            cls = int(cls)
            cx, bw = float(cx) * w, float(bw) * w
            cy, bh = float(cy) * h, float(bh) * h
            color = (0, 0, 255) if cls == 0 else (200, 200, 200)
            p1 = (int(cx - bw / 2), int(cy - bh / 2))
            p2 = (int(cx + bw / 2), int(cy + bh / 2))
            cv2.rectangle(image, p1, p2, color, 2)
            cv2.putText(image, CLASS_NAMES[cls], (p1[0], max(p1[1] - 4, 12)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        cv2.imwrite(os.path.join(preview_dir, f"preview_{i:02d}.jpg"), image)


def prepare(images_zip, splits_zip, out_dir, expected=DFIRE_EXPECTED,
            min_free_bytes=7 * 10**9, preview_count=12):
    """
    Builds <out>/D-Fire-drony/ (images, labels, data.yaml), preview images and
    <out>/D-Fire-drony.zip. Everything is checked before old outputs are replaced.
    """
    if shutil.disk_usage(out_dir).free < min_free_bytes:
        raise LabelError(f"not enough free space in {out_dir}: need {min_free_bytes / 1e9:.0f} GB free")

    lists = _read_lists(splits_zip)
    with zipfile.ZipFile(images_zip) as z:
        entries = set(z.namelist())
        images = {}  # file name -> path inside the zip
        for entry in entries:
            parts = entry.split("/")
            if len(parts) == 3 and parts[1] == "images" and parts[2].lower().endswith(".jpg"):
                images[parts[2]] = entry
        splits = assign_splits(set(images), lists)

        # Read and rewrite every label in memory before touching the output folder
        labels = {}
        clipped = dropped = 0
        input_boxes = {"fire": 0, "smoke": 0}
        for name, entry in images.items():
            label_entry = entry.replace("/images/", "/labels/")[:-4] + ".txt"
            if label_entry not in entries:
                raise LabelError(f"no label file for {name} (expected {label_entry})")
            raw = z.read(label_entry).decode("utf-8")
            labels[name], c, d = rewrite_label(raw, label_entry)
            clipped += c
            dropped += d
            for cls, n in _input_boxes_by_class(raw).items():
                input_boxes[cls] += n

        image_counts = {s: sum(1 for v in splits.values() if v == s) for s in SPLITS}
        for split in SPLITS:
            if image_counts[split] != getattr(expected, split):
                raise LabelError(f"{split} has {image_counts[split]} images, expected {getattr(expected, split)}")
        for cls in ("fire", "smoke"):
            if input_boxes[cls] != getattr(expected, cls):
                raise LabelError(f"found {input_boxes[cls]} {cls} boxes, expected {getattr(expected, cls)}")

        # All checks passed: replace any earlier outputs
        dataset_dir = os.path.join(out_dir, DATASET_DIR)
        preview_dir = os.path.join(out_dir, PREVIEW_DIR)
        dataset_zip = os.path.join(out_dir, DATASET_ZIP)
        for path in (dataset_dir, preview_dir):
            shutil.rmtree(path, ignore_errors=True)
        if os.path.exists(dataset_zip):
            os.remove(dataset_zip)

        for split in SPLITS:
            os.makedirs(os.path.join(dataset_dir, "images", split))
            os.makedirs(os.path.join(dataset_dir, "labels", split))
        boxes = {s: {"fire": 0, "smoke": 0} for s in SPLITS}
        empty = {s: 0 for s in SPLITS}
        for name, entry in images.items():
            split = splits[name]
            with z.open(entry) as src, open(os.path.join(dataset_dir, "images", split, name), "wb") as dst:
                shutil.copyfileobj(src, dst)
            with open(os.path.join(dataset_dir, "labels", split, name[:-4] + ".txt"), "w", newline="\n") as f:
                f.write(labels[name])
            lines = labels[name].splitlines()
            empty[split] += not lines
            for line in lines:
                boxes[split][CLASS_NAMES[int(line.split()[0])]] += 1

    with open(os.path.join(dataset_dir, "data.yaml"), "w", newline="\n") as f:
        f.write(DATA_YAML)
    train_items = {n: labels[n] for n, s in splits.items() if s == "train"}
    _write_previews(dataset_dir, train_items, preview_dir, preview_count)

    with zipfile.ZipFile(dataset_zip, "w", zipfile.ZIP_STORED) as out:
        for root, _, files in os.walk(dataset_dir):
            for file in files:
                path = os.path.join(root, file)
                out.write(path, os.path.relpath(path, dataset_dir).replace(os.sep, "/"))

    return {"images": image_counts, "boxes": boxes, "empty": empty, "clipped": clipped,
            "dropped": dropped, "dataset_zip": dataset_zip, "preview_dir": preview_dir}


def main(argv):
    parser = argparse.ArgumentParser(description="Prepare D-Fire for Drony training.")
    parser.add_argument("--images", required=True, help="D-Fire.zip (images and labels)")
    parser.add_argument("--splits", required=True, help="zip with the 'Data splitting' lists")
    parser.add_argument("--out", help="output folder (default: the folder of --images)")
    args = parser.parse_args(argv)
    out_dir = args.out or os.path.dirname(os.path.abspath(args.images))

    try:
        summary = prepare(args.images, args.splits, out_dir)
    except (LabelError, OSError, zipfile.BadZipFile) as e:
        print(f"Error: {e}")
        return 1

    for split in SPLITS:
        b = summary["boxes"][split]
        print(f"{split:<6} {summary['images'][split]:>6} images  {b['fire']:>6} fire  "
              f"{b['smoke']:>6} smoke  {summary['empty'][split]:>5} empty")
    print(f"Boxes clipped to the image: {summary['clipped']}, dropped: {summary['dropped']}")
    print(f"Dataset zip: {summary['dataset_zip']}")
    print(f"Preview images: {summary['preview_dir']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
