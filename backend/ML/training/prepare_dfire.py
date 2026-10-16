"""
prepare_dfire.py
Turns the D-Fire download into a ready-to-train YOLO dataset for Drony:
official train/val/test split, class ids swapped to Drony's order
(0 = fire, 1 = smoke), boxes clipped to the image.
"""

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
