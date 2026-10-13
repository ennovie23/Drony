import cv2
from ultralytics import YOLO
import requests
from datetime import datetime, timezone
import os
import time
import threading
import queue
import base64
from dotenv import load_dotenv
from severity import classify_fire_crop
from temporal_behavior import TemporalGrowthClassifier
from threat_fusion import calculate_urgency_score
from live_stream import LatestFrame, CaptureFlag, start_stream_server
from snapshot_trigger import SnapshotTrigger

# Load environment configuration from backend/.env
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(env_path)

# Frame source: "file" plays a test video, "webcam" reads the live camera
video_source = os.getenv("VIDEO_SOURCE", "file").strip().lower()
webcam_index = int(os.getenv("WEBCAM_INDEX", "0"))
stream_port = int(os.getenv("STREAM_PORT", "5002"))
snapshot_cooldown_s = float(os.getenv("SNAPSHOT_COOLDOWN_S", "5"))
is_webcam = video_source == "webcam"

if video_source == "file":
    video_filename = os.getenv("ACTIVE_VIDEO", "severe.mp4")
    video_path = os.path.join(os.path.dirname(__file__), "test_video", video_filename)

    if not os.path.exists(video_path):
        # Fallback to any available video in test_video folder
        test_dir = os.path.join(os.path.dirname(__file__), "test_video")
        available = [f for f in os.listdir(test_dir) if f.endswith(".mp4")]
        if available:
            video_path = os.path.join(test_dir, available[0])
            print(f"Notice: Configured video not found, using fallback: {available[0]}")
        else:
            print(f"Error: No test video found in {test_dir}")
            exit(1)
elif not is_webcam:
    print(f"Error: Unknown VIDEO_SOURCE '{video_source}' (expected 'file' or 'webcam')")
    exit(1)

# Load the custom-trained YOLO object detection model
model_path = os.path.join(os.path.dirname(__file__), "best.pt")
model = YOLO(model_path)

if is_webcam:
    cap = cv2.VideoCapture(webcam_index)
    if not cap.isOpened():
        print(f"Error: Unable to open webcam {webcam_index}")
        exit(1)
else:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Unable to open video source at {video_path}")
        exit(1)

# Initialize the temporal growth behavior tracker (rolling window for regression slope)
growth_tracker = TemporalGrowthClassifier(window_size=15)

# Retrieve frame dimensions to normalise bounding box coordinates into percentages
frame_width  = cap.get(cv2.CAP_PROP_FRAME_WIDTH)  or 640
frame_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 360

# Synchronize processing frame rate with the video's actual playback speed
fps = cap.get(cv2.CAP_PROP_FPS) or 30
frame_delay = 1.0 / fps

# Configure backend ingestion endpoints
backend_url = "http://localhost:5001/api/detections"
snapshots_url = "http://localhost:5001/api/snapshots"

def make_sender(url, maxsize, what):
    # Non-blocking async queue: the detection loop never waits on HTTP.
    # When the queue is full the oldest item is dropped in favour of the newest.
    send_queue = queue.Queue(maxsize=maxsize)

    def worker():
        while True:
            payload = send_queue.get()
            try:
                r = requests.post(url, json=payload, timeout=5)
                if not r.ok:
                    print(f"Backend rejected {what}:", r.status_code, r.text[:200])
            except Exception as e:
                print(f"Failed to send {what}:", e)
            finally:
                send_queue.task_done()

    threading.Thread(target=worker, daemon=True).start()

    def send(payload):
        if send_queue.full():
            try:
                send_queue.get_nowait()
                send_queue.task_done()
            except queue.Empty:
                pass
        try:
            send_queue.put_nowait(payload)
        except queue.Full:
            pass

    return send

send_frame_assessment = make_sender(backend_url, 1, "assessment")

if is_webcam:
    # Live stream for the Fire page + manual capture hook, and auto-snapshot policy
    latest_frame = LatestFrame()
    capture_flag = CaptureFlag()
    start_stream_server(stream_port, latest_frame, capture_flag)
    snapshot_trigger = SnapshotTrigger(snapshot_cooldown_s)
    send_snapshot = make_sender(snapshots_url, 2, "snapshot")
    print(f"Starting detection on webcam {webcam_index} "
          f"(stream: http://localhost:{stream_port}/stream)...")
else:
    print(f"Starting detection on {os.path.basename(video_path)} @ {fps:.1f} FPS...")

frame_index = 0
failed_reads = 0

