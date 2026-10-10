import os
import cv2
from ultralytics import YOLO

print("Loading severity classification model...")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "best_severity.pt")
severity_model = YOLO(MODEL_PATH)

def classify_fire_crop(fire_crop):
    """
    Takes an OpenCV image crop (Region of Interest) of a detected fire or smoke 
    region and returns its mapped severity tier and confidence score.
    """
    if fire_crop is None or fire_crop.size == 0:
        return "Moderate", 0.0

    results = severity_model(fire_crop, verbose=False)

    top_class_idx = results[0].probs.top1
    confidence = results[0].probs.top1conf.item()
    raw_label = severity_model.names[top_class_idx].lower()

    label_mapping = {
        "mild": "Minor",
        "moderate": "Moderate",
        "severe": "Severe"
    }

    # Fallback to "Moderate" if an unexpected label is encountered
    severity_label = label_mapping.get(raw_label, "Moderate")

    return severity_label, confidence