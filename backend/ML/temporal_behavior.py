import numpy as np

class TemporalGrowthClassifier:
    def __init__(self, window_size=15):
        self.window_size = window_size
        self.fire_history = []
        self.smoke_history = []

    def update_and_evaluate(self, current_detections):
        """
        Analyzes sequences of frames to classify both fire and smoke behavior.
        """
        current_fire_area = 0
        current_smoke_area = 0

        for det in current_detections:
            cls = det.get("class", "").lower()
            box = det.get("box", [0, 0, 0, 0])  # expects [x1, y1, x2, y2] in pixels
            width = box[2] - box[0]
            height = box[3] - box[1]
            area = width * height

            if cls == "fire":
                current_fire_area += area
            elif cls == "smoke":
                current_smoke_area += area

        # 1. Update rolling histories
        self.fire_history.append(current_fire_area)
        self.smoke_history.append(current_smoke_area)

        if len(self.fire_history) > self.window_size:
            self.fire_history.pop(0)
        if len(self.smoke_history) > self.window_size:
            self.smoke_history.pop(0)

        # Helper function to compute trend metrics via np.polyfit
        def evaluate_metric(history):
            if len(history) < 5:
                return {"status": "MONITORING", "confidence": 0.0, "trend_slope": 0.0}
            
            x = np.arange(len(history))
            slope, _ = np.polyfit(x, history, 1)
            confidence = min(float(abs(slope) / 500.0), 1.0)

            if slope > 5.0:
                status = "GROWING"
            elif slope < -5.0:
                status = "DIMINISHING"
            else:
                status = "STABLE"

            return {
                "status": status,
                "confidence": round(confidence * 100, 1),
                "trend_slope": round(float(slope), 2)
            }

        return {
            "fire_behavior": evaluate_metric(self.fire_history),
            "smoke_behavior": evaluate_metric(self.smoke_history)
        }