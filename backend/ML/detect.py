import cv2
from ultralytics import YOLO
import requests
from datetime import datetime, timezone
import os
import time
from dotenv import load_dotenv
from severity import classify_fire_crop
from temporal_behavior import TemporalGrowthClassifier
from threat_fusion import calculate_urgency_score

# Load environment configuration and video stream source
load_dotenv()
video_filename = os.getenv("ACTIVE_VIDEO", "smoke.mp4")
video_path = os.path.join(os.path.dirname(__file__), "test_video", video_filename)

# Load the custom-trained YOLO object detection model
model_path = os.path.join(os.path.dirname(__file__), "best.pt")
model = YOLO(model_path)

cap = cv2.VideoCapture(video_path)

# Initialize the temporal growth behavior tracker (rolling window for regression slope)
growth_tracker = TemporalGrowthClassifier(window_size=15)

# Retrieve frame dimensions to normalise bounding box coordinates into percentages
frame_width  = cap.get(cv2.CAP_PROP_FRAME_WIDTH)  or 640
frame_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 360

# Synchronize processing frame rate with the video's actual playback speed
fps = cap.get(cv2.CAP_PROP_FPS) or 30
frame_delay = 1.0 / fps

# Configure backend ingestion endpoint and batching frequency
backend_url = "http://localhost:5001/api/detections"
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
        # Loop video playback seamlessly when finished
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ret, frame = cap.read()
        if not ret:
            break

    # Run primary YOLO inference on the current frame
    results = model(frame, conf=0.25, verbose=False)
    timestamp = datetime.now(timezone.utc).isoformat()

    # Step 1: Collect raw bounding box arrays for global temporal behavior evaluation
    frame_raw_detections = []
    for result in results:
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist()
            label = model.names[int(box.cls[0])]
            frame_raw_detections.append({
                "class": label,
                "box": xyxy
            })

    # Step 2: Evaluate growth kinematic trends (Growing, Stable, Diminishing) across frames
    behavior_trends = growth_tracker.update_and_evaluate(frame_raw_detections)

    # Step 3: Loop through detections again to evaluate secondary features and construct payload
    for result in results:
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist()
            label = model.names[int(box.cls[0])]

            # Map the detection to its respective fire or smoke behavior stream
            current_behavior = (
                behavior_trends["fire_behavior"] 
                if label == "fire" 
                else behavior_trends["smoke_behavior"]
            )

            x1_px, y1_px, x2_px, y2_px = map(int, xyxy)
            
            # Initialize default optional values for non-fire classes (like smoke)
            severity_label = None
            severity_conf = None
            urgency_score = 0

            # Step 4: Evaluate secondary features exclusively if the hazard is fire
            if label == "fire":
                fire_crop = frame[y1_px:y2_px, x1_px:x2_px]
                severity_label, severity_conf = classify_fire_crop(fire_crop)

                urgency_score = calculate_urgency_score(
                    detection={
                        "severity": severity_label,
                        "confidence": float(box.conf[0]) * 100,
                        "box": xyxy
                    },
                    behavior=current_behavior
                )

            # Append structured detection payload with normalisation
            pending.append({
                "timestamp": timestamp,
                "label": label,
                "confidence": float(box.conf[0]),
                "severity": severity_label,
                "severityConf": severity_conf,
                "trend": current_behavior["status"],
                "trendSlope": current_behavior["trend_slope"],
                "threatScore": urgency_score,
                "bboxX1": round(xyxy[0] / frame_width  * 100, 4),
                "bboxY1": round(xyxy[1] / frame_height * 100, 4),
                "bboxX2": round(xyxy[2] / frame_width  * 100, 4),
                "bboxY2": round(xyxy[3] / frame_height * 100, 4),
            })

    frame_index += 1
    if frame_index % batch_every_n_frames == 0:
        send_batch(pending)
        pending = []

    # Maintain real-time sync by throttling execution to match video frame rate
    elapsed = time.time() - t_frame_start
    sleep_for = frame_delay - elapsed
    if sleep_for > 0:
        time.sleep(sleep_for)

# Flush any remaining items in the final partial batch
send_batch(pending)
cap.release()