while cap.isOpened():
    t_frame_start = time.time()

    ret, frame = cap.read()
    if not ret:
        if is_webcam:
            # Webcams occasionally drop a frame; give up after ~3 s of failures
            failed_reads += 1
            if failed_reads >= 30:
                print(f"Error: Lost webcam {webcam_index} (no frames)")
                break
            time.sleep(0.1)
            continue
        # Loop video playback seamlessly when finished
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ret, frame = cap.read()
        if not ret:
            break
    failed_reads = 0
    frame_index += 1

    if is_webcam:
        ok, jpeg_buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            latest_frame.set(jpeg_buf.tobytes())

    # Run primary YOLO inference on the current frame
    results = model(frame, conf=0.25, verbose=False)
    timestamp = datetime.now(timezone.utc).isoformat()

    # Step 1: Collect raw bounding box arrays for global temporal behavior evaluation
    frame_raw_detections = []
    boxes_payload = []
    
    fire_detections = []
    smoke_detections = []

    for result in results:
        for idx, box in enumerate(result.boxes):
            xyxy = box.xyxy[0].tolist()
            label = model.names[int(box.cls[0])]
            conf = float(box.conf[0])
            
            frame_raw_detections.append({
                "class": label,
                "box": xyxy
            })
            
            # Store normalized bounding box for frontend canvas overlay rendering
            boxes_payload.append({
                "id": f"{label}_{idx}",
                "label": label,
                "confidence": round(conf, 4),
                "bboxX1": round(xyxy[0] / frame_width  * 100, 4),
                "bboxY1": round(xyxy[1] / frame_height * 100, 4),
                "bboxX2": round(xyxy[2] / frame_width  * 100, 4),
                "bboxY2": round(xyxy[3] / frame_height * 100, 4),
            })

            x1_px = max(0, int(xyxy[0]))
            y1_px = max(0, int(xyxy[1]))
            x2_px = min(int(frame_width), int(xyxy[2]))
            y2_px = min(int(frame_height), int(xyxy[3]))
            crop = frame[y1_px:y2_px, x1_px:x2_px]

            if label == "fire":
                fire_detections.append({
                    "conf": conf,
                    "box": xyxy,
                    "crop": crop
                })
            elif label == "smoke":
                smoke_detections.append({
                    "conf": conf,
                    "box": xyxy,
                    "crop": crop
                })

    # Step 2: Evaluate growth kinematic trends across frames
    behavior_trends = growth_tracker.update_and_evaluate(frame_raw_detections)

    # Step 3: Aggregate Fire Telemetry (Fire is Primary Hazard)
    fire_detected = len(fire_detections) > 0
    fire_conf = None
    fire_severity = None
    fire_severity_conf = None
    fire_trend = None
    fire_trend_slope = None

    if fire_detected:
        primary_fire = max(fire_detections, key=lambda x: x["conf"])
        fire_conf = round(primary_fire["conf"] * 100, 2)
        
        # Evaluate secondary visual severity classifier on fire crop
        fire_severity, raw_sev_conf = classify_fire_crop(primary_fire["crop"])
        fire_severity_conf = round(raw_sev_conf * 100, 2) if raw_sev_conf <= 1.0 else round(raw_sev_conf, 2)

        fire_trend = behavior_trends["fire_behavior"]["status"]
        fire_trend_slope = behavior_trends["fire_behavior"]["trend_slope"]

    # Step 4: Aggregate Smoke Telemetry
    smoke_detected = len(smoke_detections) > 0
    smoke_conf = None
    smoke_trend = None
    smoke_trend_slope = None

    if smoke_detected:
        primary_smoke = max(smoke_detections, key=lambda x: x["conf"])
        smoke_conf = round(primary_smoke["conf"] * 100, 2)
        smoke_trend = behavior_trends["smoke_behavior"]["status"]
        smoke_trend_slope = behavior_trends["smoke_behavior"]["trend_slope"]

    # Step 5: Compute Decision Fusion Urgency Score (0-100)
    threat_score = 0
    if fire_detected:
        # Fire takes precedence for threat assessment
        threat_score = calculate_urgency_score(
            detection={
                "severity": fire_severity,
                "confidence": fire_conf,
                "box": primary_fire["box"]
            },
            behavior=behavior_trends["fire_behavior"]
        )
    elif smoke_detected:
        # If no fire is detected, evaluate urgency based on smoke plume
        threat_score = calculate_urgency_score(
            detection={
                "severity": "Minor",
                "confidence": smoke_conf,
                "box": primary_smoke["box"]
            },
            behavior=behavior_trends["smoke_behavior"]
        )

    # Step 6: Construct Unified Frame Telemetry Payload
    frame_payload = {
        "timestamp": timestamp,
        "fireDetected": fire_detected,
        "fireConfidence": fire_conf,
        "fireSeverity": fire_severity,
        "fireSeverityConf": fire_severity_conf,
        "fireTrend": fire_trend,
        "fireTrendSlope": fire_trend_slope,
        "smokeDetected": smoke_detected,
        "smokeConfidence": smoke_conf,
        "smokeTrend": smoke_trend,
        "smokeTrendSlope": smoke_trend_slope,
        "threatScore": int(threat_score),
        "frameIndex": frame_index,
        "boxes": boxes_payload
    }

    # Transmit consolidated frame assessment to the backend
    send_frame_assessment(frame_payload)

    # Save this frame as a snapshot on detection (cooldown) or manual request
    if is_webcam and ok:
        trigger_kind = snapshot_trigger.check(fire_detected, smoke_detected, capture_flag.consume())
        if trigger_kind:
            send_snapshot({
                "imageBase64": base64.b64encode(jpeg_buf.tobytes()).decode("ascii"),
                "trigger": trigger_kind,
                "assessment": frame_payload,
            })

    # Maintain real-time sync by throttling execution to match video frame rate
    if not is_webcam:
        elapsed = time.time() - t_frame_start
        sleep_for = frame_delay - elapsed
        if sleep_for > 0:
            time.sleep(sleep_for)

cap.release()