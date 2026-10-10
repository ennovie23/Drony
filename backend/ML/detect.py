import cv2
from ultralytics import YOLO
import requests
from datetime import datetime, timezone
import os
import time
from dotenv import load_dotenv
from severity import classify_fire_crop
from temporal_behavior import TemporalGrowthClassifier  # 1. Import your temporal behavior tracker

load_dotenv()
video_filename = os.getenv("ACTIVE_VIDEO", "smoke.mp4")
video_path = os.path.join(os.path.dirname(__file__), "test_video", video_filename)

model_path = os.path.join(os.path.dirname(__file__), "best.pt")
model = YOLO(model_path)

cap = cv2.VideoCapture(video_path)

# 2. Initialize the temporal growth behavior tracker (15-frame rolling window)
growth_tracker = TemporalGrowthClassifier(window_size=15)

# Get frame dimensions for normalising bbox coordinates to percentages
frame_width  = cap.get(cv2.CAP_PROP_FRAME_WIDTH)  or 640
frame_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 360

# Real-time throttle: sleep between frames so detect.py stays in sync with the browser video
fps = cap.get(cv2.CAP_PROP_FPS) or 30
frame_delay = 1.0 / fps  # seconds to wait after processing each frame

# Your Node.js backend API endpoint
backend_url = "http://localhost:5001/api/detections"

# Send a small batch every N frames so the frontend gets frequent updates.
BATCH_INTERVAL_SEC = 0.3
batch_every_n_frames = max(1, round(fps * BATCH_INTERVAL_SEC))
frame_index = 0
pending = []


def send_batch(batch):
    if not batch:
        return
    try:
        r = requests.post(backend_url, json=batch, timeout=5)
        if not r.ok:
            print("Backend rejected detections:", r.status_code, r.text)
    except Exception as e:
        print("Failed to send detections:", e)


while cap.isOpened():
    t_frame_start = time.time()

    ret, frame = cap.read()
    if not ret:
        # Seamlessly restart/loop video playback
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ret, frame = cap.read()
        if not ret:
            break

    results = model(frame, conf=0.25, verbose=False)
    timestamp = datetime.now(timezone.utc).isoformat()

    frame_raw_detections = []

    # 3. Step 1: Collect raw bounding boxes for the temporal tracker
    for result in results:
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2] in pixels
            label = model.names[int(box.cls[0])]
            frame_raw_detections.append({
                "class": label,
                "box": xyxy
            })

    # 4. Step 2: Evaluate temporal behavior trends for both fire and smoke globally in this frame
    behavior_trends = growth_tracker.update_and_evaluate(frame_raw_detections)

    # 5. Step 3: Loop through detections again to map trends, severity, and build the payload
    for result in results:
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist()
            label = model.names[int(box.cls[0])]

            # Select the appropriate trend dictionary based on object label
            current_behavior = (
                behavior_trends["fire_behavior"] 
                if label == "fire" 
                else behavior_trends["smoke_behavior"]
            )

            # Convert pixel coordinates to integers for cropping
            x1_px, y1_px, x2_px, y2_px = map(int, xyxy)
            
            # Slice the Region of Interest (ROI) from the frame
            fire_crop = frame[y1_px:y2_px, x1_px:x2_px]
            
            # Run secondary severity classification
            severity_label, severity_conf = classify_fire_crop(fire_crop)

            # Normalise to 0-100 % so the frontend can overlay boxes directly
            pending.append({
                "timestamp": timestamp,
                "label": label,
                "confidence": float(box.conf[0]),
                "severity": severity_label,
                "severityConf": float(severity_conf),
                "trend": current_behavior["status"],           # 'GROWING', 'STABLE', 'DIMINISHING', 'MONITORING'
                "trendSlope": current_behavior["trend_slope"], # Numerical slope value from regression
                "bboxX1": round(xyxy[0] / frame_width  * 100, 4),
                "bboxY1": round(xyxy[1] / frame_height * 100, 4),
                "bboxX2": round(xyxy[2] / frame_width  * 100, 4),
                "bboxY2": round(xyxy[3] / frame_height * 100, 4),
            })

    frame_index += 1
    if frame_index % batch_every_n_frames == 0:
        send_batch(pending)
        pending = []

    # Sleep for whatever time is left in this frame's budget
    elapsed = time.time() - t_frame_start
    sleep_for = frame_delay - elapsed
    if sleep_for > 0:
        time.sleep(sleep_for)


# Send whatever is left from the last partial batch
send_batch(pending)

cap.release()