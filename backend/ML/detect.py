import cv2
from ultralytics import YOLO
import requests
from datetime import datetime, timezone
import os
import time
from dotenv import load_dotenv

load_dotenv()
video_filename = os.getenv("ACTIVE_VIDEO", "smoke.mp4")
video_path = f"ML/test_video/{video_filename}"

model = YOLO("ML/best.pt")

cap = cv2.VideoCapture(video_path)

# Get frame dimensions for normalising bbox coordinates to percentages
frame_width  = cap.get(cv2.CAP_PROP_FRAME_WIDTH)  or 640
frame_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 360

# Real-time throttle: sleep between frames so detect.py stays in sync with the browser video
fps = cap.get(cv2.CAP_PROP_FPS) or 30
frame_delay = 1.0 / fps  # seconds to wait after processing each frame

# Your Node.js backend API endpoint
backend_url = "http://localhost:5001/api/detections"

# Send a small batch every N frames so the frontend gets frequent updates.
# 0.3 s at the video's fps → boxes refresh ~3 times per second in the browser.
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
        break

    results = model(frame, conf=0.25, verbose=False)
    timestamp = datetime.now(timezone.utc).isoformat()

    for result in results:
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2] in pixels
            # Normalise to 0-100 % so the frontend can overlay boxes directly
            pending.append({
                "timestamp": timestamp,
                "label": model.names[int(box.cls[0])],
                "confidence": float(box.conf[0]),
                "bboxX1": round(xyxy[0] / frame_width  * 100, 4),
                "bboxY1": round(xyxy[1] / frame_height * 100, 4),
                "bboxX2": round(xyxy[2] / frame_width  * 100, 4),
                "bboxY2": round(xyxy[3] / frame_height * 100, 4),
            })

    frame_index += 1
    if frame_index % batch_every_n_frames == 0:
        send_batch(pending)
        pending = []

    # Sleep for whatever time is left in this frame's budget so that
    # detect.py stays in sync with real-time video playback in the browser.
    elapsed = time.time() - t_frame_start
    sleep_for = frame_delay - elapsed
    if sleep_for > 0:
        time.sleep(sleep_for)


# Send whatever is left from the last partial batch
send_batch(pending)

cap.release()