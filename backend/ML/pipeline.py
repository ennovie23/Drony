from dataclasses import dataclass

from stabilizer import PresenceVote, SeverityVote, filter_by_confidence, pad_box
from temporal_behavior import TemporalGrowthClassifier
from threat_fusion import calculate_urgency_score


def _setting(env, name, default, cast, check, range_text):
    raw = env.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = cast(raw.strip())
    except ValueError:
        raise ValueError(f"{name} must be {range_text} (got {raw!r})") from None
    if not check(value):
        raise ValueError(f"{name} must be {range_text} (got {raw!r})")
    return value


@dataclass(frozen=True)
class PipelineSettings:
    """Tuning for FramePipeline; see backend/.env for the variables."""

    fire_conf_min: float
    smoke_conf_min: float
    vote_k: int
    vote_n: int
    severity_window: int
    crop_pad: float
    detect_imgsz: int

    @classmethod
    def from_env(cls, env):
        vote_n = _setting(env, "VOTE_N", 5, int, lambda v: v >= 1, "an integer >= 1")
        return cls(
            fire_conf_min=_setting(env, "FIRE_CONF_MIN", 0.40, float,
                                   lambda v: 0 < v <= 1, "a number in (0, 1]"),
            smoke_conf_min=_setting(env, "SMOKE_CONF_MIN", 0.35, float,
                                    lambda v: 0 < v <= 1, "a number in (0, 1]"),
            vote_k=_setting(env, "VOTE_K", 3, int, lambda v: 1 <= v <= vote_n,
                            f"an integer from 1 to VOTE_N ({vote_n})"),
            vote_n=vote_n,
            severity_window=_setting(env, "SEVERITY_WINDOW", 9, int,
                                     lambda v: v >= 1, "an integer >= 1"),
            crop_pad=_setting(env, "CROP_PAD", 0.15, float,
                              lambda v: 0 <= v <= 1, "a number in [0, 1]"),
            detect_imgsz=_setting(env, "DETECT_IMGSZ", 640, int,
                                  lambda v: v >= 320 and v % 32 == 0,
                                  "an integer >= 320 and a multiple of 32"),
        )

    @classmethod
    def baseline(cls):
        """The behaviour before stabilization: every raw detection counts."""
        return cls(0.25, 0.25, 1, 1, 1, 0.0, 640)


class FramePipeline:
    """
    Turns one video frame into the assessment payload sent to the backend:
    detection, confidence filtering, K-of-N confirmation, smoothed severity,
    growth trend and threat score.
    """

    def __init__(self, detector, classify, settings, frame_width, frame_height):
        self.detector = detector
        self.classify = classify
        self.settings = settings
        self.frame_width = frame_width
        self.frame_height = frame_height
        self.fire_vote = PresenceVote(settings.vote_k, settings.vote_n)
        self.smoke_vote = PresenceVote(settings.vote_k, settings.vote_n)
        self.severity_vote = SeverityVote(settings.severity_window)
        self.growth_tracker = TemporalGrowthClassifier(window_size=15)
        # Strongest box of the most recent frame that had one, per class
        self.last_seen = {"fire": None, "smoke": None}

    def run_detector(self, frame):
        s = self.settings
        results = self.detector(frame, conf=min(s.fire_conf_min, s.smoke_conf_min),
                                imgsz=s.detect_imgsz, verbose=False)
        detections = []
        for result in results:
            for box in result.boxes:
                detections.append({
                    "label": self.detector.names[int(box.cls[0])],
                    "conf": float(box.conf[0]),
                    "box": [float(v) for v in box.xyxy[0].tolist()],
                })
        return detections

    def process(self, frame, frame_index, timestamp):
        return self.analyze(frame, self.run_detector(frame), frame_index, timestamp)

    def analyze(self, frame, detections, frame_index, timestamp):
        s = self.settings
        detections = filter_by_confidence(detections, s.fire_conf_min, s.smoke_conf_min)

        # Confirm each class over recent frames; hold the last box through a missed frame
        confirmed = {}
        primary = {}
        for label, vote in (("fire", self.fire_vote), ("smoke", self.smoke_vote)):
            current = [d for d in detections if d["label"] == label]
            if current:
                self.last_seen[label] = max(current, key=lambda d: d["conf"])
            is_confirmed = vote.update(bool(current)) and self.last_seen[label] is not None
            if not is_confirmed and not current:
                self.last_seen[label] = None
            confirmed[label] = is_confirmed
            primary[label] = self.last_seen[label] if is_confirmed else None

        behavior = self.growth_tracker.update_and_evaluate(
            [{"class": d["label"], "box": d["box"]} for d in detections])

        fire = primary["fire"]
        fire_severity = None
        fire_severity_conf = None
        if fire:
            x1, y1, x2, y2 = pad_box(fire["box"], s.crop_pad, self.frame_width, self.frame_height)
            crop = frame[int(y1):int(y2), int(x1):int(x2)]
            raw_label, raw_conf = self.classify(crop)
            fire_severity = self.severity_vote.update(raw_label)
            fire_severity_conf = round(raw_conf * 100, 2) if raw_conf <= 1.0 else round(raw_conf, 2)
        else:
            self.severity_vote.reset()

        smoke = primary["smoke"]
        threat_score = 0
        if fire:
            threat_score = calculate_urgency_score(
                detection={"severity": fire_severity,
                           "confidence": round(fire["conf"] * 100, 2),
                           "box": fire["box"]},
                behavior=behavior["fire_behavior"])
        elif smoke:
            threat_score = calculate_urgency_score(
                detection={"severity": "Minor",
                           "confidence": round(smoke["conf"] * 100, 2),
                           "box": smoke["box"]},
                behavior=behavior["smoke_behavior"])

        boxes = []
        for idx, d in enumerate(detections):
            if confirmed.get(d["label"]):
                boxes.append(self._box_payload(d, idx))
        for label in ("fire", "smoke"):
            if confirmed[label] and not any(d["label"] == label for d in detections):
                boxes.append(self._box_payload(primary[label], 0))

        return {
            "timestamp": timestamp,
            "fireDetected": fire is not None,
            "fireConfidence": round(fire["conf"] * 100, 2) if fire else None,
            "fireSeverity": fire_severity,
            "fireSeverityConf": fire_severity_conf,
            "fireTrend": behavior["fire_behavior"]["status"] if fire else None,
            "fireTrendSlope": behavior["fire_behavior"]["trend_slope"] if fire else None,
            "smokeDetected": smoke is not None,
            "smokeConfidence": round(smoke["conf"] * 100, 2) if smoke else None,
            "smokeTrend": behavior["smoke_behavior"]["status"] if smoke else None,
            "smokeTrendSlope": behavior["smoke_behavior"]["trend_slope"] if smoke else None,
            "threatScore": int(threat_score),
            "frameIndex": frame_index,
            "boxes": boxes,
        }

    def _box_payload(self, d, idx):
        x1, y1, x2, y2 = d["box"]
        return {
            "id": f"{d['label']}_{idx}",
            "label": d["label"],
            "confidence": round(d["conf"], 4),
            "bboxX1": round(x1 / self.frame_width * 100, 4),
            "bboxY1": round(y1 / self.frame_height * 100, 4),
            "bboxX2": round(x2 / self.frame_width * 100, 4),
            "bboxY2": round(y2 / self.frame_height * 100, 4),
        }
