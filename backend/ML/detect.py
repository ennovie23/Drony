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
from pipeline import FramePipeline, PipelineSettings, detector_weights_path
from live_stream import LatestFrame, CaptureFlag, start_stream_server
from snapshot_trigger import SnapshotTrigger
from frame_grabber import FrameGrabber

# Load environment configuration from backend/.env
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(env_path)

# Detection tuning (thresholds, frame voting, severity smoothing); fail fast on bad values
try:
    settings = PipelineSettings.from_env(os.environ)
    model_path = detector_weights_path(os.environ, os.path.dirname(os.path.abspath(__file__)))
except ValueError as e:
    print(f"Error: {e}")
    exit(1)

# Frame source: "file" plays a test video, "webcam" reads the live camera
video_source = os.getenv("VIDEO_SOURCE", "file").strip().lower()
webcam_index = int(os.getenv("WEBCAM_INDEX", "0"))
stream_port = int(os.getenv("STREAM_PORT", "5002"))
snapshot_cooldown_s = float(os.getenv("SNAPSHOT_COOLDOWN_S", "60"))
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

# Load the custom-trained YOLO object detection model (DETECTOR_WEIGHTS picks the file)
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

# Retrieve frame dimensions to normalise bounding box coordinates into percentages
frame_width  = cap.get(cv2.CAP_PROP_FRAME_WIDTH)  or 640
frame_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 360

# Per-frame analysis: detection, confirmation, severity, trend and threat score
pipeline = FramePipeline(model, classify_fire_crop, settings, frame_width, frame_height)
print(f"Detection settings: {settings}")

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

    # Read the camera on its own thread so the stream runs at camera speed;
    # the models below analyse whichever frame is newest when they're free.
    def publish_frame(frame):
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            latest_frame.set(buf.tobytes())

    grabber = FrameGrabber(cap, on_frame=publish_frame)
    grabber.start()
    print(f"Starting detection on webcam {webcam_index} "
          f"(stream: http://localhost:{stream_port}/stream)...")
else:
    print(f"Starting detection on {os.path.basename(video_path)} @ {fps:.1f} FPS...")

frame_index = 0
grabbed_version = 0

while cap.isOpened():
    t_frame_start = time.time()

    if is_webcam:
        new_version, frame = grabber.wait_newer(grabbed_version, timeout=1.0)
        if grabber.lost:
            print(f"Error: Lost webcam {webcam_index} (no frames)")
            break
        if new_version == grabbed_version:
            continue
        grabbed_version = new_version
    else:
        ret, frame = cap.read()
        if not ret:
            # Loop video playback seamlessly when finished
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            if not ret:
                break
    frame_index += 1

    # Analyse the frame: confirmed fire/smoke, smoothed severity, trend and threat score
    frame_payload = pipeline.process(frame, frame_index, datetime.now(timezone.utc).isoformat())

    # Transmit consolidated frame assessment to the backend
    send_frame_assessment(frame_payload)

    # Save this frame as a snapshot on detection (cooldown) or manual request
    if is_webcam:
        trigger_kind = snapshot_trigger.check(frame_payload["fireDetected"], frame_payload["smokeDetected"],
                                              capture_flag.consume())
        # Encode the analysed frame (not the newest one) so the saved boxes match it
        ok, jpeg_buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80]) if trigger_kind else (False, None)
        if ok:
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

if is_webcam:
    grabber.stop()
cap.release()