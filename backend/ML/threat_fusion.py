"""
threat_fusion.py
Computes a deterministic, transparent decision-fusion urgency/threat score (0-100)
combining severity, kinematic trend, bounding box footprint, and model confidence.
"""

def calculate_urgency_score(detection: dict, behavior: dict) -> int:
    """
    Computes a unified urgency score (0-100) fusing:
    - Severity tier (Mild, Moderate, Severe)
    - Kinematic behavior (Growing, Stable, Diminishing, Monitoring)
    - Bounding box area (physical footprint in pixels)
    - Detection confidence
    """
    # 1. Base weight from Severity Tier
    severity = detection.get("severity", "mild").lower()
    sev_weights = {"severe": 40, "moderate": 25, "mild": 10}
    score = sev_weights.get(severity, 10)

    # 2. Multiplier from Behavior Trend
    status = behavior.get("status", "STABLE").upper()
    beh_multipliers = {
        "GROWING": 1.8, 
        "STABLE": 1.0, 
        "DIMINISHING": 0.5, 
        "MONITORING": 1.0
    }
    score *= beh_multipliers.get(status, 1.0)

    # 3. Factor in Bounding Box Area (Scale impact)
    box = detection.get("box", [0, 0, 0, 0])
    width = box[2] - box[0]
    height = box[3] - box[1]
    pixel_area = width * height

    # Normalize area impact (assuming typical frame sizes, e.g., max ~100k pixels)
    area_factor = min(pixel_area / 50000.0, 1.5)  # Cap expansion weight
    score += (area_factor * 20)

    # 4. Factor in Detection Confidence
    conf = detection.get("confidence", 50.0) / 100.0
    score *= (0.8 + (0.2 * conf))

    # Clamp final score between 0 and 100
    return min(max(int(score), 0), 100)