import cv2
from ultralytics import YOLO
import requests
from datetime import datetime, timezone
import os 
from dotenv import load_dotenv

load_dotenv()
video_filename = os.getenv("ACTIVE_VIDEO", "smoke.mp4")
video_path = f"ML/test_video/{video_filename}"

model = YOLO("ML/best.pt")

cap = cv2.VideoCapture(video_path)

# Your Node.js backend API endpoint
backend_url = "http://localhost:5001/api/detections"

# Collect detections from every frame and send them in one request about once per second
BATCH_INTERVAL_SEC = 1.0
fps = cap.get(cv2.CAP_PROP_FPS) or 30
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
    ret, frame = cap.read()
    if not ret:
        break

    results = model(frame, conf=0.25)
    timestamp = datetime.now(timezone.utc).isoformat()

    for result in results:
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
            pending.append({
                "timestamp": timestamp,
                "label": model.names[int(box.cls[0])],
                "confidence": float(box.conf[0]),
                "bboxX1": xyxy[0],
                "bboxY1": xyxy[1],
                "bboxX2": xyxy[2],
                "bboxY2": xyxy[3]
            })

    frame_index += 1
    if frame_index % batch_every_n_frames == 0:
        send_batch(pending)
        pending = []

    # Display video feed with bounding boxes locally
    annotated_frame = results[0].plot()
    cv2.imshow("Drony Fire Detection", annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

# Send whatever is left from the last partial batch
send_batch(pending)

cap.release()
cv2.destroyAllWindows()