"""
evaluate.py
Runs the fire/smoke pipeline over the test videos and compares today's raw
behaviour (baseline) with the stabilized settings from backend/.env.

    python evaluate.py [video ...] [--imgsz N]
"""
import argparse
import dataclasses
import glob
import os
import sys
import time

import cv2
from dotenv import load_dotenv

from pipeline import FramePipeline, PipelineSettings

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(HERE, "test_video")


def summarize(payloads):
    """Detection rates, on→off flickers and severity changes for one run."""
    frames = len(payloads)
    if frames == 0:
        return {"frames": 0, "fire_pct": 0.0, "smoke_pct": 0.0, "flickers": 0, "sev_changes": 0}

    flickers = 0
    sev_changes = 0
    for prev, cur in zip(payloads, payloads[1:]):
        for key in ("fireDetected", "smokeDetected"):
            if prev[key] and not cur[key]:
                flickers += 1
        if prev["fireDetected"] and cur["fireDetected"] and prev["fireSeverity"] != cur["fireSeverity"]:
            sev_changes += 1

    return {
        "frames": frames,
        "fire_pct": round(100.0 * sum(p["fireDetected"] for p in payloads) / frames, 1),
        "smoke_pct": round(100.0 * sum(p["smokeDetected"] for p in payloads) / frames, 1),
        "flickers": flickers,
        "sev_changes": sev_changes,
    }


def needs_separate_pass(baseline, stabilized):
    """
    The stabilized run can reuse the baseline detections only when it uses the
    same image size and is at least as strict on confidence.
    """
    return (stabilized.detect_imgsz != baseline.detect_imgsz
            or min(stabilized.fire_conf_min, stabilized.smoke_conf_min)
            < min(baseline.fire_conf_min, baseline.smoke_conf_min))


def default_load_models():
    from ultralytics import YOLO
    from severity import classify_fire_crop
    return YOLO(os.path.join(HERE, "best.pt")), classify_fire_crop


def evaluate_video(path, detector, classify, baseline, stabilized, separate_pass):
    cap = cv2.VideoCapture(path)
    width = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640
    height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 360
    base = FramePipeline(detector, classify, baseline, width, height)
    stab = FramePipeline(detector, classify, stabilized, width, height)

    base_payloads, stab_payloads = [], []
    base_ms, stab_ms = 0.0, 0.0
    frame_index = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame_index += 1

        t0 = time.perf_counter()
        detections = base.run_detector(frame)
        base_ms += (time.perf_counter() - t0) * 1000
        if separate_pass:
            t0 = time.perf_counter()
            stab_detections = stab.run_detector(frame)
            stab_ms += (time.perf_counter() - t0) * 1000
        else:
            # Same image size and at least as strict, so the baseline pass has everything it needs
            stab_detections = detections

        base_payloads.append(base.analyze(frame, detections, frame_index, ""))
        stab_payloads.append(stab.analyze(frame, stab_detections, frame_index, ""))
    cap.release()

    n = max(frame_index, 1)
    return (summarize(base_payloads), summarize(stab_payloads),
            base_ms / n, (stab_ms if separate_pass else base_ms) / n)


def main(argv, load_models=None):
    parser = argparse.ArgumentParser(description="Compare baseline and stabilized fire detection.")
    parser.add_argument("videos", nargs="*", help="video names in test_video/ (default: all .mp4)")
    parser.add_argument("--imgsz", help="detector image size for the stabilized run")
    args = parser.parse_args(argv)

    load_dotenv(os.path.join(HERE, "..", ".env"))
    try:
        stabilized = PipelineSettings.from_env(os.environ)
        if args.imgsz is not None:
            imgsz = PipelineSettings.from_env({"DETECT_IMGSZ": args.imgsz}).detect_imgsz
            stabilized = dataclasses.replace(stabilized, detect_imgsz=imgsz)
    except ValueError as e:
        print(f"Error: {e}")
        return 1
    baseline = PipelineSettings.baseline()
    separate_pass = needs_separate_pass(baseline, stabilized)

    names = args.videos or sorted(os.path.basename(p) for p in glob.glob(os.path.join(VIDEO_DIR, "*.mp4")))
    videos = []
    for name in names:
        path = os.path.join(VIDEO_DIR, name)
        cap = cv2.VideoCapture(path)
        if cap.isOpened():
            videos.append((name, path))
        else:
            print(f"Notice: cannot open {name}, skipping")
        cap.release()
    if not videos:
        print("Error: no video could be processed")
        return 1

    detector, classify = (load_models or default_load_models)()
    print(f"Stabilized settings: {stabilized}")
    header = (f"{'video':<26}{'frames':>7}  {'fire% base→stab':>16}  {'smoke% base→stab':>17}"
              f"  {'flickers base→stab':>19}  {'sev changes base→stab':>22}  {'ms/frame':>10}")
    print(header)
    print("-" * len(header))
    for name, path in videos:
        b, s, b_ms, s_ms = evaluate_video(path, detector, classify, baseline, stabilized, separate_pass)
        ms = f"{b_ms:.0f}/{s_ms:.0f}" if separate_pass else f"{s_ms:.0f}"
        print(f"{name:<26}{b['frames']:>7}  {b['fire_pct']:>7} → {s['fire_pct']:<6}"
              f"  {b['smoke_pct']:>8} → {s['smoke_pct']:<6}"
              f"  {b['flickers']:>9} → {s['flickers']:<7}"
              f"  {b['sev_changes']:>11} → {s['sev_changes']:<8}  {ms:>10}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
