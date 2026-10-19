"""
compare.py
Scores the current detector and the retrained candidates on D-Fire's test set
and picks the winner: the most fire/smoke caught (recall) without raising false
alarms (precision) by more than 0.02 compared with the current model.
"""
import csv

COLUMNS = ["name", "imgsz", "precision", "recall", "map50", "map50_95", "ms_per_image"]


def pick_winner(rows, old_name="old", max_precision_drop=0.02):
    """
    Returns (name, imgsz) of the best candidate, or None to keep the old model.
    Each candidate is compared with the old model at the same image size.
    """
    old = {r["imgsz"]: r for r in rows if r["name"] == old_name}
    qualifying = []
    for r in rows:
        if r["name"] == old_name:
            continue
        if r["imgsz"] not in old:
            raise ValueError(f"no '{old_name}' score at imgsz {r['imgsz']} to compare {r['name']} with")
        base = old[r["imgsz"]]
        if r["precision"] >= base["precision"] - max_precision_drop and r["recall"] > base["recall"]:
            qualifying.append(r)
    if not qualifying:
        return None
    best = max(qualifying, key=lambda r: (r["recall"], r["map50"]))
    return best["name"], best["imgsz"]


def score(model_path, data_yaml, imgsz):
    """Validates one model on the test split and returns a result row."""
    from ultralytics import YOLO

    metrics = YOLO(model_path).val(data=data_yaml, split="test", imgsz=imgsz, batch=16, verbose=False)
    return {
        "imgsz": imgsz,
        "precision": float(metrics.box.mp),
        "recall": float(metrics.box.mr),
        "map50": float(metrics.box.map50),
        "map50_95": float(metrics.box.map),
        "ms_per_image": float(metrics.speed["inference"]),
    }


def main(models, data_yaml, out_csv, sizes=(640, 960)):
    """Scores every model at every size, prints the table and the verdict, writes the CSV."""
    rows = []
    for name, path in models.items():
        for imgsz in sizes:
            rows.append({"name": name, **score(path, data_yaml, imgsz)})

    print(f"{'model':<6}{'imgsz':>6}{'precision':>11}{'recall':>8}{'mAP50':>8}{'mAP50-95':>10}{'ms/img':>8}")
    for r in rows:
        print(f"{r['name']:<6}{r['imgsz']:>6}{r['precision']:>11.3f}{r['recall']:>8.3f}"
              f"{r['map50']:>8.3f}{r['map50_95']:>10.3f}{r['ms_per_image']:>8.1f}")

    with open(out_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    winner = pick_winner(rows)
    print(f"Winner: {winner[0]} @ {winner[1]}" if winner else "Keep the old model")
    return winner
